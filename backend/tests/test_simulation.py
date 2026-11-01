import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.database import Base
from app.models.asset import Asset, AssetDependency
from app.models.risk import RiskAssessment
from app.services.simulation_engine import (
    run_incident_simulation,
    classify_simulated_impact_level,
    SCENARIOS,
)
from fastapi.testclient import TestClient
from app.main import app


@pytest.fixture
def sim_db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    db = Session()

    # Seed controlled topology:
    # A (Gateway, Critical) -> B (API, High) -> C (DB, Critical)
    # A -> D (Isolated Workstation, Low)
    # E (Disconnected Node, Medium)
    # Cycle: C -> A (loop to test cycle safety)
    a = Asset(id=1, asset_name="Core-Gateway", asset_type="Router", criticality="Critical", department="IT", exposure="External")
    b = Asset(id=2, asset_name="Payments-API", asset_type="Application", criticality="High", department="IT", exposure="Internal")
    c = Asset(id=3, asset_name="Core-Ledger-DB", asset_type="Database", criticality="Critical", department="Finance", exposure="Internal")
    d = Asset(id=4, asset_name="Staff-Terminal", asset_type="Computer", criticality="Low", department="Ops", exposure="Internal")
    e = Asset(id=5, asset_name="Airgapped-Backup", asset_type="Server", criticality="Medium", department="Ops", exposure="Isolated")
    db.add_all([a, b, c, d, e])
    db.commit()

    dep1 = AssetDependency(source_asset_id=1, target_asset_id=2, dependency_type="authenticates", dependency_strength=0.9, service_impact="API auth token reject")
    dep2 = AssetDependency(source_asset_id=2, target_asset_id=3, dependency_type="persists_to", dependency_strength=0.95, service_impact="Database write stall")
    dep3 = AssetDependency(source_asset_id=1, target_asset_id=4, dependency_type="routes_traffic", dependency_strength=0.5, service_impact="Terminal offline")
    # Cycle link
    dep_cycle = AssetDependency(source_asset_id=3, target_asset_id=1, dependency_type="telemetry_sync", dependency_strength=0.7, service_impact="Telemetry loop")
    db.add_all([dep1, dep2, dep3, dep_cycle])
    db.commit()

    try:
        yield db
    finally:
        db.close()


def test_initial_asset_validation(sim_db):
    with pytest.raises(ValueError, match="Asset with ID 999 does not exist"):
        run_incident_simulation(initial_asset_id=999, db=sim_db)


def test_direct_and_multihop_propagation(sim_db):
    res = run_incident_simulation(initial_asset_id=1, scenario_type="service_outage", db=sim_db)
    summary = res["summary"]
    # Total reachable downstream from A: A(0), B(1), D(1), C(2) = 4 assets
    # E is disconnected and should NOT be affected
    assert summary["total_affected_assets"] == 4
    assert summary["directly_affected"] == 2  # B and D
    assert summary["indirectly_affected"] == 1  # C
    assert summary["max_propagation_depth"] == 2

    affected_ids = [n["asset_id"] for n in res["affected_assets"]]
    assert 1 in affected_ids
    assert 2 in affected_ids
    assert 3 in affected_ids
    assert 4 in affected_ids
    assert 5 not in affected_ids  # Disconnected node untouched


def test_cycle_and_duplicate_visit_prevention(sim_db):
    # Even with cycle C -> A, traversal should not loop infinitely and visit count should remain 4
    res = run_incident_simulation(initial_asset_id=1, scenario_type="service_outage", db=sim_db)
    node_ids = [n["asset_id"] for n in res["affected_assets"]]
    assert len(node_ids) == len(set(node_ids)), "Duplicate visits detected in simulation traversal!"


def test_impact_classification_and_criticality():
    # Hop 0 is initial
    assert classify_simulated_impact_level("Critical", distance=0, dependency_strength=1.0, scenario="service_outage") == "CRITICAL"
    # Hop 1 direct impact on Critical asset with high strength
    assert classify_simulated_impact_level("Critical", distance=1, dependency_strength=0.95, scenario="service_outage") == "CRITICAL"
    # Hop 2 indirect impact on Low criticality asset with weak strength
    assert classify_simulated_impact_level("Low", distance=3, dependency_strength=0.4, scenario="service_outage") in ["MEDIUM", "LOW"]


def test_simulation_data_isolation(sim_db):
    """Verifies that running a simulation does NOT alter production asset state or risk assessments."""
    initial_assets = sim_db.query(Asset).count()
    initial_risks = sim_db.query(RiskAssessment).count()

    res = run_incident_simulation(initial_asset_id=1, scenario_type="asset_compromise", db=sim_db)
    assert res["status"] == "completed"

    # Confirm database records remain unchanged
    after_assets = sim_db.query(Asset).count()
    after_risks = sim_db.query(RiskAssessment).count()
    assert initial_assets == after_assets
    assert initial_risks == after_risks


def test_api_endpoints(sim_db):
    from fastapi import HTTPException
    from app.routes.simulations import get_supported_scenarios, start_simulation, SimulationRunRequest

    # Scenario list
    sc_res = get_supported_scenarios()
    assert len(sc_res["scenarios"]) >= 4

    # Invalid scenario
    with pytest.raises(HTTPException) as exc1:
        start_simulation(SimulationRunRequest(initial_asset_id=2, scenario_type="invalid_mode"), db=sim_db)
    assert exc1.value.status_code == 400

    # Non-existent asset
    with pytest.raises(HTTPException) as exc2:
        start_simulation(SimulationRunRequest(initial_asset_id=999999, scenario_type="asset_compromise"), db=sim_db)
    assert exc2.value.status_code == 404

    # Test infrastructure-map route via direct function call
    from app.routes.assets import infrastructure_map
    map_res = infrastructure_map(db=sim_db)
    assert "nodes" in map_res
    assert "edges" in map_res
    assert len(map_res["nodes"]) > 0
