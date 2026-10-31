from __future__ import annotations

import math
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.models.asset import Asset, AssetDependency
from app.models.vulnerability import AssetVulnerability, Vulnerability
from app.models.risk import RiskAssessment

# Configurable Weights (Phase 3 requirement)
WEIGHT_SEVERITY = 0.40
WEIGHT_EXPLOITABILITY = 0.20
WEIGHT_EXPOSURE = 0.20
WEIGHT_CRITICALITY = 0.20

CRITICALITY_MAP = {
    "critical": 100.0,
    "high": 75.0,
    "medium": 45.0,
    "low": 20.0,
}

EXPOSURE_MAP = {
    "internet_facing": 100.0,
    "internet-facing": 100.0,
    "partner": 65.0,
    "internal": 35.0,
    "isolated": 10.0,
}


def classify_risk_level(score: float) -> str:
    if score >= 80.0:
        return "Critical"
    if score >= 60.0:
        return "High"
    if score >= 30.0:
        return "Medium"
    return "Low"


def calculate_asset_risk(asset: Asset, db: Session) -> dict:
    """
    Computes a deterministic, explainable risk score (0-100) for a given asset.
    Accounts for compounding vulnerability counts, exploitability, network exposure,
    and clinical/mission criticality.
    """
    # 1. Fetch matched vulnerabilities
    links = (
        db.query(AssetVulnerability)
        .filter(AssetVulnerability.asset_id == asset.id)
        .all()
    )
    vuln_ids = [link.vulnerability_id for link in links]
    vulns = (
        db.query(Vulnerability)
        .filter(Vulnerability.id.in_(vuln_ids))
        .all()
        if vuln_ids
        else []
    )

    crit_key = (asset.criticality or "medium").strip().lower()
    exp_key = (asset.exposure or "internal").strip().lower().replace(" ", "_")

    criticality_score = CRITICALITY_MAP.get(crit_key, 45.0)
    exposure_score = EXPOSURE_MAP.get(exp_key, 35.0)

    n_vulns = len(vulns)
    cisa_kev_flag = False

    if n_vulns > 0:
        cvss_scores = [v.cvss_score for v in vulns if v.cvss_score is not None]
        highest_cvss = max(cvss_scores) if cvss_scores else 5.0

        # Compounding severity penalty for multiple CVEs
        # Base = Highest CVSS * 10
        # Diminishing penalty = min(15.0, 3.0 * ln(N))
        compounding_penalty = 0.0
        if n_vulns > 1:
            compounding_penalty = min(15.0, 3.0 * math.log(n_vulns))

        severity_score = min(100.0, (highest_cvss * 10.0) + compounding_penalty)

        # Check for active exploitation indicators (CISA KEV / Known Ransomware)
        for v in vulns:
            desc = (v.description or "").lower()
            if "cisa" in desc or "actively exploited" in desc or "ransomware" in desc:
                cisa_kev_flag = True
                break

        if cisa_kev_flag:
            exploitability_score = 100.0
        else:
            exploitability_score = min(100.0, max(40.0, highest_cvss * 9.5))

        # Standard Weighted Heuristic
        raw_score = (
            (WEIGHT_SEVERITY * severity_score)
            + (WEIGHT_EXPLOITABILITY * exploitability_score)
            + (WEIGHT_EXPOSURE * exposure_score)
            + (WEIGHT_CRITICALITY * criticality_score)
        )
        evidence_coverage = "confirmed_matches"

        highest_cve_id = next(
            (v.cve_id for v in vulns if v.cvss_score == highest_cvss),
            vulns[0].cve_id,
        )
        explanation = (
            f"Highest matched CVE is {highest_cve_id} (CVSS {highest_cvss:.1f}). "
            f"Asset has {n_vulns} detected vulnerability match{'es' if n_vulns > 1 else ''}. "
            f"Network exposure is {asset.exposure} and clinical criticality is {asset.criticality}."
        )
        if cisa_kev_flag:
            explanation += " ⚠️ URGENT: Active in-the-wild exploitation / CISA KEV alert detected!"

    else:
        # Absence of CVE match != 0% risk. Apply uncertainty floor based on Exposure & Criticality.
        severity_score = 0.0
        exploitability_score = 20.0
        raw_score = (0.25 * exposure_score) + (0.35 * criticality_score) + 10.0
        evidence_coverage = "limited_evidence"
        explanation = (
            "No vulnerability match is currently stored in the database. "
            "This does not guarantee the asset is secure. "
            "Risk score reflects baseline exposure, criticality, and an uncertainty floor."
        )

    final_score = round(max(0.0, min(100.0, raw_score)), 1)
    risk_level = classify_risk_level(final_score)

    # Generate actionable remediation guidance
    recommendations = []
    if n_vulns > 0:
        recommendations.append(
            f"Prioritize patching software associated with {highest_cve_id} to latest vendor release."
        )
    if exposure_score >= 65.0:
        recommendations.append(
            f"Review network exposure: {asset.exposure} should be restricted via ACLs or placed behind a secure VPN gateway."
        )
    if criticality_score >= 75.0:
        recommendations.append(
            f"Confirm backup integrity, failover protocols, and incident-response playbooks for this {asset.criticality} asset."
        )
    if n_vulns == 0:
        recommendations.append(
            "Schedule continuous vulnerability scans and review installed software inventory regularly."
        )

    factors = {
        "severity": round(severity_score, 1),
        "exploitability": round(exploitability_score, 1),
        "exposure": round(exposure_score, 1),
        "criticality": round(criticality_score, 1),
        "matched_cve_count": n_vulns,
        "cisa_kev_alert": cisa_kev_flag,
        "weights": {
            "severity": WEIGHT_SEVERITY,
            "exploitability": WEIGHT_EXPLOITABILITY,
            "exposure": WEIGHT_EXPOSURE,
            "criticality": WEIGHT_CRITICALITY,
        },
    }

    return {
        "asset_id": asset.id,
        "risk_score": final_score,
        "risk_level": risk_level,
        "severity_score": round(severity_score, 1),
        "exploitability_score": round(exploitability_score, 1),
        "exposure_score": round(exposure_score, 1),
        "criticality_score": round(criticality_score, 1),
        "factors": factors,
        "explanation": explanation,
        "evidence_coverage": evidence_coverage,
        "recommendations": recommendations,
    }


def assess_dependency_impact(asset: Asset, db: Session) -> dict:
    """Return a simple blast-radius and impacted-service view for a compromised asset."""
    downstream = (
        db.query(AssetDependency)
        .filter(AssetDependency.source_asset_id == asset.id)
        .all()
    )
    upstream = (
        db.query(AssetDependency)
        .filter(AssetDependency.target_asset_id == asset.id)
        .all()
    )

    affected_assets = []
    for dep in downstream:
        target = db.query(Asset).filter(Asset.id == dep.target_asset_id).first()
        if target and target.asset_name not in affected_assets:
            affected_assets.append(target.asset_name)

    supporting_assets = []
    for dep in upstream:
        source = db.query(Asset).filter(Asset.id == dep.source_asset_id).first()
        if source and source.asset_name not in supporting_assets:
            supporting_assets.append(source.asset_name)

    blast_radius = len(affected_assets) + len(supporting_assets)
    recommendations = []
    if downstream:
        for dep in downstream:
            if dep.service_impact:
                recommendations.append(
                    f"Contain {asset.asset_name} immediately to prevent impact on {dep.target_asset.asset_name}: {dep.service_impact}."
                )
                break
    if not recommendations:
        recommendations.append(
            f"Isolate {asset.asset_name} and confirm service continuity for dependent systems before reactivation."
        )

    return {
        "asset_id": asset.id,
        "asset_name": asset.asset_name,
        "downstream_assets": affected_assets,
        "upstream_dependencies": supporting_assets,
        "affected_assets": affected_assets,
        "blast_radius": blast_radius,
        "recommendations": recommendations,
    }


def assess_and_save_asset_risk(asset: Asset, db: Session) -> RiskAssessment:
    """Calculates risk score and persists the result to risk_assessments table."""
    result = calculate_asset_risk(asset, db)
    assessment = RiskAssessment(
        asset_id=asset.id,
        risk_score=result["risk_score"],
        risk_level=result["risk_level"],
        severity_score=result["severity_score"],
        exploitability_score=result["exploitability_score"],
        exposure_score=result["exposure_score"],
        criticality_score=result["criticality_score"],
        factors=result["factors"],
        explanation=result["explanation"],
        evidence_coverage=result["evidence_coverage"],
        recommendations=result["recommendations"],
        assessed_at=datetime.now(timezone.utc),
    )
    db.add(assessment)
    db.commit()
    db.refresh(assessment)
    return assessment

