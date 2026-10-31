"""
Supervised ML pipeline — Logistic Regression, Random Forest, Gradient Boosting.

Labels are derived from EPSS percentile scores:
  percentile >= 0.90  → label = 1 (high exploitation risk)
  percentile <  0.90  → label = 0 (lower exploitation risk)

This is experimental. Labels are NOT confirmed hospital incident records.
Every model output includes a prominent warning to that effect.
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

MODEL_DIR = Path(__file__).parent / "model_store"
EPSS_LABEL_THRESHOLD = 0.90


def train_supervised_models(db: "Session") -> dict:
    """
    Train LR, RF, and GB on EPSS-labeled asset-vulnerability features.
    Saves the best model and all evaluation metrics.
    Returns a comparison dict.
    """
    try:
        import joblib
        import pandas as pd
        import numpy as np
        from sklearn.linear_model import LogisticRegression
        from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
        from sklearn.preprocessing import StandardScaler
        from sklearn.pipeline import Pipeline
        from sklearn.model_selection import train_test_split, StratifiedKFold, cross_val_score
        from sklearn.metrics import (
            classification_report, roc_auc_score,
            precision_score, recall_score, f1_score, confusion_matrix,
        )
        from sklearn.impute import SimpleImputer
        from sklearn.calibration import CalibratedClassifierCV
    except ImportError as exc:
        raise RuntimeError("ML deps missing: pip install scikit-learn joblib pandas numpy") from exc

    from app.ml.features import build_feature_dataframe, FEATURE_COLS
    from app.models.ml_models import MLModelCard

    # ── Load features ──────────────────────────────────────────────────────────
    df = build_feature_dataframe(db, include_labels=True)
    if df.empty:
        raise ValueError("No asset-vulnerability records with EPSS data found.")

    # Drop rows with missing label
    df = df.dropna(subset=["label"])
    if df["label"].nunique() < 2:
        raise ValueError(
            "Only one class present in labels. "
            "Ensure EPSS data is loaded and some CVEs have percentile >= 0.90."
        )

    X = df[FEATURE_COLS].fillna(0)
    y = df["label"].astype(int)

    n_positive = int(y.sum())
    n_negative = int((y == 0).sum())
    logger.info("Label distribution — positive (high-risk): %d, negative: %d", n_positive, n_negative)

    if len(X) < 30:
        raise ValueError(f"Need at least 30 labelled rows; got {len(X)}. Run a vulnerability assessment first.")

    # ── Train/test split (stratified) ─────────────────────────────────────────
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.25, random_state=42, stratify=y
    )

    # ── Model definitions ──────────────────────────────────────────────────────
    models = {
        "LogisticRegression": Pipeline([
            ("imputer", SimpleImputer(strategy="median")),
            ("scaler", StandardScaler()),
            ("clf", LogisticRegression(
                class_weight="balanced", max_iter=1000, random_state=42,
            )),
        ]),
        "RandomForest": Pipeline([
            ("imputer", SimpleImputer(strategy="median")),
            ("clf", RandomForestClassifier(
                n_estimators=300, class_weight="balanced",
                min_samples_leaf=2, random_state=42, n_jobs=-1,
            )),
        ]),
        "GradientBoosting": Pipeline([
            ("imputer", SimpleImputer(strategy="median")),
            ("scaler", StandardScaler()),
            ("clf", GradientBoostingClassifier(
                n_estimators=200, learning_rate=0.05,
                max_depth=4, random_state=42,
            )),
        ]),
    }

    results = {}
    best_name = None
    best_roc = -1.0

    for name, pipeline in models.items():
        logger.info("Training %s ...", name)
        pipeline.fit(X_train, y_train)
        proba = pipeline.predict_proba(X_test)[:, 1]
        preds = pipeline.predict(X_test)

        roc = float(roc_auc_score(y_test, proba)) if y_test.nunique() == 2 else None
        report = classification_report(y_test, preds, output_dict=True, zero_division=0)
        cm = confusion_matrix(y_test, preds).tolist()

        # Cross-validated ROC-AUC for robustness check
        cv_roc = cross_val_score(
            pipeline, X, y, cv=StratifiedKFold(n_splits=5, shuffle=True, random_state=42),
            scoring="roc_auc", n_jobs=-1,
        )

        # Feature importances (where available)
        importances = None
        clf = pipeline.named_steps.get("clf")
        if hasattr(clf, "feature_importances_"):
            importances = dict(zip(FEATURE_COLS, [float(v) for v in clf.feature_importances_]))
        elif hasattr(clf, "coef_"):
            importances = dict(zip(FEATURE_COLS, [float(v) for v in clf.coef_[0]]))

        results[name] = {
            "roc_auc": roc,
            "cv_roc_auc_mean": float(cv_roc.mean()),
            "cv_roc_auc_std": float(cv_roc.std()),
            "precision": float(precision_score(y_test, preds, zero_division=0)),
            "recall": float(recall_score(y_test, preds, zero_division=0)),
            "f1": float(f1_score(y_test, preds, zero_division=0)),
            "confusion_matrix": cm,
            "classification_report": report,
            "feature_importances": importances,
        }

        if roc is not None and roc > best_roc:
            best_roc = roc
            best_name = name

    # ── Save best model ────────────────────────────────────────────────────────
    best_pipeline = models[best_name]
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    model_path = MODEL_DIR / "best_supervised.joblib"
    joblib.dump({
        "pipeline": best_pipeline,
        "algorithm": best_name,
        "feature_cols": FEATURE_COLS,
        "epss_threshold": EPSS_LABEL_THRESHOLD,
        "trained_at": datetime.now(timezone.utc).isoformat(),
    }, model_path)
    logger.info("Best model (%s, ROC-AUC=%.3f) saved → %s", best_name, best_roc, model_path)

    # Also save individual models
    for name, pipeline in models.items():
        p = MODEL_DIR / f"{name.lower()}.joblib"
        joblib.dump({"pipeline": pipeline, "feature_cols": FEATURE_COLS}, p)

    # ── Write model cards to DB ────────────────────────────────────────────────
    db.query(MLModelCard).filter(MLModelCard.mode == "supervised").update({"is_active": False})

    for name, res in results.items():
        is_best = name == best_name
        card = MLModelCard(
            mode="supervised",
            algorithm=name,
            model_path=str(MODEL_DIR / f"{name.lower()}.joblib"),
            feature_names=json.dumps(FEATURE_COLS),
            training_rows=len(X_train),
            test_rows=len(X_test),
            roc_auc=res["roc_auc"],
            f1_score=res["f1"],
            precision=res["precision"],
            recall=res["recall"],
            metrics_json=json.dumps(res),
            epss_threshold=EPSS_LABEL_THRESHOLD,
            is_active=is_best,
        )
        db.add(card)

    db.commit()

    return {
        "training_rows": len(X_train),
        "test_rows": len(X_test),
        "label_distribution": {"positive": n_positive, "negative": n_negative},
        "epss_threshold": EPSS_LABEL_THRESHOLD,
        "model_results": results,
        "best_model": best_name,
        "best_roc_auc": best_roc,
        "warning": (
            "Experimental. Labels derived from EPSS percentile scores, "
            "not confirmed hospital incidents. Use as a prioritisation aid only."
        ),
    }


def predict_asset_risk(asset_id: int, db: "Session") -> dict | None:
    """
    Use the best saved supervised model to predict exploitation risk for one asset.
    Returns None if model not trained yet.
    """
    try:
        import joblib
        import pandas as pd
    except ImportError:
        return None

    model_path = MODEL_DIR / "best_supervised.joblib"
    if not model_path.exists():
        return None

    try:
        payload = joblib.load(model_path)
        pipeline = payload["pipeline"]
        feature_cols = payload["feature_cols"]
        algorithm = payload.get("algorithm", "unknown")
    except Exception as exc:
        logger.error("Failed to load supervised model: %s", exc)
        return None

    from app.ml.features import build_feature_dataframe
    df = build_feature_dataframe(db, include_labels=False)
    asset_df = df[df["asset_id"] == asset_id]
    if asset_df.empty:
        return None

    asset_features = asset_df[feature_cols].fillna(0).mean().to_frame().T
    proba = float(pipeline.predict_proba(asset_features)[:, 1][0])

    return {
        "asset_id": asset_id,
        "exploitation_probability": round(proba, 4),
        "risk_flag": proba >= 0.5,
        "algorithm": algorithm,
        "warning": "Experimental prediction. Not a confirmed security assessment.",
    }
