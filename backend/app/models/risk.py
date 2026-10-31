from datetime import datetime, timezone
from sqlalchemy import Integer, Float, String, Text, JSON, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.database import Base


class RiskAssessment(Base):
    __tablename__ = "risk_assessments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    asset_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("assets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    risk_score: Mapped[float] = mapped_column(Float, nullable=False, index=True)
    risk_level: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    severity_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    exploitability_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    exposure_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    criticality_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    factors: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    explanation: Mapped[str] = mapped_column(Text, nullable=False)
    evidence_coverage: Mapped[str] = mapped_column(String(40), nullable=False, default="limited_evidence")
    recommendations: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    assessed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        index=True
    )

    asset: Mapped["Asset"] = relationship("Asset", back_populates="risk_assessments")  # noqa: F821
