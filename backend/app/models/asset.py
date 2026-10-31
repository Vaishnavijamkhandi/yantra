from datetime import datetime, timezone
from sqlalchemy import String, Integer, DateTime, ForeignKey
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

    vulnerabilities: Mapped[list["AssetVulnerability"]] = relationship(  # noqa: F821
        "AssetVulnerability",
        back_populates="asset",
        cascade="all, delete-orphan",
    )

