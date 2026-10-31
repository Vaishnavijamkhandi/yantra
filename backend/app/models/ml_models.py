"""
DB models for ML component:
  - EPSSScore      : FIRST.org EPSS exploit-probability per CVE
  - MLModelCard    : Metadata for trained models (anomaly or supervised)
"""
from __future__ import annotations

from datetime import date, datetime, timezone
from sqlalchemy import String, Float, Date, DateTime, Integer, Text, Boolean
from sqlalchemy.orm import Mapped, mapped_column
from app.db.database import Base


class EPSSScore(Base):
    """FIRST.org EPSS daily snapshot — one row per CVE."""
    __tablename__ = "epss_scores"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    cve_id: Mapped[str] = mapped_column(String(30), unique=True, nullable=False, index=True)
    epss_score: Mapped[float] = mapped_column(Float, nullable=False)
    percentile: Mapped[float] = mapped_column(Float, nullable=False)
    score_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    @property
    def is_high_risk(self) -> bool:
        """True if EPSS percentile >= 0.90 (top 10% most exploitable)."""
        return self.percentile >= 0.90

    @property
    def risk_label(self) -> int:
        """Binary label for supervised ML: 1 = high exploitation risk."""
        return 1 if self.is_high_risk else 0


class MLModelCard(Base):
    """
    Metadata record for each trained ML model.
    Stores evaluation metrics as JSON text so we can display them in the UI.
    """
    __tablename__ = "ml_model_cards"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    mode: Mapped[str] = mapped_column(String(20), nullable=False)          # "anomaly" | "supervised"
    algorithm: Mapped[str] = mapped_column(String(50), nullable=False)     # "IsolationForest" | "RandomForest" etc.
    model_path: Mapped[str] = mapped_column(String(500), nullable=False)   # .joblib file path
    feature_names: Mapped[str] = mapped_column(Text, nullable=False)       # JSON list
    training_rows: Mapped[int | None] = mapped_column(Integer, nullable=True)
    test_rows: Mapped[int | None] = mapped_column(Integer, nullable=True)
    roc_auc: Mapped[float | None] = mapped_column(Float, nullable=True)
    f1_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    precision: Mapped[float | None] = mapped_column(Float, nullable=True)
    recall: Mapped[float | None] = mapped_column(Float, nullable=True)
    metrics_json: Mapped[str | None] = mapped_column(Text, nullable=True)  # full report JSON
    epss_threshold: Mapped[float | None] = mapped_column(Float, nullable=True)  # label threshold used
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    warning: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        default="Experimental model. Labels derived from EPSS scores, not confirmed hospital incidents. "
                "Do not use as the sole basis for security decisions.",
    )
    trained_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
