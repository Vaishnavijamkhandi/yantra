"""
ML API routes — read-only insights + admin-only training triggers.

GET  /api/ml/status          — Is a model trained? What's the latest card?
GET  /api/ml/insights        — Per-asset anomaly scores + supervised predictions
GET  /api/ml/model-cards     — All model cards with metrics
POST /api/ml/train/anomaly   — Train / retrain Isolation Forest
POST /api/ml/train/supervised — Train LR + RF + GB
POST /api/ml/epss/load       — Import EPSS CSV into DB
"""
from __future__ import annotations

import logging
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.ml_models import MLModelCard, EPSSScore
from app.core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/ml", tags=["ML"])


# ── Status ─────────────────────────────────────────────────────────────────────

@router.get("/status")
def ml_status(db: Session = Depends(get_db)):
    """Quick check: what models are trained and when."""
    anomaly_card = (
        db.query(MLModelCard)
        .filter(MLModelCard.mode == "anomaly", MLModelCard.is_active == True)
        .order_by(MLModelCard.trained_at.desc())
        .first()
    )
    supervised_cards = (
        db.query(MLModelCard)
        .filter(MLModelCard.mode == "supervised", MLModelCard.is_active == True)
        .order_by(MLModelCard.trained_at.desc())
        .all()
    )
    epss_count = db.query(EPSSScore).count()

    return {
        "epss_records_loaded": epss_count,
        "anomaly_model_trained": anomaly_card is not None,
        "anomaly_trained_at": anomaly_card.trained_at.isoformat() if anomaly_card else None,
        "supervised_models_trained": len(supervised_cards) > 0,
        "supervised_algorithms": [c.algorithm for c in supervised_cards],
        "warning": "All ML outputs are experimental. Labels derived from EPSS scores, not hospital incidents.",
    }


# ── Model Cards ────────────────────────────────────────────────────────────────

@router.get("/model-cards")
def get_model_cards(db: Session = Depends(get_db)):
    """Return all ML model cards with their metrics."""
    import json
    cards = db.query(MLModelCard).order_by(MLModelCard.trained_at.desc()).all()
    result = []
    for card in cards:
        result.append({
            "id": card.id,
            "mode": card.mode,
            "algorithm": card.algorithm,
            "training_rows": card.training_rows,
            "test_rows": card.test_rows,
            "roc_auc": card.roc_auc,
            "f1_score": card.f1_score,
            "precision": card.precision,
            "recall": card.recall,
            "epss_threshold": card.epss_threshold,
            "is_active": card.is_active,
            "trained_at": card.trained_at.isoformat(),
            "warning": card.warning,
            "metrics": json.loads(card.metrics_json) if card.metrics_json else None,
            "feature_names": json.loads(card.feature_names) if card.feature_names else [],
        })
    return result


# ── Insights (per-asset scores) ───────────────────────────────────────────────

@router.get("/insights")
def get_ml_insights(db: Session = Depends(get_db)):
    """
    Return per-asset anomaly scores and supervised predictions.
    Assets are sorted by anomaly_score descending (most unusual first).
    """
    from app.ml.anomaly import get_anomaly_scores
    from app.models.asset import Asset

    anomaly_scores = get_anomaly_scores(db)
    anomaly_map = {row["asset_id"]: row for row in anomaly_scores}

    assets = db.query(Asset).all()
    result = []
    for asset in assets:
        anom = anomaly_map.get(asset.id, {})
        result.append({
            "asset_id": asset.id,
            "asset_name": asset.asset_name,
            "asset_type": asset.asset_type,
            "department": asset.department,
            "anomaly_score": anom.get("anomaly_score"),
            "is_anomaly": anom.get("is_anomaly"),
            "model_available": asset.id in anomaly_map,
        })

    # Sort: anomalies first, then by score desc
    result.sort(key=lambda x: (
        -(1 if x["is_anomaly"] else 0),
        -(x["anomaly_score"] or 0),
    ))

    return {
        "assets": result,
        "total": len(result),
        "anomalies_detected": sum(1 for r in result if r.get("is_anomaly")),
        "model_available": len(anomaly_scores) > 0,
        "warning": "Experimental anomaly detection. Not a substitute for a full security assessment.",
    }


# ── Training triggers ──────────────────────────────────────────────────────────

@router.post("/train/anomaly")
def train_anomaly(background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Trigger Isolation Forest training in the background."""
    from app.ml.anomaly import train_anomaly_model

    def _run():
        from app.db.database import SessionLocal
        with SessionLocal() as session:
            try:
                result = train_anomaly_model(session)
                logger.info("Anomaly training complete: %s", result)
            except Exception as exc:
                logger.error("Anomaly training failed: %s", exc)

    background_tasks.add_task(_run)
    return {"message": "Anomaly model training started in background. Check /api/ml/status for updates."}


@router.post("/train/supervised")
def train_supervised(background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Trigger supervised model training (LR + RF + GB) in background."""
    from app.ml.supervised import train_supervised_models

    epss_count = db.query(EPSSScore).count()
    if epss_count == 0:
        raise HTTPException(
            status_code=422,
            detail="No EPSS data loaded. POST /api/ml/epss/load first."
        )

    def _run():
        from app.db.database import SessionLocal
        with SessionLocal() as session:
            try:
                result = train_supervised_models(session)
                logger.info("Supervised training complete. Best: %s, ROC-AUC: %.3f",
                            result["best_model"], result["best_roc_auc"])
            except Exception as exc:
                logger.error("Supervised training failed: %s", exc)

    background_tasks.add_task(_run)
    return {
        "message": "Supervised training started (LR + RF + GradientBoosting). Check /api/ml/status.",
        "epss_records": epss_count,
        "warning": "Experimental. Labels from EPSS scores, not hospital incidents.",
    }


@router.post("/epss/load")
def load_epss(background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Load the EPSS CSV into the epss_scores table."""
    from app.ml.epss_loader import load_epss_csv

    csv_path = Path(settings.EPSS_CSV_PATH)
    if not csv_path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"EPSS CSV not found at {csv_path}. Place epss_scores.csv in dataset/"
        )

    def _run():
        from app.db.database import SessionLocal
        with SessionLocal() as session:
            try:
                result = load_epss_csv(csv_path, session)
                logger.info("EPSS load complete: %s", result)
            except Exception as exc:
                logger.error("EPSS load failed: %s", exc)

    background_tasks.add_task(_run)
    return {
        "message": "EPSS CSV loading started in background (~398k records). Check /api/ml/status.",
        "csv_path": str(csv_path),
    }


@router.get("/epss/{cve_id}")
def get_epss(cve_id: str, db: Session = Depends(get_db)):
    """Look up EPSS score for a specific CVE."""
    record = db.query(EPSSScore).filter(EPSSScore.cve_id == cve_id.upper()).first()
    if not record:
        raise HTTPException(status_code=404, detail=f"{cve_id} not found in EPSS table.")
    return {
        "cve_id": record.cve_id,
        "epss_score": record.epss_score,
        "percentile": record.percentile,
        "score_date": str(record.score_date) if record.score_date else None,
        "is_high_risk": record.is_high_risk,
        "label": record.risk_label,
    }
