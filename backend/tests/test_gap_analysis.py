import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi import HTTPException

from app.db.database import Base
from app.models.asset import Asset, AssetSoftware, AssetDependency
from app.models.gap import InfrastructureGap
from app.schemas.gap import GapUpdate
from app.services.gap_service import analyze_infrastructure_gaps, get_gap_summary, GapDetector
from app.routes.gaps import (
    run_gap_analysis,
    gap_summary,
    list_gaps,
    get_gap,
    update_gap_status,
)


@pytest.fixture
def test_db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    db = Session()
    try:
        yield db
    finally:
        db.close()


# ── TEST 1: Missing vendor detection ──────────────────────────────────────────

def test_missing_vendor_detection(test_db):
    asset = Asset(
        asset_name="Billing App Server",
        asset_type="Server",
        criticality="High",
        exposure="Internal",
        department="Finance",
        environment="Production",
        ip_address="10.0.1.15",
        operating_system="Ubuntu 22.04",
    )
    test_db.add(asset)
    test_db.commit()

    sw = AssetSoftware(
        asset_id=asset.id,
        software_name="CustomInvoicingDaemon",
        vendor=None,  # MISSING VENDOR
        version="2.1.0",
        software_type="Application",
    )
    test_db.add(sw)
    test_db.commit()

    detector = GapDetector(asset, test_db)
    gaps = detector.run_all()
    vendor_gaps = [g for g in gaps if g["gap_type"] == "missing_vendor"]

    assert len(vendor_gaps) == 1
    assert "CustomInvoicingDaemon" in vendor_gaps[0]["gap_title"]
    assert vendor_gaps[0]["category"] == "Asset Information"
    assert "vendor/manufacturer" in vendor_gaps[0]["reason"].lower()


# ── TEST 2: Missing / unknown version detection ───────────────────────────────

def test_missing_version_detection(test_db):
    asset = Asset(
        asset_name="Core Database Node",
        asset_type="Database",
        criticality="Critical",
        exposure="Internal",
        department="Data Engineering",
        environment="Production",
        ip_address="10.0.2.10",
        operating_system="Debian 11",
    )
    test_db.add(asset)
    test_db.commit()

    sw = AssetSoftware(
        asset_id=asset.id,
        software_name="PostgreSQL",
        vendor="PostgreSQL Global Development Group",
        version="*",  # UNKNOWN VERSION
        software_type="Database",
    )
    test_db.add(sw)
    test_db.commit()

    detector = GapDetector(asset, test_db)
    gaps = detector.run_all()
    version_gaps = [g for g in gaps if g["gap_type"] == "unknown_version"]

    assert len(version_gaps) == 1
    assert "PostgreSQL" in version_gaps[0]["gap_title"]
    assert version_gaps[0]["severity"] == "HIGH"  # Critical asset -> HIGH severity
    assert "unknown or unverified version" in version_gaps[0]["reason"]


# ── TEST 3: Missing owner / department detection ──────────────────────────────

def test_missing_owner_detection(test_db):
    asset = Asset(
        asset_name="Orphaned Proxy",
        asset_type="Server",
        criticality="Medium",
        exposure="Internal",
        department=None,  # MISSING OWNER
        environment="Production",
        ip_address="192.168.1.50",
        operating_system="CentOS 7",
    )
    test_db.add(asset)
    test_db.commit()

    detector = GapDetector(asset, test_db)
    gaps = detector.run_all()
    owner_gaps = [g for g in gaps if g["gap_type"] == "missing_owner"]

    assert len(owner_gaps) == 1
    assert owner_gaps[0]["gap_title"] == "Missing Operational Asset Owner"
    assert "accountable asset owner" in owner_gaps[0]["recommendation"].lower()


# ── TEST 4: Unknown exposure detection ────────────────────────────────────────

def test_unknown_exposure_detection(test_db):
    asset = Asset(
        asset_name="Edge VPN Concentrator",
        asset_type="Gateway",
        criticality="High",
        exposure="Unknown",  # UNKNOWN EXPOSURE
        department="Network Ops",
        environment="Production",
        ip_address="10.200.0.1",
        operating_system="Cisco IOS",
    )
    test_db.add(asset)
    test_db.commit()

    detector = GapDetector(asset, test_db)
    gaps = detector.run_all()
    exp_gaps = [g for g in gaps if g["gap_type"] == "unknown_exposure"]

    assert len(exp_gaps) == 1
    assert exp_gaps[0]["severity"] == "HIGH"  # High criticality + unknown exposure
    assert "Network boundary exposure" in exp_gaps[0]["reason"]


# ── TEST 5: Missing criticality detection ─────────────────────────────────────

def test_missing_criticality_detection(test_db):
    asset = Asset(
        asset_name="Unclassified Web Node",
        asset_type="Server",
        criticality="Unknown",  # MISSING CRITICALITY
        exposure="Internet-Facing",
        department="Digital Marketing",
        environment="Production",
        ip_address="198.51.100.22",
        operating_system="Linux",
    )
    test_db.add(asset)
    test_db.commit()

    detector = GapDetector(asset, test_db)
    gaps = detector.run_all()
    crit_gaps = [g for g in gaps if g["gap_type"] == "missing_criticality"]

    assert len(crit_gaps) == 1
    assert crit_gaps[0]["severity"] == "HIGH"  # Internet-Facing -> HIGH severity
    assert "criticality classification" in crit_gaps[0]["reason"].lower()


# ── TEST 6: Unsupported product / insufficient intel detection ───────────────

def test_insufficient_vulnerability_matching_intel(test_db):
    asset = Asset(
        asset_name="Empty Profile Asset",
        asset_type="Workstation",
        criticality="Medium",
        exposure="Internal",
        department="HR",
        environment="Office",
        ip_address="10.5.0.30",
        operating_system="Windows 11",
    )
    test_db.add(asset)
    test_db.commit()
    # ZERO SOFTWARE INSTALLED

    detector = GapDetector(asset, test_db)
    gaps = detector.run_all()
    intel_gaps = [g for g in gaps if g["gap_type"] == "insufficient_match_intel"]

    assert len(intel_gaps) == 1
    assert intel_gaps[0]["category"] == "Security Coverage"
    assert "zero software applications" in intel_gaps[0]["reason"].lower()


# ── TEST 7: Missing dependency detection for critical assets ──────────────────

def test_missing_critical_dependency_detection(test_db):
    asset = Asset(
        asset_name="Primary Domain Controller",
        asset_type="Server",
        criticality="Critical",  # CRITICAL ASSET
        exposure="Internal",
        department="IT Security",
        environment="Production",
        ip_address="10.0.0.1",
        operating_system="Windows Server 2022",
    )
    test_db.add(asset)
    test_db.commit()
    # ZERO DEPENDENCIES RECORDED

    detector = GapDetector(asset, test_db)
    gaps = detector.run_all()
    dep_gaps = [g for g in gaps if g["gap_type"] == "missing_critical_dependency"]

    assert len(dep_gaps) == 1
    assert dep_gaps[0]["severity"] == "HIGH"
    assert dep_gaps[0]["category"] == "Dependency Gaps"
    assert "zero recorded upstream or downstream dependencies" in dep_gaps[0]["reason"]
    assert "verification" in dep_gaps[0]["reason"].lower()


# ── TEST 8: Gap severity assignment ───────────────────────────────────────────

def test_gap_severity_rules(test_db):
    # Critical + External asset with missing OS -> HIGH
    crit_asset = Asset(
        asset_name="Public API Gateway",
        asset_type="Gateway",
        criticality="Critical",
        exposure="Internet-Facing",
        department="Engineering",
        environment="Production",
        ip_address="198.51.100.1",
        operating_system=None,  # Missing OS
    )
    # Low criticality internal asset with missing IP -> LOW
    low_asset = Asset(
        asset_name="Guest Lounge Display",
        asset_type="IoT",
        criticality="Low",
        exposure="Internal",
        department="Facilities",
        environment="Office",
        ip_address=None,  # Missing IP
        operating_system="Android",
    )
    test_db.add_all([crit_asset, low_asset])
    test_db.commit()

    crit_gaps = GapDetector(crit_asset, test_db).run_all()
    low_gaps = GapDetector(low_asset, test_db).run_all()

    os_gap = next(g for g in crit_gaps if g["gap_type"] == "missing_os")
    ip_gap = next(g for g in low_gaps if g["gap_type"] == "missing_ip")

    assert os_gap["severity"] == "HIGH"
    assert ip_gap["severity"] == "LOW"


# ── TEST 9: Duplicate prevention and idempotency ─────────────────────────────

def test_duplicate_prevention_on_rerun(test_db):
    asset = Asset(
        asset_name="SCADA RTU Remote Terminal",
        asset_type="IoT",
        criticality="High",
        exposure="Internal",
        department="Substation Alpha",
        environment="Production",
        ip_address="192.168.10.5",
        operating_system=None,
    )
    test_db.add(asset)
    test_db.commit()

    # Run analysis first time
    report1 = analyze_infrastructure_gaps(test_db)
    count1 = test_db.query(InfrastructureGap).count()
    assert report1["new_gaps_created"] > 0
    assert count1 > 0

    # User reviews and updates one gap to 'In Review'
    first_gap = test_db.query(InfrastructureGap).first()
    first_gap.status = "In Review"
    test_db.commit()

    # Rerun analysis
    report2 = analyze_infrastructure_gaps(test_db)
    count2 = test_db.query(InfrastructureGap).count()

    # Count must remain exactly the same (no duplicates)
    assert count2 == count1
    assert report2["new_gaps_created"] == 0
    assert report2["existing_gaps_preserved"] > 0

    # User's 'In Review' status MUST be preserved!
    refreshed_gap = test_db.query(InfrastructureGap).filter_by(id=first_gap.id).first()
    assert refreshed_gap.status == "In Review"


# ── TEST 10: Gap status updates via route handler ────────────────────────────

def test_gap_status_updates_endpoint(test_db):
    asset = Asset(
        asset_name="Telemetry Concentrator",
        asset_type="Server",
        criticality="Medium",
        exposure="Internal",
        department="Operations",
        environment="Production",
        ip_address="10.1.1.20",
        operating_system=None,
    )
    test_db.add(asset)
    test_db.commit()

    analyze_infrastructure_gaps(test_db)
    gap = test_db.query(InfrastructureGap).first()
    assert gap is not None
    assert gap.status == "Open"

    # Call route function directly
    resp = update_gap_status(
        gap_id=gap.id,
        payload=GapUpdate(status="Resolved", notes="OS confirmed via Ansible playbook"),
        db=test_db,
    )
    assert resp.status == "Resolved"

    # Verify DB persistence
    refreshed = test_db.query(InfrastructureGap).filter_by(id=gap.id).first()
    assert refreshed.status == "Resolved"


# ── TEST 11: Authentication & API validation ─────────────────────────────────

def test_api_validation_and_error_handling(test_db):
    # Non-existent gap ID raises 404
    with pytest.raises(HTTPException) as exc_info:
        get_gap(gap_id=999999, db=test_db)
    assert exc_info.value.status_code == 404
    assert "not found" in exc_info.value.detail.lower()

    # Non-existent asset ID in analyze raises 404
    with pytest.raises(HTTPException) as exc_info2:
        run_gap_analysis(asset_id=999999, db=test_db)
    assert exc_info2.value.status_code == 404


# ── TEST 12: API filtering and summary statistics ─────────────────────────────

def test_api_filtering_and_summary(test_db):
    asset1 = Asset(
        asset_name="Turbine PLC Controller 01",
        asset_type="IoT",
        criticality="Critical",
        exposure="Internal",
        department="Generation Unit 1",
        environment="Production",
        ip_address="172.16.1.10",
        operating_system=None,
    )
    asset2 = Asset(
        asset_name="Corporate Laptop 44",
        asset_type="Computer",
        criticality="Low",
        exposure="Internal",
        department="Recruiting",
        environment="Simulated",
        ip_address="10.10.10.44",
        operating_system="macOS 14",
    )
    test_db.add_all([asset1, asset2])
    test_db.commit()

    run_gap_analysis(db=test_db)

    # Summary
    summary = gap_summary(db=test_db)
    assert summary["total_gaps"] > 0
    assert summary["high_severity"] >= 1
    assert "ICS/OT Coverage" in summary["by_category"]

    # Filter by severity
    high_items = list_gaps(severity="HIGH", db=test_db)
    assert len(high_items) > 0
    for item in high_items:
        assert item.severity == "HIGH"

    # Filter by category
    ot_items = list_gaps(category="ICS/OT Coverage", db=test_db)
    assert len(ot_items) > 0
    for item in ot_items:
        assert item.category == "ICS/OT Coverage"

    # Search filter
    search_items = list_gaps(search="Turbine", db=test_db)
    assert len(search_items) > 0
    assert any("Turbine" in i.asset_name for i in search_items)
