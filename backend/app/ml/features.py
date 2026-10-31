"""
Feature extraction for the ML component.

Builds a pandas DataFrame from the DB where each row represents one
(asset, vulnerability) pairing enriched with EPSS data.

Features (all numeric, 0-100 scale unless noted):
  - cvss_score_norm     : CVSS base score × 10   (0-100)
  - severity_encoded    : CRITICAL=100, HIGH=75, MEDIUM=50, LOW=25, UNKNOWN=0
  - epss_score_pct      : EPSS score × 100        (0-100)
  - epss_percentile_pct : EPSS percentile × 100   (0-100)
  - exposure_encoded    : internet=100, dmz=60, internal=30, isolated=10, unknown=20
  - criticality_score   : asset criticality        (0-100)
  - match_confidence    : cpe=100, keyword=50      (0-100)
  - asset_type_encoded  : label-encoded integer

Label (supervised only):
  - label               : 1 if epss_percentile >= threshold, else 0
"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

# ── Encoding maps ─────────────────────────────────────────────────────────────

SEVERITY_MAP: dict[str, float] = {
    "CRITICAL": 100.0,
    "HIGH": 75.0,
    "MEDIUM": 50.0,
    "LOW": 25.0,
}

EXPOSURE_MAP: dict[str, float] = {
    "internet-facing": 100.0,
    "dmz": 60.0,
    "internal": 30.0,
    "isolated": 10.0,
}

ASSET_TYPE_MAP: dict[str, int] = {
    "server": 0,
    "database": 1,
    "workstation": 2,
    "medical_device": 3,
    "iot": 4,
    "network_device": 5,
    "gateway": 6,
    "cloud": 7,
}

MATCH_CONFIDENCE: dict[str, float] = {
    "cpe": 100.0,
    "keyword": 50.0,
}

EPSS_LABEL_THRESHOLD = 0.90  # percentile


# ── Main extractor ─────────────────────────────────────────────────────────────

def build_feature_dataframe(db: "Session", include_labels: bool = True):
    """
    Query DB and return a pandas DataFrame of ML features.

    Each row = one (asset × vulnerability) pair with EPSS enrichment.
    Rows without a matching EPSS record are still included (EPSS features = 0).

    Parameters
    ----------
    db             : SQLAlchemy session
    include_labels : If True, adds a 'label' column (EPSS percentile >= threshold → 1)

    Returns
    -------
    pd.DataFrame or None if pandas not available / no data
    """
    try:
        import pandas as pd
    except ImportError:
        raise RuntimeError("pandas is required: pip install pandas")

    from app.models.asset import Asset
    from app.models.vulnerability import Vulnerability, AssetVulnerability
    from app.models.ml_models import EPSSScore

    # Join: asset_vulnerabilities ⟕ vulnerabilities ⟕ epss_scores
    rows = (
        db.query(
            AssetVulnerability.id.label("av_id"),
            AssetVulnerability.asset_id,
            AssetVulnerability.match_method,
            Asset.asset_type,
            Asset.exposure,
            Asset.criticality_score,
            Vulnerability.cve_id,
            Vulnerability.cvss_score,
            Vulnerability.severity,
            EPSSScore.epss_score,
            EPSSScore.percentile,
        )
        .join(Asset, AssetVulnerability.asset_id == Asset.id)
        .join(Vulnerability, AssetVulnerability.vulnerability_id == Vulnerability.id)
        .outerjoin(EPSSScore, Vulnerability.cve_id == EPSSScore.cve_id)
        .all()
    )

    if not rows:
        logger.warning("No asset-vulnerability records found — feature DataFrame is empty")
        return pd.DataFrame()

    records = []
    for r in rows:
        rec = {
            "av_id": r.av_id,
            "asset_id": r.asset_id,
            "cve_id": r.cve_id,
            # Features
            "cvss_score_norm": float(r.cvss_score * 10) if r.cvss_score else 0.0,
            "severity_encoded": SEVERITY_MAP.get((r.severity or "").upper(), 0.0),
            "epss_score_pct": float(r.epss_score * 100) if r.epss_score else 0.0,
            "epss_percentile_pct": float(r.percentile * 100) if r.percentile else 0.0,
            "exposure_encoded": EXPOSURE_MAP.get((r.exposure or "").lower(), 20.0),
            "criticality_score": float(r.criticality_score) if r.criticality_score else 50.0,
            "match_confidence": MATCH_CONFIDENCE.get((r.match_method or "").lower(), 50.0),
            "asset_type_encoded": float(ASSET_TYPE_MAP.get((r.asset_type or "").lower(), 8)),
        }
        if include_labels:
            pct = r.percentile if r.percentile is not None else 0.0
            rec["label"] = 1 if pct >= EPSS_LABEL_THRESHOLD else 0

        records.append(rec)

    df = pd.DataFrame(records)
    logger.info(
        "Feature DataFrame: %d rows, %d cols. Label distribution: %s",
        len(df),
        len(df.columns),
        df["label"].value_counts().to_dict() if include_labels and "label" in df.columns else "N/A",
    )
    return df


FEATURE_COLS = [
    "cvss_score_norm",
    "severity_encoded",
    "epss_score_pct",
    "epss_percentile_pct",
    "exposure_encoded",
    "criticality_score",
    "match_confidence",
    "asset_type_encoded",
]

