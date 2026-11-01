from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, desc

from app.db.database import get_db
from app.models.asset import Asset
from app.models.vulnerability import AssetVulnerability
from app.models.risk import RiskAssessment
from app.schemas.risk import (
    RiskAssessmentResponse,
    RiskSummaryResponse,
    DepartmentRiskItem,
    AssessAllReport,
)
from app.services.risk_engine import assess_and_save_asset_risk

router = APIRouter(prefix="/api/risks", tags=["Risk Assessment"])


def _serialize_risk(row: RiskAssessment, asset: Asset | None = None) -> dict:
    a = asset or row.asset
    return {
        "id": row.id,
        "asset_id": row.asset_id,
        "asset_name": a.asset_name if a else None,
        "asset_type": a.asset_type if a else None,
        "department": a.department if a else None,
        "risk_score": row.risk_score,
        "risk_level": row.risk_level,
        "severity_score": row.severity_score,
        "exploitability_score": row.exploitability_score,
        "exposure_score": row.exposure_score,
        "criticality_score": row.criticality_score,
        "factors": row.factors,
        "explanation": row.explanation,
        "evidence_coverage": row.evidence_coverage,
        "recommendations": row.recommendations or [],
        "assessed_at": row.assessed_at,
    }


@router.post("/assess/{asset_id}", response_model=RiskAssessmentResponse)
def assess_asset_risk(asset_id: int, db: Session = Depends(get_db)):
    """Calculate and record an explainable risk assessment for a specific asset."""
    asset = db.query(Asset).filter(Asset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    assessment = assess_and_save_asset_risk(asset, db)
    return _serialize_risk(assessment, asset)


@router.post("/assess-all", response_model=AssessAllReport)
def assess_all_assets_risk(db: Session = Depends(get_db)):
    """Run risk scoring for all registered infrastructure assets across the organization."""
    assets = db.query(Asset).all()
    if not assets:
        return AssessAllReport(assessed=0, average_score=0.0, critical_count=0, items=[])

    results = []
    total_score = 0.0
    critical_count = 0

    for asset in assets:
        row = assess_and_save_asset_risk(asset, db)
        serialized = _serialize_risk(row, asset)
        results.append(serialized)
        total_score += row.risk_score
        if row.risk_level == "Critical":
            critical_count += 1

    # Sort descending by risk score
    results.sort(key=lambda x: x["risk_score"], reverse=True)
    avg_score = round(total_score / len(assets), 1)

    return AssessAllReport(
        assessed=len(results),
        average_score=avg_score,
        critical_count=critical_count,
        items=results,
    )


@router.get("/latest", response_model=list[RiskAssessmentResponse])
@router.get("/", response_model=list[RiskAssessmentResponse])
def list_latest_risks(
    department: str | None = Query(default=None),
    risk_level: str | None = Query(default=None),
    limit: int = Query(default=100, le=500),
    db: Session = Depends(get_db),
):
    """Retrieve the latest risk assessment for each asset, ranked by highest risk first."""
    # Find latest assessment id per asset
    subq = (
        db.query(
            RiskAssessment.asset_id,
            func.max(RiskAssessment.assessed_at).label("max_date"),
        )
        .group_by(RiskAssessment.asset_id)
        .subquery()
    )

    query = (
        db.query(RiskAssessment, Asset)
        .join(Asset, RiskAssessment.asset_id == Asset.id)
        .join(
            subq,
            (RiskAssessment.asset_id == subq.c.asset_id)
            & (RiskAssessment.assessed_at == subq.c.max_date),
        )
    )

    if department:
        query = query.filter(Asset.department == department)
    if risk_level:
        query = query.filter(RiskAssessment.risk_level.ilike(risk_level))

    rows = query.order_by(desc(RiskAssessment.risk_score)).limit(limit).all()
    return [_serialize_risk(risk_row, asset_row) for risk_row, asset_row in rows]


@router.get("/summary", response_model=RiskSummaryResponse)
def get_risk_summary(db: Session = Depends(get_db)):
    """Fleet-wide risk summary metrics for SecOps KPI cards and charts."""
    total_assets = db.query(Asset).count()
    if total_assets == 0:
        return RiskSummaryResponse(
            total_assets=0,
            assessed_assets=0,
            assets_with_confirmed_matches=0,
            critical_risk_count=0,
            high_risk_count=0,
            medium_risk_count=0,
            low_risk_count=0,
            average_risk_score=0.0,
            cisa_kev_alert_count=0,
        )

    # Subquery for latest assessment per asset
    subq = (
        db.query(
            RiskAssessment.asset_id,
            func.max(RiskAssessment.assessed_at).label("max_date"),
        )
        .group_by(RiskAssessment.asset_id)
        .subquery()
    )

    latest_rows = (
        db.query(RiskAssessment)
        .join(
            subq,
            (RiskAssessment.asset_id == subq.c.asset_id)
            & (RiskAssessment.assessed_at == subq.c.max_date),
        )
        .all()
    )

    crit_cnt = sum(1 for r in latest_rows if r.risk_level == "Critical")
    high_cnt = sum(1 for r in latest_rows if r.risk_level == "High")
    med_cnt = sum(1 for r in latest_rows if r.risk_level == "Medium")
    low_cnt = sum(1 for r in latest_rows if r.risk_level == "Low")
    cisa_alerts = sum(
        1 for r in latest_rows if r.factors and r.factors.get("cisa_kev_alert") is True
    )

    scores = [r.risk_score for r in latest_rows]
    avg_score = round(sum(scores) / len(scores), 1) if scores else 0.0

    assets_with_vulns = (
        db.query(AssetVulnerability.asset_id).distinct().count()
    )

    return RiskSummaryResponse(
        total_assets=total_assets,
        assessed_assets=len(latest_rows),
        assets_with_confirmed_matches=assets_with_vulns,
        critical_risk_count=crit_cnt,
        high_risk_count=high_cnt,
        medium_risk_count=med_cnt,
        low_risk_count=low_cnt,
        average_risk_score=avg_score,
        cisa_kev_alert_count=cisa_alerts,
    )


@router.get("/departments", response_model=list[DepartmentRiskItem])
def get_department_risk_breakdown(db: Session = Depends(get_db)):
    """Breakdown of accumulated risk by clinical and operational department."""
    subq = (
        db.query(
            RiskAssessment.asset_id,
            func.max(RiskAssessment.assessed_at).label("max_date"),
        )
        .group_by(RiskAssessment.asset_id)
        .subquery()
    )

    rows = (
        db.query(RiskAssessment, Asset)
        .join(Asset, RiskAssessment.asset_id == Asset.id)
        .join(
            subq,
            (RiskAssessment.asset_id == subq.c.asset_id)
            & (RiskAssessment.assessed_at == subq.c.max_date),
        )
        .all()
    )

    dept_data: dict[str, dict] = {}
    for risk_row, asset_row in rows:
        dept = asset_row.department or "Unassigned"
        if dept not in dept_data:
            dept_data[dept] = {
                "department": dept,
                "asset_count": 0,
                "total_score": 0.0,
                "critical_count": 0,
                "high_count": 0,
            }
        dept_data[dept]["asset_count"] += 1
        dept_data[dept]["total_score"] += risk_row.risk_score
        if risk_row.risk_level == "Critical":
            dept_data[dept]["critical_count"] += 1
        elif risk_row.risk_level == "High":
            dept_data[dept]["high_count"] += 1

    output = []
    for d, info in dept_data.items():
        avg_score = round(info["total_score"] / info["asset_count"], 1)
        output.append(
            DepartmentRiskItem(
                department=d,
                asset_count=info["asset_count"],
                average_risk=avg_score,
                critical_count=info["critical_count"],
                high_count=info["high_count"],
            )
        )

    output.sort(key=lambda x: x.average_risk, reverse=True)
    return output


@router.get("/asset/{asset_id}/history", response_model=list[RiskAssessmentResponse])
def get_asset_risk_history(
    asset_id: int, limit: int = 20, db: Session = Depends(get_db)
):
    """Retrieve historical risk assessments for a specific asset to track progress over time."""
    asset = db.query(Asset).filter(Asset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    rows = (
        db.query(RiskAssessment)
        .filter(RiskAssessment.asset_id == asset_id)
        .order_by(desc(RiskAssessment.assessed_at))
        .limit(limit)
        .all()
    )
    return [_serialize_risk(r, asset) for r in rows]
