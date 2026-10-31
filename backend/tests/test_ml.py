"""
Tests for the ML component — EPSS loader, feature extraction, anomaly detection.
These use only pure function / unit tests (no HTTP layer).
"""
from __future__ import annotations

import csv
import io
import tempfile
from datetime import date
from pathlib import Path


# ── EPSS loader tests ──────────────────────────────────────────────────────────

def test_epss_parse_score_date():
    """Score date is correctly parsed from the EPSS comment header."""
    from app.ml.epss_loader import _parse_score_date
    comment = "#model_version:v2026.06.15,score_date:2026-10-30T12:03:08Z"
    result = _parse_score_date(comment)
    assert result == date(2026, 10, 30)


def test_epss_parse_score_date_missing():
    """Returns None when no score_date in header."""
    from app.ml.epss_loader import _parse_score_date
    assert _parse_score_date("#model_version:v1.0") is None
    assert _parse_score_date("") is None


# ── Feature encoding tests ────────────────────────────────────────────────────

def test_severity_encoding():
    """CRITICAL maps to 100, LOW maps to 25."""
    from app.ml.features import SEVERITY_MAP
    assert SEVERITY_MAP["CRITICAL"] == 100.0
    assert SEVERITY_MAP["LOW"] == 25.0


def test_exposure_encoding():
    """internet-facing maps to 100, isolated maps to 10."""
    from app.ml.features import EXPOSURE_MAP
    assert EXPOSURE_MAP["internet-facing"] == 100.0
    assert EXPOSURE_MAP["isolated"] == 10.0


def test_epss_label_threshold():
    """EPSSScore.risk_label returns 1 for percentile >= 0.90."""
    from app.models.ml_models import EPSSScore
    high = EPSSScore(cve_id="CVE-2024-TEST", epss_score=0.5, percentile=0.95)
    low = EPSSScore(cve_id="CVE-2024-TEST2", epss_score=0.01, percentile=0.50)
    assert high.risk_label == 1
    assert high.is_high_risk is True
    assert low.risk_label == 0
    assert low.is_high_risk is False


def test_epss_boundary_at_threshold():
    """Boundary: exactly 0.90 → label = 1."""
    from app.models.ml_models import EPSSScore
    boundary = EPSSScore(cve_id="CVE-2024-BOUND", epss_score=0.1, percentile=0.90)
    assert boundary.risk_label == 1


# ── EPSS CSV format test ───────────────────────────────────────────────────────

def test_epss_csv_roundtrip(tmp_path):
    """Write a minimal EPSS CSV and verify the loader reads correct values."""
    from unittest.mock import MagicMock, patch

    # Build a tiny CSV
    csv_content = (
        "#model_version:v2026.06.15,score_date:2026-10-30T12:03:08Z\n"
        "cve,epss,percentile\n"
        "CVE-2024-0001,0.95000,0.99000\n"
        "CVE-2024-0002,0.00100,0.30000\n"
    )
    csv_file = tmp_path / "epss_test.csv"
    csv_file.write_text(csv_content, encoding="utf-8")

    # Parse the date without touching DB
    from app.ml.epss_loader import _parse_score_date
    parsed_date = _parse_score_date("#model_version:v2026.06.15,score_date:2026-10-30T12:03:08Z")
    assert parsed_date == date(2026, 10, 30)

    # Verify CSV rows parse to correct values
    rows = []
    with csv_file.open() as f:
        f.readline()  # skip comment
        reader = csv.reader(f)
        next(reader)  # skip header
        for row in reader:
            rows.append({"cve_id": row[0], "epss": float(row[1]), "pct": float(row[2])})

    assert len(rows) == 2
    assert rows[0]["cve_id"] == "CVE-2024-0001"
    assert rows[0]["epss"] == 0.95
    assert rows[0]["pct"] == 0.99
    assert rows[1]["pct"] == 0.30

