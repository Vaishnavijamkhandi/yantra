from dataclasses import dataclass
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.models import Asset, AssetVulnerability, Vulnerability

CRITICALITY_SCORE = {"low": 20, "medium": 45, "high": 75, "critical": 100}
EXPOSURE_SCORE = {"isolated": 10, "internal": 35, "partner": 65, "internet_facing": 100}


def classify(score: float) -> str:
    if score >= 80:
        return "critical"
    if score >= 60:
        return "high"
    if score >= 30:
        return "medium"
    return "low"


def calculate_asset_risk(db: Session, asset: Asset) -> dict:
    links = db.scalars(
        select(AssetVulnerability).where(AssetVulnerability.asset_id == asset.id)
    ).all()
    confirmed_ids = [link.vulnerability_id for link in links if link.match_status == "confirmed"]
    vulns = db.scalars(select(Vulnerability).where(Vulnerability.id.in_(confirmed_ids))).all() if confirmed_ids else []
    highest = max((v.cvss_score or 0 for v in vulns), default=0.0)
    exploitability = max((v.exploitability_score or 0 for v in vulns), default=0.0)

    severity = min(100.0, highest * 10.0)
    # CVSS exploitability subscores are not consistently present across versions.
    # Scale observed scores to 0-100; when absent, use a neutral default and disclose it.
    exploitability_factor = min(100.0, exploitability * 20.0) if exploitability else 50.0
    exposure = float(EXPOSURE_SCORE.get(asset.exposure.value, 35))
    criticality = float(CRITICALITY_SCORE.get(asset.criticality.value, 45))

    if vulns:
        score = 0.40 * severity + 0.20 * exploitability_factor + 0.20 * exposure + 0.20 * criticality
        coverage = "confirmed_matches"
        explanation = (
            f"Highest confirmed CVSS score is {highest:.1f}; asset exposure is {asset.exposure.value}; "
            f"business criticality is {asset.criticality.value}. Review the matched CVE evidence and remediation."
        )
    else:
        # No matches must not be interpreted as zero risk.
        score = 0.20 * exposure + 0.30 * criticality + 0.50 * 20.0
        coverage = "limited"
        explanation = (
            "No confirmed vulnerability match is currently stored. This is not proof that the asset is secure. "
            "The score is a limited-evidence baseline based on exposure, criticality and an uncertainty floor."
        )

    score = round(max(0.0, min(100.0, score)), 1)
    return {
        "risk_score": score,
        "risk_level": classify(score),
        "factors": {
            "severity": round(severity, 1),
            "exploitability": round(exploitability_factor, 1),
            "exposure": exposure,
            "criticality": criticality,
            "confirmed_vulnerability_count": len(vulns),
            "uncertain_match_count": sum(1 for link in links if link.match_status == "needs_verification"),
            "weights": {"severity": 0.40, "exploitability": 0.20, "exposure": 0.20, "criticality": 0.20},
        },
        "explanation": explanation,
        "evidence_coverage": coverage,
    }
