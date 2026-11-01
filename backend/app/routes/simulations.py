from __future__ import annotations

import logging
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.asset import Asset
from app.services.simulation_engine import (
    run_incident_simulation,
    SCENARIOS,
)
from app.services.dependency_service import ensure_baseline_dependencies

logger = logging.getLogger(__name__)

router = APIRouter()

# In-memory storage for active simulation sessions (keeps simulations 100% isolated from real data)
SIMULATION_CACHE: Dict[str, Dict[str, Any]] = {}


class SimulationRunRequest(BaseModel):
    initial_asset_id: int = Field(..., description="Target asset ID where the incident originates")
    scenario_type: str = Field(
        default="asset_compromise",
        description="Type of incident: asset_compromise, ransomware, service_outage, network_isolation",
    )
    severity: str = Field(default="HIGH", description="Initial severity tier: CRITICAL, HIGH, MEDIUM, LOW")
    parameters: Optional[Dict[str, Any]] = None


@router.get("/scenarios")
def get_supported_scenarios():
    """Returns documentation and configuration for all supported incident scenarios."""
    return {
        "scenarios": [
            {
                "id": k,
                "title": v["title"],
                "description": v["description"],
                "traversal_mode": v["traversal_mode"],
                "decay_per_hop": v["decay_per_hop"],
            }
            for k, v in SCENARIOS.items()
        ]
    }


@router.post("/run")
def start_simulation(
    req: SimulationRunRequest,
    db: Session = Depends(get_db),
):
    """
    Executes a deterministic incident propagation simulation starting from initial_asset_id.
    Calculates reachable affected systems, cascading impact depth, timeline events, and mitigations.
    Does NOT modify physical device state or production risk scores.
    """
    # Ensure graph has dependencies
    ensure_baseline_dependencies(db)

    # Validate asset
    asset = db.query(Asset).filter(Asset.id == req.initial_asset_id).first()
    if not asset:
        raise HTTPException(
            status_code=404,
            detail=f"Initial asset with ID {req.initial_asset_id} was not found in infrastructure inventory.",
        )

    # Validate scenario
    if req.scenario_type not in SCENARIOS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid scenario '{req.scenario_type}'. Allowed: {list(SCENARIOS.keys())}",
        )

    try:
        results = run_incident_simulation(
            initial_asset_id=req.initial_asset_id,
            scenario_type=req.scenario_type,
            requested_severity=req.severity,
            db=db,
        )
        # Cache run
        sim_id = results["simulation_id"]
        SIMULATION_CACHE[sim_id] = results

        return results
    except Exception as exc:
        logger.error(f"Incident simulation failed: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Simulation error: {str(exc)}")


@router.get("/history")
def list_simulation_runs(limit: int = 10):
    """Returns recent simulation runs summary."""
    runs = list(SIMULATION_CACHE.values())[-limit:]
    return [
        {
            "simulation_id": r["simulation_id"],
            "initial_asset": r["initial_asset"],
            "scenario_type": r["scenario_type"],
            "severity": r["severity"],
            "status": r["status"],
            "total_affected": r["summary"]["total_affected_assets"],
            "blast_radius_pct": r["summary"]["potential_blast_radius_pct"],
            "created_at": r["created_at"],
        }
        for r in reversed(runs)
    ]


@router.get("/{simulation_id}")
def get_simulation_run(simulation_id: str):
    """Retrieves full details of a previously executed simulation run."""
    run_data = SIMULATION_CACHE.get(simulation_id)
    if not run_data:
        raise HTTPException(status_code=404, detail="Simulation run not found or expired.")
    return run_data


@router.post("/{simulation_id}/reset")
def reset_simulation(simulation_id: str):
    """Resets and purges a simulation run session."""
    if simulation_id in SIMULATION_CACHE:
        del SIMULATION_CACHE[simulation_id]
    return {"status": "reset", "message": f"Simulation {simulation_id} state reset successfully."}

