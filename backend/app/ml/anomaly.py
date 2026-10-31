"""
Isolation Forest anomaly detector.

Detects assets whose vulnerability/EPSS profile is statistically unusual
compared to the rest of the fleet — even if their deterministic risk score
looks normal.

This module requires NO labeled data. It runs as soon as there are
asset-vulnerability records in the DB.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path
from datetime import datetime, timezone
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

MODEL_PATH = Path(__file__).parent / "model_store" / "isolation_forest.joblib"

# IsolationForest contamination: expected fraction of outliers in the fleet.
# 10% is a reasonable assumption for a hospital environment.
CONTAMINATION = 0.10


def train_anomaly_model(db: "Session") -> dict:
    """
    Fit an Isolation Forest on the current fleet's feature matrix.
    Saves the model to model_store/ and writes a MLModelCard to DB.

    Returns a summary dict with training stats.
    """
    try:
        import joblib
        import pandas as pd
        from sklearn.ensemble import IsolationForest
        from sklearn.preprocessing import StandardScaler
        from sklearn.pipeline import Pipeline
    except ImportError as exc:
        raise RuntimeError("ML deps missing: pip install scikit-learn joblib pandas") from exc

    from app.ml.features import build_feature_dataframe, FEATURE_COLS
    from app.models.ml_models import MLModelCard

    df = build_feature_dataframe(db, include_labels=False)
    if df.empty or len(df) < 5:
        raise ValueError("Need at least 5 asset-vulnerability records to train anomaly model")

    # Aggregate to asset level (mean features per asset)
    asset_df = df.groupby("asset_id")[FEATURE_COLS].mean().reset_index()
    X = asset_df[FEATURE_COLS].fillna(0)

    pipeline = Pipeline([
        ("scaler", StandardScaler()),
        ("model", IsolationForest(
            n_estimators=200,
            contamination=CONTAMINATION,
            random_state=42,
            n_jobs=-1,
        )),
    ])
    pipeline.fit(X)

    # Score all assets (-1=outlier, 1=normal; decision_function gives continuous score)
    raw_scores = pipeline.decision_function(X)  # higher = more normal
    # Invert and normalise to 0-100 where 100 = most anomalous
    min_s, max_s = raw_scores.min(), raw_scores.max()
    if max_s > min_s:
        anomaly_scores = 100 * (1 - (raw_scores - min_s) / (max_s - min_s))
    else:
        anomaly_scores = [50.0] * len(raw_scores)

    asset_df = asset_df.copy()
    asset_df["anomaly_score"] = anomaly_scores
    asset_df["is_anomaly"] = pipeline.predict(X) == -1  # True if outlier

    # Persist model
    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    model_payload = {
        "pipeline": pipeline,
        "feature_cols": FEATURE_COLS,
        "asset_scores": asset_df[["asset_id", "anomaly_score", "is_anomaly"]].to_dict("records"),
        "trained_at": datetime.now(timezone.utc).isoformat(),
    }
    joblib.dump(model_payload, MODEL_PATH)
    logger.info("Isolation Forest saved → %s", MODEL_PATH)

    # Write model card to DB
    n_anomalies = int(asset_df["is_anomaly"].sum())
    card = MLModelCard(
        mode="anomaly",
        algorithm="IsolationForest",
        model_path=str(MODEL_PATH),
        feature_names=json.dumps(FEATURE_COLS),
        training_rows=len(asset_df),
        metrics_json=json.dumps({
            "n_assets": len(asset_df),
            "n_anomalies": n_anomalies,
            "contamination": CONTAMINATION,
            "top_anomalies": asset_df.nlargest(5, "anomaly_score")[["asset_id", "anomaly_score"]].to_dict("records"),
        }),
        trained_at=datetime.now(timezone.utc),
    )
    # Deactivate old anomaly cards
    db.query(MLModelCard).filter(MLModelCard.mode == "anomaly").update({"is_active": False})
    db.add(card)
    db.commit()
    db.refresh(card)

    return {
        "model_card_id": card.id,
        "assets_analysed": len(asset_df),
        "anomalies_detected": n_anomalies,
        "model_path": str(MODEL_PATH),
    }


def get_anomaly_scores(db: "Session") -> list[dict]:
    """
    Load the latest Isolation Forest model and return per-asset anomaly scores.
    Returns empty list if model not yet trained.
    """
    try:
        import joblib
    except ImportError:
        return []

    if not MODEL_PATH.exists():
        return []

    try:
        payload = joblib.load(MODEL_PATH)
        return payload.get("asset_scores", [])
    except Exception as exc:
        logger.error("Failed to load anomaly model: %s", exc)
        return []

