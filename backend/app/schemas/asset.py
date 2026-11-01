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



# ── CSV Validation and Preview Schemas ────────────────────────────────────────

class CsvRowValidation(BaseModel):
    row_index: int
    asset_name: str
    asset_type: str
    ip_address: Optional[str] = None
    operating_system: Optional[str] = None
    criticality: str
    exposure: str
    department: Optional[str] = None
    environment: str = "Production"
    software: list[str] = []
    software_version: str = "1.0"
    is_valid: bool = True
    is_duplicate: bool = False
    errors: list[str] = []
    warnings: list[str] = []


class CsvValidationReport(BaseModel):
    total_rows: int
    valid_rows_count: int
    invalid_rows_count: int
    duplicate_count: int
    detected_headers: dict[str, str]
    rows: list[CsvRowValidation]


class ValidatedImportRequest(BaseModel):
    rows: list[AssetCreate]
