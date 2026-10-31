from datetime import datetime, timezone
from sqlalchemy import String, Integer, DateTime, ForeignKey, Float
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.database import Base


class AssetSoftware(Base):
    __tablename__ = "asset_software"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    asset_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("assets.id", ondelete="CASCADE"), nullable=False
    )
    software_name: Mapped[str] = mapped_column(String(150), nullable=False)
    vendor: Mapped[str | None] = mapped_column(String(150), nullable=True)
    version: Mapped[str] = mapped_column(String(50), nullable=False)
    software_type: Mapped[str] = mapped_column(String(80), nullable=False)

    asset: Mapped["Asset"] = relationship("Asset", back_populates="software")


class AssetDependency(Base):
    __tablename__ = "asset_dependencies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    source_asset_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("assets.id", ondelete="CASCADE"), nullable=False
    )
    target_asset_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("assets.id", ondelete="CASCADE"), nullable=False
    )
    dependency_type: Mapped[str] = mapped_column(String(30), nullable=False, default="depends_on")
    dependency_strength: Mapped[float] = mapped_column(Float, nullable=False, default=0.5)
    service_impact: Mapped[str | None] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    source_asset: Mapped["Asset"] = relationship(
        "Asset",
        foreign_keys=[source_asset_id],
        back_populates="outgoing_dependencies",
    )
    target_asset: Mapped["Asset"] = relationship(
        "Asset",
        foreign_keys=[target_asset_id],
        back_populates="incoming_dependencies",
    )


class Asset(Base):
    __tablename__ = "assets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    asset_name: Mapped[str] = mapped_column(String(150), nullable=False)
    asset_type: Mapped[str] = mapped_column(String(50), nullable=False)
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    operating_system: Mapped[str | None] = mapped_column(String(100), nullable=True)
    criticality: Mapped[str] = mapped_column(String(20), nullable=False)
    exposure: Mapped[str] = mapped_column(String(20), nullable=False)
    department: Mapped[str | None] = mapped_column(String(100), nullable=True)
    environment: Mapped[str] = mapped_column(String(50), nullable=False, default="Simulated")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    software: Mapped[list["AssetSoftware"]] = relationship(
        "AssetSoftware",
        back_populates="asset",
        cascade="all, delete-orphan",
    )

    outgoing_dependencies: Mapped[list["AssetDependency"]] = relationship(
        "AssetDependency",
        foreign_keys="AssetDependency.source_asset_id",
        back_populates="source_asset",
        cascade="all, delete-orphan",
    )
    incoming_dependencies: Mapped[list["AssetDependency"]] = relationship(
        "AssetDependency",
        foreign_keys="AssetDependency.target_asset_id",
        back_populates="target_asset",
        cascade="all, delete-orphan",
    )

    vulnerabilities: Mapped[list["AssetVulnerability"]] = relationship(  # noqa: F821
        "AssetVulnerability",
        back_populates="asset",
        cascade="all, delete-orphan",
    )

    risk_assessments: Mapped[list["RiskAssessment"]] = relationship(  # noqa: F821
        "RiskAssessment",
        back_populates="asset",
        cascade="all, delete-orphan",
    )
