import csv
import io
import logging
from pathlib import Path
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.models.asset import Asset, AssetSoftware, AssetDependency
from app.models.vulnerability import Vulnerability
from app.services.nvd_service import search_cves
from app.services.risk_engine import assess_dependency_impact
from app.schemas.asset import (
    AssetCreate,
    AssetUpdate,
    AssetResponse,
    ImportReport,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/assets", tags=["Assets"])

REQUIRED_CSV_COLUMNS = {"asset_name", "asset_type", "criticality", "exposure"}


def queue_background_ml(background_tasks: BackgroundTasks) -> None:
    """Schedule the ML workflow after asset import so the upload remains fast."""
    logger.info("🧠 [AUTO ML] Queuing background ML pipeline after asset upload.")
    background_tasks.add_task(_trigger_background_ml_after_import)


async def _trigger_background_ml_after_import() -> None:
    """Load EPSS when needed and train anomaly/supervised models in the background."""
    from app.db.database import SessionLocal
    from app.ml.anomaly import train_anomaly_model
    from app.ml.epss_loader import load_epss_csv
    from app.ml.supervised import train_supervised_models
    from app.models.ml_models import EPSSScore
    from app.routes.ml import _resolve_epss_path

    try:
        with SessionLocal() as session:
            asset_count = session.query(Asset).count()
            if asset_count == 0:
                logger.info("🧠 [AUTO ML] No assets in DB; skipping ML pipeline.")
                return

            epss_count = session.query(EPSSScore).count()
            csv_path = _resolve_epss_path()
            if epss_count == 0 and csv_path.exists():
                logger.info("🧠 [AUTO ML] EPSS data not loaded; importing %s", csv_path)
                try:
                    load_epss_csv(csv_path, session)
                except Exception as exc:  # pragma: no cover - background guard
                    logger.warning("🧠 [AUTO ML] EPSS import failed: %s", exc)
                    return

            if session.query(EPSSScore).count() == 0:
                logger.info("🧠 [AUTO ML] No EPSS dataset available for background training; skipping ML.")
                return

            try:
                result = train_anomaly_model(session)
                logger.info("🧠 [AUTO ML] anomaly model trained: %s", result)
            except Exception as exc:
                logger.warning("🧠 [AUTO ML] anomaly training failed in background: %s", exc)

            try:
                result = train_supervised_models(session)
                logger.info("🧠 [AUTO ML] supervised models trained: %s", result)
            except Exception as exc:
                logger.warning("🧠 [AUTO ML] supervised training failed in background: %s", exc)
    except Exception as exc:  # pragma: no cover - background safeguard
        logger.exception("🧠 [AUTO ML] background ML pipeline crashed: %s", exc)


# ── CREATE ────────────────────────────────────────────────────────────────────

async def _enrich_asset_from_nvd(asset: Asset, db: Session) -> None:
    """Cache exact asset OS/software CVEs from NVD only when the local DB has no match."""
    candidates: list[str] = []
    if asset.operating_system:
        candidates.append(asset.operating_system)
    if asset.asset_name:
        candidates.append(asset.asset_name)
    for sw in asset.software:
        if sw.software_name:
            candidates.append(sw.software_name)
        if sw.vendor:
            candidates.append(sw.vendor)

    seen: set[str] = set()
    for value in candidates:
        cleaned = value.strip()
        if not cleaned or cleaned.lower() in seen:
            continue
        seen.add(cleaned.lower())

        cached = (
            db.query(Vulnerability)
            .filter(
                Vulnerability.description.ilike(f"%{cleaned}%")
                | Vulnerability.affected_products.ilike(f"%{cleaned}%")
            )
            .first()
        )
        if cached:
            logger.info("📦 [ASSET CACHE] Existing CVE data already found for '%s'; skipping NVD fetch.", cleaned)
            continue

        logger.info("🌐 [ASSET LOOKUP] Asset '%s' missing local data for '%s'; fetching exact NVD records.", asset.asset_name, cleaned)
        try:
            await search_cves(cleaned, limit=25, db=db)
        except Exception as exc:  # pragma: no cover - defensive for upstream NVD outage
            logger.warning(
                "⚠️ [ASSET ENRICHMENT] NVD lookup for asset '%s' using '%s' failed; asset remains saved but enrichment was skipped: %s",
                asset.asset_name,
                cleaned,
                exc,
            )
        return


@router.post("/", response_model=AssetResponse, status_code=201)
async def create_asset(data: AssetCreate, db: Session = Depends(get_db)):
    asset_dict = data.model_dump(exclude={"software"})
    asset = Asset(**asset_dict)
    for sw in data.software:
        asset.software.append(AssetSoftware(**sw.model_dump()))
    db.add(asset)
    db.commit()
    db.refresh(asset)
    await _enrich_asset_from_nvd(asset, db)
    db.refresh(asset)
    return asset


# ── READ ALL (with search + filters + pagination) ─────────────────────────────

@router.get("/", response_model=list[AssetResponse])
def list_assets(
    search: str | None = Query(default=None),
    criticality: str | None = Query(default=None),
    asset_type: str | None = Query(default=None),
    exposure: str | None = Query(default=None),
    environment: str | None = Query(default=None),
    limit: int = Query(default=100, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    query = db.query(Asset)

    if search:
        term = f"%{search}%"
        query = query.filter(
            Asset.asset_name.ilike(term)
            | Asset.ip_address.ilike(term)
            | Asset.asset_type.ilike(term)
            | Asset.department.ilike(term)
        )
    if criticality:
        query = query.filter(Asset.criticality == criticality)
    if asset_type:
        query = query.filter(Asset.asset_type == asset_type)
    if exposure:
        query = query.filter(Asset.exposure == exposure)
    if environment:
        query = query.filter(Asset.environment == environment)

    return query.offset(offset).limit(limit).all()


# ── STATIC ROUTES FIRST TO AVOID SHADOWING BY /{asset_id} ─────────────────────

@router.get("/infrastructure-map")
def infrastructure_map(db: Session = Depends(get_db)):
    assets = db.query(Asset).all()
    nodes = []
    edges = []
    for asset in assets:
        nodes.append(
            {
                "id": asset.id,
                "label": asset.asset_name,
                "type": asset.asset_type,
                "criticality": asset.criticality,
                "department": asset.department,
            }
        )

    for asset in assets:
        for dep in asset.outgoing_dependencies:
            edges.append(
                {
                    "from": dep.source_asset_id,
                    "to": dep.target_asset_id,
                    "strength": dep.dependency_strength,
                    "impact": dep.service_impact,
                }
            )

    return {"nodes": nodes, "edges": edges, "asset_count": len(assets)}


# ── READ ONE ──────────────────────────────────────────────────────────────────

@router.get("/{asset_id}", response_model=AssetResponse)
def get_asset(asset_id: int, db: Session = Depends(get_db)):
    asset = db.query(Asset).filter(Asset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    return asset


# ── UPDATE (partial PATCH) ────────────────────────────────────────────────────

@router.patch("/{asset_id}", response_model=AssetResponse)
def update_asset(asset_id: int, data: AssetUpdate, db: Session = Depends(get_db)):
    asset = db.query(Asset).filter(Asset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    update_data = data.model_dump(exclude_none=True)
    for field, value in update_data.items():
        setattr(asset, field, value)

    db.commit()
    db.refresh(asset)
    return asset


# ── DELETE ────────────────────────────────────────────────────────────────────

@router.delete("/{asset_id}", status_code=200)
def delete_asset(asset_id: int, db: Session = Depends(get_db)):
    asset = db.query(Asset).filter(Asset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    db.delete(asset)
    db.commit()
    return {"message": f"Asset {asset_id} deleted"}


# ── CSV IMPORT ────────────────────────────────────────────────────────────────

@router.post("/import", response_model=ImportReport)
async def import_assets(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Please upload a CSV file")

    content = await file.read()
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="File must be UTF-8 encoded")

    reader = csv.DictReader(io.StringIO(text))

    if not reader.fieldnames or not REQUIRED_CSV_COLUMNS.issubset(set(reader.fieldnames)):
        missing = REQUIRED_CSV_COLUMNS - set(reader.fieldnames or [])
        raise HTTPException(
            status_code=400,
            detail=f"Missing required CSV columns: {', '.join(missing)}",
        )

    imported = 0
    errors: list[str] = []

    for row_num, row in enumerate(reader, start=2):  # row 1 = header
        row = {k: (v.strip() if v else v) for k, v in row.items()}
        asset_name = row.get("asset_name", "").strip()
        asset_type = row.get("asset_type", "").strip()
        criticality = row.get("criticality", "").strip()
        exposure = row.get("exposure", "").strip()

        if not asset_name or not asset_type or not criticality or not exposure:
            errors.append(f"Row {row_num}: missing required value")
            continue

        existing = (
            db.query(Asset)
            .filter(Asset.asset_name == asset_name, Asset.ip_address == (row.get("ip_address") or None))
            .first()
        )
        if existing:
            logger.info("📦 [CSV IMPORT] Asset '%s' already exists in local DB; skipping duplicate insert.", asset_name)
            continue

        logger.info("📥 [CSV IMPORT] New asset '%s' detected; storing in local DB for future cache lookup.", asset_name)
        asset = Asset(
            asset_name=asset_name,
            asset_type=asset_type,
            ip_address=row.get("ip_address") or None,
            operating_system=row.get("operating_system") or None,
            criticality=criticality,
            exposure=exposure,
            department=row.get("department") or None,
            environment=row.get("environment") or "Simulated",
        )
        db.add(asset)
        db.commit()
        db.refresh(asset)
        await _enrich_asset_from_nvd(asset, db)
        imported += 1

    if imported > 0:
        queue_background_ml(background_tasks)

    logger.info("✅ [CSV IMPORT COMPLETE] imported=%d failed=%d file=%s", imported, len(errors), file.filename)
    return ImportReport(imported=imported, failed=len(errors), errors=errors)


@router.post("/{asset_id}/dependencies")
def add_asset_dependency(
    asset_id: int,
    target_asset_id: int = Query(...),
    dependency_type: str = Query(default="depends_on"),
    dependency_strength: float = Query(default=0.5),
    service_impact: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    source = db.query(Asset).filter(Asset.id == asset_id).first()
    target = db.query(Asset).filter(Asset.id == target_asset_id).first()
    if not source or not target:
        raise HTTPException(status_code=404, detail="Asset not found")

    dep = AssetDependency(
        source_asset_id=source.id,
        target_asset_id=target.id,
        dependency_type=dependency_type,
        dependency_strength=max(0.0, min(1.0, dependency_strength)),
        service_impact=service_impact,
    )
    db.add(dep)
    db.commit()
    db.refresh(dep)
    return {
        "id": dep.id,
        "source_asset_id": dep.source_asset_id,
        "target_asset_id": dep.target_asset_id,
        "dependency_type": dep.dependency_type,
        "dependency_strength": dep.dependency_strength,
        "service_impact": dep.service_impact,
    }


@router.get("/{asset_id}/dependencies")
def list_asset_dependencies(asset_id: int, db: Session = Depends(get_db)):
    asset = db.query(Asset).filter(Asset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    dependencies = []
    for dep in asset.outgoing_dependencies:
        target = dep.target_asset
        dependencies.append(
            {
                "id": dep.id,
                "source_asset_id": dep.source_asset_id,
                "target_asset_id": dep.target_asset_id,
                "target_asset_name": target.asset_name,
                "dependency_type": dep.dependency_type,
                "dependency_strength": dep.dependency_strength,
                "service_impact": dep.service_impact,
            }
        )
    return dependencies


@router.get("/{asset_id}/impact")
def asset_impact(asset_id: int, db: Session = Depends(get_db)):
    asset = db.query(Asset).filter(Asset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    return assess_dependency_impact(asset, db)

