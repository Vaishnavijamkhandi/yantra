import csv
import io
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.models.asset import Asset, AssetSoftware, AssetDependency
from app.services.risk_engine import assess_dependency_impact
from app.schemas.asset import (
    AssetCreate,
    AssetUpdate,
    AssetResponse,
    ImportReport,
    CsvValidationReport,
    CsvRowValidation,
    ValidatedImportRequest,
    SoftwareCreate,
)

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


# ── CREATE ────────────────────────────────────────────────────────────────────

@router.post("/", response_model=AssetResponse, status_code=201)
def create_asset(data: AssetCreate, db: Session = Depends(get_db)):
    asset_dict = data.model_dump(exclude={"software"})
    asset = Asset(**asset_dict)
    for sw in data.software:
        asset.software.append(AssetSoftware(**sw.model_dump()))
    db.add(asset)
    db.commit()
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

    return query.order_by(Asset.id.desc()).offset(offset).limit(limit).all()


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

    # Match column aliases dynamically (case-insensitive and whitespace-stripped)
    raw_headers = list(reader.fieldnames)
    header_map = {}

    for target_key, aliases in COLUMN_ALIASES.items():
        for col in raw_headers:
            clean_col = col.lower().strip().replace(" ", "_").replace("-", "")
            if clean_col in [a.replace("_", "") for a in aliases]:
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
        imported += 1

    db.commit()
    return ImportReport(imported=imported, failed=len(errors), errors=errors)


@router.post("/validate-csv", response_model=CsvValidationReport)
async def validate_csv(
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

    raw_headers = list(reader.fieldnames)
    header_map = {}
    for target_key, aliases in COLUMN_ALIASES.items():
        for col in raw_headers:
            clean_col = col.lower().strip().replace(" ", "_").replace("-", "")
            if clean_col in [a.replace("_", "") for a in aliases]:
                header_map[target_key] = col
                break

    if "asset_name" not in header_map:
        raise HTTPException(
            status_code=400,
            detail="Could not detect an asset name or hostname column in CSV.",
        )

    existing_db_names = {a[0].lower().strip() for a in db.query(Asset.asset_name).all() if a[0]}
    seen_in_csv = set()

    rows: list[CsvRowValidation] = []
    valid_count = 0
    invalid_count = 0
    dup_count = 0

    for idx, raw_row in enumerate(reader, start=2):
        row = {k: (v.strip() if v else "") for k, v in raw_row.items() if k}
        name_val = row.get(header_map["asset_name"], "").strip()

        row_errors = []
        row_warnings = []
        is_dup = False

        if not name_val:
            row_errors.append("Missing asset name")
        else:
            nl = name_val.lower()
            if nl in seen_in_csv:
                is_dup = True
                dup_count += 1
                row_warnings.append("Duplicate asset name inside this CSV")
            elif nl in existing_db_names:
                is_dup = True
                dup_count += 1
                row_warnings.append("Asset with this name already exists in inventory")
            seen_in_csv.add(nl)

        type_val = row.get(header_map.get("asset_type", ""), "").strip()
        if not type_val and name_val:
            nl = name_val.lower()
            if any(k in nl for k in ["db", "database", "postgres", "sql"]):
                type_val = "Database"
            elif any(k in nl for k in ["router", "gateway", "switch"]):
                type_val = "Router"
            elif any(k in nl for k in ["firewall", "fw", "waf"]):
                type_val = "Firewall"
            elif any(k in nl for k in ["pc", "workstation", "laptop"]):
                type_val = "Computer"
            elif any(k in nl for k in ["iot", "sensor", "plc", "scada"]):
                type_val = "IoT"
            else:
                type_val = "Server"

        crit_raw = row.get(header_map.get("criticality", ""), "").strip().lower()
        if "crit" in crit_raw or crit_raw in ["4", "tier 1"]:
            crit_val = "Critical"
        elif "high" in crit_raw or crit_raw in ["3", "tier 2"]:
            crit_val = "High"
        elif "low" in crit_raw or crit_raw in ["1", "tier 4"]:
            crit_val = "Low"
        else:
            crit_val = "Medium"

        exp_raw = row.get(header_map.get("exposure", ""), "").strip().lower()
        if any(e in exp_raw for e in ["ext", "pub", "wan", "internet", "dmz"]):
            exp_val = "External"
        else:
            exp_val = "Internal"

        ip_val = row.get(header_map.get("ip_address", ""), "").strip() or None
        os_val = row.get(header_map.get("operating_system", ""), "").strip() or None
        dept_val = row.get(header_map.get("department", ""), "").strip() or "Operations"
        env_val = row.get(header_map.get("environment", ""), "").strip() or "Production"

        sw_raw = row.get(header_map.get("software", ""), "").strip()
        sw_ver = row.get(header_map.get("software_version", ""), "").strip() or "1.0"
        sw_items = [s.strip() for s in sw_raw.replace(";", ",").split(",") if s.strip()] if sw_raw else []

        if not ip_val:
            row_warnings.append("Missing host IP address")
        if not os_val:
            row_warnings.append("Missing operating system specification")

        is_val = len(row_errors) == 0
        if is_val:
            valid_count += 1
        else:
            invalid_count += 1

        rows.append(CsvRowValidation(
            row_index=idx,
            asset_name=name_val or f"Row-{idx}",
            asset_type=type_val.title() if type_val else "Server",
            ip_address=ip_val,
            operating_system=os_val,
            criticality=crit_val,
            exposure=exp_val,
            department=dept_val,
            environment=env_val,
            software=sw_items,
            software_version=sw_ver,
            is_valid=is_val,
            is_duplicate=is_dup,
            errors=row_errors,
            warnings=row_warnings,
        ))

    return CsvValidationReport(
        total_rows=len(rows),
        valid_rows_count=valid_count,
        invalid_rows_count=invalid_count,
        duplicate_count=dup_count,
        detected_headers=header_map,
        rows=rows,
    )


@router.post("/import-validated", response_model=ImportReport)
def import_validated_assets(
    payload: ValidatedImportRequest,
    db: Session = Depends(get_db),
):
    imported = 0
    errors = []

    for item in payload.rows:
        try:
            asset_dict = item.model_dump(exclude={"software"})
            asset = Asset(**asset_dict)
            for sw in item.software:
                asset.software.append(AssetSoftware(**sw.model_dump()))
            db.add(asset)
            imported += 1
        except Exception as e:
            errors.append(f"Error importing {item.asset_name}: {str(e)}")

    db.commit()
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


@router.get("/{asset_id}/impact")
def asset_impact(asset_id: int, db: Session = Depends(get_db)):
    asset = db.query(Asset).filter(Asset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    return assess_dependency_impact(asset, db)

