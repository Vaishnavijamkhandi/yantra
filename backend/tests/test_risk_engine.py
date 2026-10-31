import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.db.database import Base
from app.models.asset import Asset, AssetSoftware
from app.models.vulnerability import Vulnerability, AssetVulnerability
from app.services.risk_engine import calculate_asset_risk, classify_risk_level


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


def test_classify_risk_level():
    assert classify_risk_level(85.0) == "Critical"
    assert classify_risk_level(80.0) == "Critical"
    assert classify_risk_level(79.9) == "High"
    assert classify_risk_level(60.0) == "High"
    assert classify_risk_level(59.9) == "Medium"
    assert classify_risk_level(30.0) == "Medium"
    assert classify_risk_level(29.9) == "Low"
    assert classify_risk_level(0.0) == "Low"


def test_asset_with_zero_vulnerabilities_has_uncertainty_floor(test_db):
    asset = Asset(
        asset_name="ICU Monitor 01",
        asset_type="Medical Device",
        criticality="Critical",
        exposure="Internal",
        department="ICU",
    )
    test_db.add(asset)
    test_db.commit()

    result = calculate_asset_risk(asset, test_db)
    # Zero CVEs should NOT be 0 risk.
    assert result["risk_score"] > 0
    assert result["evidence_coverage"] == "limited_evidence"
    assert result["severity_score"] == 0.0
    assert "No vulnerability match is currently stored" in result["explanation"]


def test_asset_with_critical_vulnerability(test_db):
    asset = Asset(
        asset_name="Patient Portal Server",
        asset_type="Server",
        criticality="Critical",
        exposure="Internet-Facing",
        department="Patient Services",
    )
    test_db.add(asset)
    test_db.commit()

    vuln = Vulnerability(
        cve_id="CVE-2023-48795",
        description="Terrapin attack in OpenSSH allowing sequence manipulation",
        cvss_score=9.8,
        severity="CRITICAL",
    )
    test_db.add(vuln)
    test_db.commit()

    link = AssetVulnerability(
        asset_id=asset.id,
        vulnerability_id=vuln.id,
        matched_software="OpenSSH",
        matched_version="8.9p1",
        match_method="cpe",
    )
    test_db.add(link)
    test_db.commit()

    result = calculate_asset_risk(asset, test_db)
    assert result["risk_score"] >= 80.0
    assert result["risk_level"] == "Critical"
    assert result["evidence_coverage"] == "confirmed_matches"
    assert "CVE-2023-48795" in result["explanation"]


def test_multiple_vulnerabilities_compounding(test_db):
    asset = Asset(
        asset_name="Core Switch",
        asset_type="Network Device",
        criticality="High",
        exposure="Internal",
    )
    test_db.add(asset)
    test_db.commit()

    # Add 4 vulnerabilities
    for i in range(1, 5):
        v = Vulnerability(
            cve_id=f"CVE-2024-000{i}",
            description=f"Flaw {i}",
            cvss_score=7.5,
            severity="HIGH",
        )
        test_db.add(v)
        test_db.commit()
        link = AssetVulnerability(
            asset_id=asset.id,
            vulnerability_id=v.id,
            matched_software="NetworkOS",
            match_method="cpe",
        )
        test_db.add(link)
    test_db.commit()

    result = calculate_asset_risk(asset, test_db)
    # Severity should compound higher than base 7.5 * 10 = 75
    assert result["severity_score"] > 75.0
    assert result["factors"]["matched_cve_count"] == 4

