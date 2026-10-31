import csv
import io
from sqlalchemy import select, func
from sqlalchemy.orm import Session, selectinload
from app.models import Asset, AssetSoftware
from app.schemas.asset import AssetCreate, AssetUpdate


def create_asset(db: Session, payload: AssetCreate) -> Asset:
    data = payload.model_dump(exclude={"software"})
    asset = Asset(**data)
    for item in payload.software:
        asset.software.append(AssetSoftware(**item.model_dump()))
    db.add(asset)
    db.commit()
    db.refresh(asset)
    return asset


def get_asset(db: Session, asset_id: str) -> Asset | None:
    return db.scalar(select(Asset).options(selectinload(Asset.software)).where(Asset.id == asset_id))


def list_assets(db: Session, page: int = 1, page_size: int = 20, search: str | None = None, criticality: str | None = None):
    stmt = select(Asset).options(selectinload(Asset.software))
    count_stmt = select(func.count(Asset.id))
    if search:
        stmt = stmt.where(Asset.asset_name.ilike(f"%{search}%"))
        count_stmt = count_stmt.where(Asset.asset_name.ilike(f"%{search}%"))
    if criticality:
        stmt = stmt.where(Asset.criticality == criticality)
        count_stmt = count_stmt.where(Asset.criticality == criticality)
    total = db.scalar(count_stmt) or 0
    items = db.scalars(stmt.order_by(Asset.asset_name).offset((page - 1) * page_size).limit(page_size)).all()
    return items, total


def update_asset(db: Session, asset: Asset, payload: AssetUpdate) -> Asset:
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(asset, key, value)
    db.commit()
    db.refresh(asset)
    return asset


def import_assets_csv(db: Session, content: bytes) -> dict:
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise ValueError("CSV must be UTF-8 encoded.")
    reader = csv.DictReader(io.StringIO(text))
    required = {"asset_name", "asset_type"}
    if not reader.fieldnames or not required.issubset(set(reader.fieldnames)):
        raise ValueError("CSV must include at least asset_name and asset_type columns.")
    created, errors = [], []
    for line, row in enumerate(reader, start=2):
        try:
            name = (row.get("asset_name") or "").strip()
            kind = (row.get("asset_type") or "").strip()
            if not name or not kind:
                raise ValueError("asset_name and asset_type are required")
            from app.models.asset import Criticality, Exposure
            criticality = (row.get("criticality") or "medium").strip().lower()
            exposure = (row.get("exposure") or "internal").strip().lower()
            asset = Asset(
                asset_name=name, asset_type=kind,
                ip_address=(row.get("ip_address") or "").strip() or None,
                operating_system=(row.get("operating_system") or "").strip() or None,
                criticality=Criticality(criticality), exposure=Exposure(exposure),
                department=(row.get("department") or "").strip() or None,
                environment=(row.get("environment") or "simulated").strip() or "simulated",
            )
            sw_name = (row.get("software_name") or "").strip()
            if sw_name:
                asset.software.append(AssetSoftware(
                    vendor=(row.get("vendor") or "").strip() or None,
                    software_name=sw_name,
                    software_version=(row.get("software_version") or "").strip() or None,
                    cpe_name=(row.get("cpe_name") or "").strip() or None,
                ))
            db.add(asset)
            db.flush()
            created.append(asset.id)
        except Exception as exc:
            errors.append({"row": line, "error": str(exc)})
    db.commit()
    return {"created": len(created), "asset_ids": created, "errors": errors}
