from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.params import Query as QueryType
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.models.gap import InfrastructureGap
from app.models.asset import Asset
from app.schemas.gap import (
    GapResponse,
    GapUpdate,
    GapSummaryResponse,
    GapAnalysisReport,
)
from app.services.gap_service import analyze_infrastructure_gaps, get_gap_summary

router = APIRouter(prefix="/api/gaps", tags=["Infrastructure Gap Analysis"])


def _clean_param(val, expected_type, default=None):
    if isinstance(val, QueryType) or not isinstance(val, expected_type):
        return default
    return val


@router.post("/analyze", response_model=GapAnalysisReport, status_code=status.HTTP_200_OK)
def run_gap_analysis(
    asset_id: Optional[int] = Query(default=None, description="Optional single asset ID to analyze"),
    db: Session = Depends(get_db),
):
    """
    Executes comprehensive infrastructure gap analysis.
    Identifies missing, unknown, unsupported metadata, security coverage blind spots,
    ICS/OT gaps, and unmapped critical dependencies.
    """
    clean_asset_id = _clean_param(asset_id, int, None)
    if clean_asset_id is not None:
        asset = db.query(Asset).filter(Asset.id == clean_asset_id).first()
        if not asset:
            raise HTTPException(status_code=404, detail=f"Asset with ID {clean_asset_id} not found")
        asset_ids = [clean_asset_id]
    elif asset_id is not None and not isinstance(asset_id, QueryType):
        # If user passed an invalid non-int asset_id directly
        raise HTTPException(status_code=404, detail="Invalid asset ID")
    else:
        asset_ids = None

    report = analyze_infrastructure_gaps(db, asset_ids=asset_ids)
    return report


@router.get("/summary", response_model=GapSummaryResponse)
def gap_summary(db: Session = Depends(get_db)):
    """
    Returns aggregate statistics of detected gaps:
    total, severity breakdown (HIGH, MEDIUM, LOW), lifecycle status counts,
    and category distributions.
    """
    return get_gap_summary(db)


@router.get("/", response_model=list[GapResponse])
def list_gaps(
    severity: Optional[str] = Query(default=None, description="Filter by HIGH, MEDIUM, LOW"),
    category: Optional[str] = Query(default=None, description="Filter by category"),
    status_filter: Optional[str] = Query(default=None, alias="status", description="Filter by Open, In Review, Resolved, Accepted"),
    asset_id: Optional[int] = Query(default=None, description="Filter by affected asset ID"),
    search: Optional[str] = Query(default=None, description="Keyword search in title, reason, or asset name"),
    limit: int = Query(default=100, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    """
    Retrieves stored infrastructure gaps with multi-criteria filtering and search.
    """
    clean_severity = _clean_param(severity, str, None)
    clean_category = _clean_param(category, str, None)
    clean_status = _clean_param(status_filter, str, None)
    clean_asset_id = _clean_param(asset_id, int, None)
    clean_search = _clean_param(search, str, None)
    clean_limit = _clean_param(limit, int, 100)
    clean_offset = _clean_param(offset, int, 0)

    query = db.query(InfrastructureGap).join(Asset, InfrastructureGap.asset_id == Asset.id)

    if clean_severity:
        query = query.filter(InfrastructureGap.severity == clean_severity.upper())
    if clean_category:
        query = query.filter(InfrastructureGap.category == clean_category)
    if clean_status:
        query = query.filter(InfrastructureGap.status == clean_status)
    if clean_asset_id:
        query = query.filter(InfrastructureGap.asset_id == clean_asset_id)
    if clean_search:
        term = f"%{clean_search}%"
        query = query.filter(
            InfrastructureGap.gap_title.ilike(term)
            | InfrastructureGap.reason.ilike(term)
            | InfrastructureGap.recommendation.ilike(term)
            | Asset.asset_name.ilike(term)
        )

    # Order by severity priority (HIGH -> MEDIUM -> LOW) and updated_at
    gaps = query.order_by(
        InfrastructureGap.status.asc(),
        InfrastructureGap.id.desc(),
    ).offset(clean_offset).limit(clean_limit).all()

    # Hydrate asset details for frontend display
    response_items = []
    for g in gaps:
        asset_obj = g.asset
        item = GapResponse(
            id=g.id,
            asset_id=g.asset_id,
            asset_name=asset_obj.asset_name if asset_obj else "Unknown Asset",
            asset_type=asset_obj.asset_type if asset_obj else "Unknown",
            criticality=asset_obj.criticality if asset_obj else "Unknown",
            exposure=asset_obj.exposure if asset_obj else "Unknown",
            gap_title=g.gap_title,
            category=g.category,
            gap_type=g.gap_type,
            severity=g.severity,
            reason=g.reason,
            recommendation=g.recommendation,
            status=g.status,
            fingerprint=g.fingerprint,
            created_at=g.created_at,
            updated_at=g.updated_at,
        )
        response_items.append(item)

    return response_items


@router.get("/{gap_id}", response_model=GapResponse)
def get_gap(gap_id: int, db: Session = Depends(get_db)):
    """
    Retrieves complete details of an individual gap finding.
    """
    gap = db.query(InfrastructureGap).filter(InfrastructureGap.id == gap_id).first()
    if not gap:
        raise HTTPException(status_code=404, detail="Infrastructure gap finding not found")

    asset_obj = gap.asset
    return GapResponse(
        id=gap.id,
        asset_id=gap.asset_id,
        asset_name=asset_obj.asset_name if asset_obj else "Unknown Asset",
        asset_type=asset_obj.asset_type if asset_obj else "Unknown",
        criticality=asset_obj.criticality if asset_obj else "Unknown",
        exposure=asset_obj.exposure if asset_obj else "Unknown",
        gap_title=gap.gap_title,
        category=gap.category,
        gap_type=gap.gap_type,
        severity=gap.severity,
        reason=gap.reason,
        recommendation=gap.recommendation,
        status=gap.status,
        fingerprint=gap.fingerprint,
        created_at=gap.created_at,
        updated_at=gap.updated_at,
    )


@router.patch("/{gap_id}", response_model=GapResponse)
def update_gap_status(
    gap_id: int,
    payload: GapUpdate,
    db: Session = Depends(get_db),
):
    """
    Updates the lifecycle status of an infrastructure gap ('Open', 'In Review', 'Resolved', 'Accepted').
    """
    gap = db.query(InfrastructureGap).filter(InfrastructureGap.id == gap_id).first()
    if not gap:
        raise HTTPException(status_code=404, detail="Infrastructure gap finding not found")

    gap.status = payload.status
    db.commit()
    db.refresh(gap)

    asset_obj = gap.asset
    return GapResponse(
        id=gap.id,
        asset_id=gap.asset_id,
        asset_name=asset_obj.asset_name if asset_obj else "Unknown Asset",
        asset_type=asset_obj.asset_type if asset_obj else "Unknown",
        criticality=asset_obj.criticality if asset_obj else "Unknown",
        exposure=asset_obj.exposure if asset_obj else "Unknown",
        gap_title=gap.gap_title,
        category=gap.category,
        gap_type=gap.gap_type,
        severity=gap.severity,
        reason=gap.reason,
        recommendation=gap.recommendation,
        status=gap.status,
        fingerprint=gap.fingerprint,
        created_at=gap.created_at,
        updated_at=gap.updated_at,
    )
