import asyncio
from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.vulnerability import Vulnerability, AssetVulnerability
from app.models.asset import Asset
from app.schemas.vulnerability import (
    VulnerabilityResponse,
    AssetVulnerabilityResponse,
    SyncRequest,
    AssessmentRequest,
    AssessmentSummary,
    SyncReport,
)
from app.services import nvd_collector
from app.services.matcher import run_assessment
from app.services.seed_data import seed_curated_vulnerabilities
from app.services.threat_intel import build_complete_action_profile

router = APIRouter(prefix="/api/vulnerabilities", tags=["Vulnerabilities"])
assessment_router = APIRouter(prefix="/api/assessment", tags=["Assessment"])


# ══════════════════════════════════════════════════════════════════════════════
#  VULNERABILITY CRUD
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/", response_model=list[VulnerabilityResponse])
def list_vulnerabilities(
    search: str | None = Query(default=None),
    severity: str | None = Query(default=None),
    min_score: float | None = Query(default=None),
    limit: int = Query(default=100, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    q = db.query(Vulnerability)
    if search:
        q = q.filter(
            Vulnerability.cve_id.ilike(f"%{search}%")
            | Vulnerability.description.ilike(f"%{search}%")
        )
    if severity:
        q = q.filter(Vulnerability.severity.ilike(severity))
    if min_score is not None:
        q = q.filter(Vulnerability.cvss_score >= min_score)
    return q.order_by(Vulnerability.cvss_score.desc().nullslast()).offset(offset).limit(limit).all()


@router.get("/stats")
def vulnerability_stats(db: Session = Depends(get_db)):
    total = db.query(Vulnerability).count()
    by_severity: dict[str, int] = {}
    for sev in ["CRITICAL", "HIGH", "MEDIUM", "LOW"]:
        by_severity[sev] = db.query(Vulnerability).filter(Vulnerability.severity == sev).count()
    return {"total": total, "by_severity": by_severity}


@router.get("/{vuln_id}", response_model=VulnerabilityResponse)
def get_vulnerability(vuln_id: int, db: Session = Depends(get_db)):
    vuln = db.query(Vulnerability).filter(Vulnerability.id == vuln_id).first()
    if not vuln:
        raise HTTPException(status_code=404, detail="Vulnerability not found")
    return vuln


# ══════════════════════════════════════════════════════════════════════════════
#  NVD SYNC
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/seed")
def seed_vulnerabilities(db: Session = Depends(get_db)):
    """Seed the database with curated real-world hospital infrastructure CVEs."""
    return seed_curated_vulnerabilities(db)


@router.post("/sync", response_model=SyncReport)
async def sync_vulnerabilities(body: SyncRequest, db: Session = Depends(get_db)):
    """
    Fetch CVEs from NVD API and store them.
    Provide specific keywords or leave empty to use the built-in hospital keyword list.
    """
    keywords = body.keywords if body.keywords else nvd_collector.HOSPITAL_KEYWORDS
    result = await nvd_collector.sync_bulk(keywords, db, max_per_keyword=body.max_per_keyword)
    return SyncReport(**result)


# ══════════════════════════════════════════════════════════════════════════════
#  ASSESSMENT
# ══════════════════════════════════════════════════════════════════════════════

@assessment_router.post("/run", response_model=AssessmentSummary)
def run_vulnerability_assessment(
    body: AssessmentRequest,
    db: Session = Depends(get_db),
):
    """Run matching engine against all (or selected) assets."""
    vuln_count = db.query(Vulnerability).count()
    if vuln_count == 0:
        raise HTTPException(
            status_code=400,
            detail="No vulnerabilities in database. Run POST /api/vulnerabilities/sync first.",
        )
    result = run_assessment(db, asset_ids=body.asset_ids)
    return AssessmentSummary(**result)


@assessment_router.get("/results", response_model=list[AssetVulnerabilityResponse])
def get_assessment_results(
    asset_id: int | None = Query(default=None),
    severity: str | None = Query(default=None),
    limit: int = Query(default=200, le=1000),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    """All assessment links, optionally filtered by asset or severity."""
    q = (
        db.query(AssetVulnerability)
        .join(Vulnerability)
        .order_by(Vulnerability.cvss_score.desc().nullslast())
    )
    if asset_id:
        q = q.filter(AssetVulnerability.asset_id == asset_id)
    if severity:
        q = q.filter(Vulnerability.severity.ilike(severity))
    return q.offset(offset).limit(limit).all()


@assessment_router.get("/summary")
def assessment_summary(db: Session = Depends(get_db)):
    """Dashboard numbers for Phase 2."""
    total_vulns = db.query(Vulnerability).count()
    total_links = db.query(AssetVulnerability).count()
    assets_affected = (
        db.query(AssetVulnerability.asset_id).distinct().count()
    )
    by_severity: dict[str, int] = {}
    for sev in ["CRITICAL", "HIGH", "MEDIUM", "LOW"]:
        by_severity[sev] = (
            db.query(AssetVulnerability)
            .join(Vulnerability)
            .filter(Vulnerability.severity == sev)
            .count()
        )
    return {
        "total_vulnerabilities_in_db": total_vulns,
        "total_asset_vulnerability_links": total_links,
        "assets_affected": assets_affected,
        "by_severity": by_severity,
    }


# ══════════════════════════════════════════════════════════════════════════════
#  PER-ASSET VULNERABILITY VIEW (also on assets router)
# ══════════════════════════════════════════════════════════════════════════════

asset_vuln_router = APIRouter(prefix="/api/assets", tags=["Assets"])


@asset_vuln_router.get("/{asset_id}/vulnerabilities", response_model=list[AssetVulnerabilityResponse])
def get_asset_vulnerabilities(
    asset_id: int,
    db: Session = Depends(get_db),
):
    asset = db.query(Asset).filter(Asset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    links = (
        db.query(AssetVulnerability)
        .join(Vulnerability)
        .filter(AssetVulnerability.asset_id == asset_id)
        .order_by(Vulnerability.cvss_score.desc().nullslast())
        .all()
    )
    return links


# ══════════════════════════════════════════════════════════════════════════════
#  REAL OPERATIONAL ACTIONS (Remediation, Live Threat Intel, Quarantine)
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/{cve_id}/action-plan")
async def get_cve_action_plan(
    cve_id: str,
    asset_id: int | None = Query(default=None),
    software: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    """
    Fetch the complete 3-part intelligence profile:
      1. 💊 Remedy (Technical fix + CISA mandate + copyable CLI commands)
      2. ⚠️ What If Not Cured (Exploit threat vector + live EPSS & CISA telemetry)
      3. 🏥 Consequences (Hospital patient safety, legal HIPAA fines, operational downtime)
    """
    vuln = db.query(Vulnerability).filter(Vulnerability.cve_id == cve_id).first()
    if not vuln:
        raise HTTPException(status_code=404, detail=f"Vulnerability {cve_id} not found")

    department = None
    asset_type = None
    asset_name = "Enterprise Infrastructure Asset"
    operating_system = None

    if asset_id:
        asset = db.query(Asset).filter(Asset.id == asset_id).first()
        if asset:
            department = asset.department
            asset_type = asset.asset_type
            asset_name = asset.asset_name
            operating_system = asset.operating_system

    profile = await build_complete_action_profile(
        cve_id=cve_id,
        software_name=software or vuln.affected_products,
        operating_system=operating_system,
        department=department,
        asset_type=asset_type,
        asset_name=asset_name,
        cvss_score=vuln.cvss_score,
        description=vuln.description,
    )

    profile["reference_url"] = vuln.reference_url
    return profile


@assessment_router.post("/{asset_vuln_id}/resolve")
def resolve_asset_vulnerability(
    asset_vuln_id: int,
    db: Session = Depends(get_db),
):
    """Mark a detected finding as remediated/resolved and remove it from active risks."""
    link = db.query(AssetVulnerability).filter(AssetVulnerability.id == asset_vuln_id).first()
    if not link:
        raise HTTPException(status_code=404, detail="Finding not found")
    cve_id = link.vulnerability.cve_id if link.vulnerability else "CVE"
    asset_id = link.asset_id
    db.delete(link)
    db.commit()
    return {
        "success": True,
        "message": f"Successfully marked {cve_id} as remediated for Asset #{asset_id}!",
        "asset_id": asset_id,
    }


@asset_vuln_router.post("/{asset_id}/quarantine")
def quarantine_asset(
    asset_id: int,
    db: Session = Depends(get_db),
):
    """Isolate an asset from the internal production network."""
    asset = db.query(Asset).filter(Asset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    
    # Toggle or set quarantine status
    asset.environment = "QUARANTINED"
    db.commit()
    return {
        "success": True,
        "message": f"Asset '{asset.asset_name}' ({asset.ip_address}) has been isolated and placed in QUARANTINE mode.",
        "asset_id": asset.id,
        "environment": asset.environment,
    }

