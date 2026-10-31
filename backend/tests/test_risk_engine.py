import asyncio
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.db.database import Base
from app.main import app
from app.models.asset import Asset, AssetSoftware, AssetDependency
from app.models.vulnerability import Vulnerability, AssetVulnerability
from app.services.risk_engine import (
    calculate_asset_risk,
    classify_risk_level,
    assess_dependency_impact,
)
from app.services.nvd_service import search_cves


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


def test_infrastructure_map_route_is_not_treated_as_asset_id(test_db):
    from app.routes.assets import infrastructure_map
    payload = infrastructure_map(db=test_db)
    assert "nodes" in payload
    assert "edges" in payload
    assert "asset_count" in payload


def test_search_cves_uses_local_cache_before_nvd(test_db, monkeypatch):
    cached = Vulnerability(
        cve_id="CVE-2024-0001",
        description="Apache HTTP Server remote code execution",
        cvss_score=9.8,
        severity="CRITICAL",
        affected_products="apache http server",
        cpe_strings="cpe:2.3:a:apache:http_server:*:*:*:*:*:*:*",
    )
    test_db.add(cached)
    test_db.commit()

    class FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def get(self, *args, **kwargs):
            raise AssertionError("NVD should not be called when cached data is present")

    monkeypatch.setattr("app.services.nvd_service.httpx.AsyncClient", FakeClient)

    async def _run():
        results = await search_cves("apache http server", limit=10, db=test_db)
        assert len(results) == 1
        assert results[0]["cve_id"] == "CVE-2024-0001"

    asyncio.run(_run())


def test_sync_vulnerabilities_without_keywords_does_not_run_broad_nvd_sync(test_db, monkeypatch):
    from app.routes.vulnerabilities import sync_vulnerabilities
    from app.schemas.vulnerability import SyncRequest

    async def _raise_if_called(*args, **kwargs):
        raise AssertionError("Broad NVD sync should not run when no explicit keywords are supplied")

    monkeypatch.setattr("app.routes.vulnerabilities.nvd_collector.sync_bulk", _raise_if_called)

    async def _run():
        result = await sync_vulnerabilities(SyncRequest(keywords=[], max_per_keyword=10), db=test_db)
        assert result.keywords_synced == 0
        assert result.inserted == 0
        assert result.updated == 0
        assert result.skipped == 0

    asyncio.run(_run())


def test_create_asset_fetches_exact_software_data_if_missing_from_db(test_db, monkeypatch):
    from app.routes.assets import create_asset
    from app.schemas.asset import AssetCreate

    captured = {}

    async def fake_search_cves(keyword: str, limit: int = 20, db=None):
        captured["keyword"] = keyword
        return [{"cve_id": "CVE-2024-4444", "description": "Sample", "severity": "HIGH"}]

    monkeypatch.setattr("app.routes.assets.search_cves", fake_search_cves)

    async def _run():
        payload = AssetCreate(
            asset_name="ICU Monitor",
            asset_type="Server",
            ip_address="10.0.0.5",
            operating_system="Ubuntu Server 22.04",
            criticality="Critical",
            exposure="Internal",
            department="ICU",
            software=[],
        )
        asset = await create_asset(payload, db=test_db)
        assert asset.asset_name == "ICU Monitor"
        assert captured["keyword"] == "Ubuntu Server 22.04"

    asyncio.run(_run())


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


def test_dependency_impact_analysis(test_db):
    hospital = Asset(
        asset_name="Hospital EHR Core",
        asset_type="Application",
        criticality="Critical",
        exposure="Internal",
        department="Clinical Systems",
    )
    lab = Asset(
        asset_name="Lab System",
        asset_type="Application",
        criticality="High",
        exposure="Internal",
        department="Lab",
    )
    test_db.add_all([hospital, lab])
    test_db.commit()

    dep = AssetDependency(
        source_asset_id=lab.id,
        target_asset_id=hospital.id,
        dependency_type="depends_on",
        dependency_strength=0.9,
        service_impact="Clinical workflow disruption",
    )
    test_db.add(dep)
    test_db.commit()

    impact = assess_dependency_impact(lab, test_db)
    assert impact["affected_assets"] == [hospital.asset_name]
    assert impact["blast_radius"] >= 1
    assert "Clinical workflow disruption" in impact["recommendations"][0]

