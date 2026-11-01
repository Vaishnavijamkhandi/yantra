import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.auth import create_access_token, seed_default_users
from app.db.database import Base, get_db
from app.main import app
from app.models.asset import Asset, AssetSoftware
from app.models.gap import InfrastructureGap
from app.services.gap_analysis import generate_gap_analysis, update_gap_status


@pytest.fixture
def gap_db():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    db = Session()
    try:
        yield db
    finally:
        db.close()


def create_asset(db, **overrides):
    payload = {
        "asset_name": "Test Asset",
        "asset_type": "Server",
        "ip_address": "10.0.0.10",
        "operating_system": "Ubuntu 22.04",
        "criticality": "Medium",
        "exposure": "Internal",
        "department": "Operations",
        "environment": "Production",
    }
    payload.update(overrides)
    asset = Asset(**payload)
    db.add(asset)
    db.commit()
    db.refresh(asset)
    return asset


def test_missing_vendor_detection(gap_db):
    asset = create_asset(gap_db, asset_name="PLC-001", asset_type="IoT", criticality="Critical", exposure="External", department="Operations", environment="Production")
    asset.software.append(AssetSoftware(software_name="Modbus Gateway", vendor=None, version="1.0", software_type="Protocol"))
    gap_db.commit()

    gaps = generate_gap_analysis(gap_db)
    assert any(g["title"] == "Missing manufacturer/vendor information" and g["asset_id"] == asset.id for g in gaps)


def test_missing_version_detection(gap_db):
    asset = create_asset(gap_db, asset_name="SCADA-002", asset_type="IoT", criticality="High", exposure="External")
    asset.software.append(AssetSoftware(software_name="OpenSSH", vendor="OpenBSD", version="Unknown", software_type="Service"))
    gap_db.commit()

    gaps = generate_gap_analysis(gap_db)
    assert any(g["title"] == "Unknown software or firmware version" and g["asset_id"] == asset.id for g in gaps)


def test_missing_owner_detection(gap_db):
    asset = create_asset(gap_db, department=None)
    gaps = generate_gap_analysis(gap_db)
    assert any(g["title"] == "Missing asset owner" and g["asset_id"] == asset.id for g in gaps)


def test_unknown_exposure_detection(gap_db):
    asset = create_asset(gap_db, exposure="Unknown")
    gaps = generate_gap_analysis(gap_db)
    assert any(g["title"] == "Unknown internet exposure" and g["asset_id"] == asset.id for g in gaps)


def test_missing_criticality_detection(gap_db):
    asset = create_asset(gap_db, criticality="Unknown")
    gaps = generate_gap_analysis(gap_db)
    assert any(g["title"] == "Missing asset criticality" and g["asset_id"] == asset.id for g in gaps)


def test_unsupported_product_detection(gap_db):
    asset = create_asset(gap_db, asset_name="RTU-404", asset_type="IoT", criticality="High", exposure="Internal")
    asset.software.append(AssetSoftware(software_name="Custom PLC Runtime", vendor=None, version="Unknown", software_type="Firmware"))
    gap_db.commit()

    gaps = generate_gap_analysis(gap_db)
    assert any(g["title"] == "Unsupported product or version identification" and g["asset_id"] == asset.id for g in gaps)


def test_missing_dependency_detection_for_critical_asset(gap_db):
    asset = create_asset(gap_db, asset_name="Substation-01", asset_type="IoT", criticality="Critical", exposure="External")
    gaps = generate_gap_analysis(gap_db)
    assert any(g["title"] == "Critical asset has no documented dependencies" and g["asset_id"] == asset.id for g in gaps)


def test_gap_severity_assignment(gap_db):
    asset = create_asset(gap_db, asset_name="Hospital-PACS-Gateway", asset_type="Server", criticality="Critical", exposure="External")
    asset.software.append(AssetSoftware(software_name="Linux Service", vendor=None, version="Unknown", software_type="OS"))
    gap_db.commit()

    gaps = generate_gap_analysis(gap_db)
    vendor_gap = next(g for g in gaps if g["title"] == "Missing manufacturer/vendor information" and g["asset_id"] == asset.id)
    assert vendor_gap["severity"] == "HIGH"


def test_duplicate_prevention(gap_db):
    asset = create_asset(gap_db, asset_name="Core-Plant-DB", asset_type="Server", criticality="High", exposure="External")
    asset.software.append(AssetSoftware(software_name="PostgreSQL", vendor=None, version="Unknown", software_type="Database"))
    gap_db.commit()

    first = generate_gap_analysis(gap_db)
    second = generate_gap_analysis(gap_db)
    assert len(first) == len(second)
    assert len({(g["asset_id"], g["title"]) for g in second}) == len(second)


def test_gap_status_updates(gap_db):
    asset = create_asset(gap_db, asset_name="Auth-Gateway", asset_type="Server")
    gap_db.add(InfrastructureGap(asset_id=asset.id, title="Missing asset owner", category="asset_information", severity="MEDIUM", status="open", reason="owner missing", recommendation="assign owner"))
    gap_db.commit()

    updated = update_gap_status(gap_db, 1, "in_progress")
    assert updated.status == "in_progress"


def test_gap_api_runs_without_authentication():
    client = TestClient(app)
    resp = client.get("/api/gaps")
    assert resp.status_code == 200


def test_gap_api_allows_analyst_and_admin_access(gap_db):
    client = TestClient(app)
    app.dependency_overrides[get_db] = lambda: gap_db
    seed_default_users(gap_db)
    analyst_token = create_access_token({"sub": "analyst"})
    admin_token = create_access_token({"sub": "admin"})

    analyst_headers = {"Authorization": f"Bearer {analyst_token}"}
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    resp = client.get("/api/gaps", headers=analyst_headers)
    assert resp.status_code == 200
    resp2 = client.get("/api/gaps", headers=admin_headers)
    assert resp2.status_code == 200
    app.dependency_overrides.clear()


def test_gap_api_filtering_and_summary_statistics(gap_db):
    client = TestClient(app)
    app.dependency_overrides[get_db] = lambda: gap_db
    seed_default_users(gap_db)
    token = create_access_token({"sub": "analyst"})
    headers = {"Authorization": f"Bearer {token}"}

    asset_a = create_asset(gap_db, asset_name="A-Plant-Node", asset_type="Server", criticality="Critical", exposure="External")
    asset_b = create_asset(gap_db, asset_name="B-Plant-Node", asset_type="Server", criticality="Medium", exposure="Internal")

    asset_a.software.append(AssetSoftware(software_name="Nginx", vendor=None, version="Unknown", software_type="Service"))
    asset_b.software.append(AssetSoftware(software_name="Nginx", vendor="NGINX", version="1.25", software_type="Service"))
    gap_db.commit()

    analyze = client.post("/api/gaps/analyze", headers=headers)
    assert analyze.status_code == 200

    filtered = client.get("/api/gaps?severity=HIGH&status=open&category=asset_information", headers=headers)
    assert filtered.status_code == 200
    payload = filtered.json()
    assert isinstance(payload, list)

    summary = client.get("/api/gaps/summary", headers=headers)
    assert summary.status_code == 200
    summary_payload = summary.json()
    assert summary_payload["total_gaps"] >= 1
    assert summary_payload["high_severity_gaps"] >= 0
    app.dependency_overrides.clear()
