from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.asset import Asset
from app.models.risk import RiskAssessment
from app.models.gap import InfrastructureGap
from app.models.vulnerability import AssetVulnerability
from app.services.report_service import generate_pdf_report

router = APIRouter(prefix="/api/reports", tags=["Reports"])


@router.get("/summary")
def get_reports_summary(db: Session = Depends(get_db)):
    """
    Returns an aggregated snapshot of all datasets included in the final executive report.
    """
    assets_count = db.query(Asset).count()
    risks_count = db.query(RiskAssessment).count()
    gaps_count = db.query(InfrastructureGap).count()
    vulns_count = db.query(AssetVulnerability).count()
    critical_risks = db.query(RiskAssessment).filter(RiskAssessment.risk_score >= 80.0).count()

    return {
        "status": "ready",
        "total_assets": assets_count,
        "assessed_assets": risks_count,
        "critical_risks": critical_risks,
        "detected_gaps": gaps_count,
        "matched_vulnerabilities": vulns_count,
        "report_format": "PDF / Executive & Technical",
        "platform": "CyberSentra Enterprise Enterprise Cyber-Risk",
    }


@router.get("/download-pdf")
def download_pdf_report(db: Session = Depends(get_db)):
    """
    Generates and streams a genuine publication-grade Cyber-Risk Assessment PDF Report.
    """
    pdf_bytes = generate_pdf_report(db)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": 'attachment; filename="CyberSentra_Critical_Infrastructure_Report.pdf"',
            "Content-Type": "application/pdf",
        },
    )

