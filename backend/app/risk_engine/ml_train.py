"""Train an experimental asset-risk classifier from labelled historical data.

This script is intentionally NOT imported by the FastAPI application.
It requires the optional ML dependencies:
    pip install -e ".[ml]"

Expected CSV columns:
    severity, exploitability, exposure, criticality, incident

All feature columns must be numeric 0-100. `incident` is a labelled binary outcome
(0/1) defined over a clearly documented prediction horizon. Do not use the current
risk score as the target and then claim to predict incidents.
"""
from __future__ import annotations

import argparse
from pathlib import Path
import json


FEATURES = ["severity", "exploitability", "exposure", "criticality"]
TARGET = "incident"


def main():
    parser = argparse.ArgumentParser(description="Train experimental cyber-risk model")
    parser.add_argument("--data", required=True, help="Path to labelled historical CSV")
    parser.add_argument("--target", default=TARGET)
    parser.add_argument("--output", default="artifacts/risk_model.joblib")
    parser.add_argument("--test-size", type=float, default=0.25)
    args = parser.parse_args()

    try:
        import joblib
        import pandas as pd
        from sklearn.compose import make_column_selector
        from sklearn.impute import SimpleImputer
        from sklearn.metrics import classification_report, roc_auc_score
        from sklearn.model_selection import train_test_split
        from sklearn.pipeline import Pipeline
        from sklearn.ensemble import RandomForestClassifier
    except ImportError as exc:
        raise SystemExit('Install ML dependencies with: pip install -e ".[ml]"') from exc

    data = pd.read_csv(args.data)
    required = FEATURES + [args.target]
    missing = [column for column in required if column not in data.columns]
    if missing:
        raise SystemExit(f"Missing required columns: {missing}")
    data = data[required].dropna(subset=[args.target])
    if data[args.target].nunique() < 2:
        raise SystemExit("Target must contain both classes (0 and 1).")
    X = data[FEATURES].apply(pd.to_numeric, errors="coerce")
    y = pd.to_numeric(data[args.target], errors="coerce")
    valid = y.isin([0, 1])
    X, y = X.loc[valid], y.loc[valid].astype(int)
    if len(X) < 30:
        raise SystemExit("At least 30 labelled rows are required for this experimental script; more is strongly recommended.")

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=args.test_size, random_state=42, stratify=y
    )
    model = Pipeline([
        ("imputer", SimpleImputer(strategy="median")),
        ("classifier", RandomForestClassifier(
            n_estimators=300, class_weight="balanced", random_state=42,
            min_samples_leaf=2
        )),
    ])
    model.fit(X_train, y_train)
    probabilities = model.predict_proba(X_test)[:, 1]
    predictions = model.predict(X_test)
    report = classification_report(y_test, predictions, output_dict=True, zero_division=0)
    metrics = {
        "rows": int(len(data)),
        "train_rows": int(len(X_train)),
        "test_rows": int(len(X_test)),
        "roc_auc": float(roc_auc_score(y_test, probabilities)) if y_test.nunique() == 2 else None,
        "classification_report": report,
        "features": FEATURES,
        "target": args.target,
        "warning": "Experimental only. Use temporal validation, leakage checks, calibration and domain review before operational use."
    }

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump({"pipeline": model, "features": FEATURES, "target": args.target}, output)
    metrics_path = output.with_suffix(".metrics.json")
    metrics_path.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    print(json.dumps({"model": str(output), "metrics": str(metrics_path), "roc_auc": metrics["roc_auc"]}, indent=2))


if __name__ == "__main__":
    main()
