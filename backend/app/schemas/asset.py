from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


# ── Software ──────────────────────────────────────────────────────────────────

class SoftwareBase(BaseModel):
    software_name: str = Field(min_length=1, max_length=150)
    vendor: Optional[str] = None
    version: str = Field(min_length=1, max_length=50)
    software_type: str = Field(min_length=1, max_length=80)


class SoftwareCreate(SoftwareBase):
    pass


class SoftwareResponse(SoftwareBase):
    id: int
    asset_id: int

    model_config = {"from_attributes": True}


# ── Asset ─────────────────────────────────────────────────────────────────────

class AssetBase(BaseModel):
    asset_name: str = Field(min_length=1, max_length=150)
    asset_type: str = Field(min_length=1, max_length=50)
    ip_address: Optional[str] = Field(default=None, max_length=45)
    operating_system: Optional[str] = Field(default=None, max_length=100)
    criticality: str = Field(min_length=1, max_length=20)
    exposure: str = Field(min_length=1, max_length=20)
    department: Optional[str] = Field(default=None, max_length=100)
    environment: str = Field(default="Simulated", max_length=50)


class AssetCreate(AssetBase):
    software: list[SoftwareCreate] = Field(default_factory=list)


class AssetUpdate(BaseModel):
    """All fields optional — allows partial PATCH updates."""
    asset_name: Optional[str] = Field(default=None, min_length=1, max_length=150)
    asset_type: Optional[str] = Field(default=None, max_length=50)
    ip_address: Optional[str] = Field(default=None, max_length=45)
    operating_system: Optional[str] = Field(default=None, max_length=100)
    criticality: Optional[str] = Field(default=None, max_length=20)
    exposure: Optional[str] = Field(default=None, max_length=20)
    department: Optional[str] = Field(default=None, max_length=100)
    environment: Optional[str] = Field(default=None, max_length=50)


class AssetResponse(AssetBase):
    id: int
    created_at: datetime
    software: list[SoftwareResponse] = []

    model_config = {"from_attributes": True}


class ImportReport(BaseModel):
    imported: int
    failed: int
    errors: list[str]
