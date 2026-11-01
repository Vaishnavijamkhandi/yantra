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

# Universal column aliases to support CSV exports from ANY organization, cloud provider, or CMDB
COLUMN_ALIASES: dict[str, list[str]] = {
    "asset_name": ["asset_name", "hostname", "host_name", "name", "device_name", "asset", "system_name", "server_name", "endpoint", "title", "host"],
    "asset_type": ["asset_type", "type", "device_type", "category", "hardware_type", "role", "kind", "asset_category"],
    "ip_address": ["ip_address", "ip", "address", "host_ip", "network_address", "ipv4", "ip_addr", "private_ip", "public_ip"],
    "operating_system": ["operating_system", "os", "platform", "os_version", "system", "os_name", "operating_system_version"],
    "criticality": ["criticality", "priority", "business_impact", "severity", "tier", "critical", "importance", "business_criticality"],
    "exposure": ["exposure", "network_exposure", "facing", "access_type", "zone", "network_zone", "public_facing", "internet_facing"],
    "department": ["department", "business_unit", "team", "dept", "division", "organization", "owner", "group", "cost_center", "unit"],
    "environment": ["environment", "env", "stage", "deployment_env", "lifecycle", "env_type"],
    "software": ["software", "installed_software", "packages", "applications", "services", "apps"],
    "software_version": ["software_version", "version", "app_version"],
}


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


# ── BULK DELETE ───────────────────────────────────────────────────────────────

@router.delete("/bulk/delete", status_code=200)
def bulk_delete_assets(ids: list[int], db: Session = Depends(get_db)):
    """Delete multiple assets by ID in a single request.

    Accepts a JSON body that is a plain array of integers, e.g. [1, 2, 3].
    Returns counts of how many were found and deleted vs. not found.
    """
    if not ids:
        raise HTTPException(status_code=400, detail="No asset IDs provided")
    assets = db.query(Asset).filter(Asset.id.in_(ids)).all()
    if not assets:
        raise HTTPException(status_code=404, detail="None of the provided IDs were found")
    deleted = len(assets)
    for asset in assets:
        db.delete(asset)
    db.commit()
    logger.info("🗑️ [BULK DELETE] Removed %d asset(s): ids=%s", deleted, ids)
    not_found = len(ids) - deleted
    return {
        "deleted": deleted,
        "not_found": not_found,
        "message": f"Deleted {deleted} asset(s) successfully.",
    }


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
    if not reader.fieldnames:
        raise HTTPException(status_code=400, detail="Uploaded CSV file is empty or corrupted.")

    def _norm(s: str) -> str:
        return s.lower().strip().replace(" ", "").replace("_", "").replace("-", "")

    # Match column aliases dynamically (case-insensitive and punctuation/whitespace-stripped)
    raw_headers = list(reader.fieldnames)
    header_map = {}

    for target_key, aliases in COLUMN_ALIASES.items():
        norm_aliases = {_norm(a) for a in aliases}
        for col in raw_headers:
            if _norm(col) in norm_aliases:
                header_map[target_key] = col
                break

    if "asset_name" not in header_map:
        raise HTTPException(
            status_code=400,
            detail=(
                "Could not detect an asset name or hostname column. "
                "Supported headers: 'asset_name', 'hostname', 'name', 'device_name', 'host', 'system_name'."
            ),
        )

    imported = 0
    errors = []

    for row_num, raw_row in enumerate(reader, start=2):
        row = {k: (v.strip() if v else "") for k, v in raw_row.items() if k}
        name_val = row.get(header_map["asset_name"], "").strip()
        if not name_val:
            errors.append(f"Row {row_num}: Missing asset name or hostname")
            continue

        # Inferred or defaulted asset type
        type_val = row.get(header_map.get("asset_type", ""), "").strip()
        if not type_val:
            nl = name_val.lower()
            if any(k in nl for k in ["db", "database", "postgres", "sql", "mongo"]):
                type_val = "Database"
            elif any(k in nl for k in ["router", "gateway", "switch"]):
                type_val = "Router"
            elif any(k in nl for k in ["firewall", "fw", "waf", "asa"]):
                type_val = "Firewall"
            elif any(k in nl for k in ["pc", "workstation", "laptop", "desktop"]):
                type_val = "Computer"
            elif any(k in nl for k in ["iot", "sensor", "cam", "printer", "embedded"]):
                type_val = "IoT"
            elif any(k in nl for k in ["app", "api", "web", "portal", "service"]):
                type_val = "Application"
            else:
                type_val = "Server"

        # Criticality
        crit_raw = row.get(header_map.get("criticality", ""), "").strip().lower()
        if "crit" in crit_raw or crit_raw in ["4", "tier 1", "tier1"]:
            crit_val = "Critical"
        elif "high" in crit_raw or crit_raw in ["3", "tier 2", "tier2"]:
            crit_val = "High"
        elif "low" in crit_raw or crit_raw in ["1", "tier 4", "tier4"]:
            crit_val = "Low"
        else:
            crit_val = "Medium"

        # Exposure
        exp_raw = row.get(header_map.get("exposure", ""), "").strip().lower()
        if any(e in exp_raw for e in ["ext", "pub", "wan", "internet", "dmz"]):
            exp_val = "External"
        else:
            exp_val = "Internal"

        ip_val = row.get(header_map.get("ip_address", ""), "").strip() or None
        os_val = row.get(header_map.get("operating_system", ""), "").strip() or None
        dept_val = row.get(header_map.get("department", ""), "").strip() or "Operations"
        env_val = row.get(header_map.get("environment", ""), "").strip() or "Production"

        existing = (
            db.query(Asset)
            .filter(Asset.asset_name == name_val, Asset.ip_address == ip_val)
            .first()
        )
        if existing:
            logger.info("📦 [CSV IMPORT] Asset '%s' already exists in local DB; skipping duplicate insert.", name_val)
            continue

        logger.info("📥 [CSV IMPORT] New asset '%s' detected; storing in local DB for future cache lookup.", name_val)
        asset = Asset(
            asset_name=name_val,
            asset_type=type_val.title(),
            ip_address=ip_val,
            operating_system=os_val,
            criticality=crit_val,
            exposure=exp_val,
            department=dept_val,
            environment=env_val,
        )

        sw_raw = row.get(header_map.get("software", ""), "").strip()
        sw_ver = row.get(header_map.get("software_version", ""), "").strip() or "1.0"
        if sw_raw:
            items = [s.strip() for s in sw_raw.replace(";", ",").split(",") if s.strip()]
            for item in items:
                asset.software.append(
                    AssetSoftware(
                        software_name=item,
                        version=sw_ver,
                        software_type="Application",
                    )
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

