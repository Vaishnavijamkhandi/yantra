from datetime import datetime
from typing import Optional, Literal
from pydantic import BaseModel, Field


class GapBase(BaseModel):
    gap_title: str
    category: str
    gap_type: str
    severity: Literal["HIGH", "MEDIUM", "LOW"]
    reason: str
    recommendation: str
    status: Literal["Open", "In Review", "Resolved", "Accepted"] = "Open"


class GapUpdate(BaseModel):
    status: Literal["Open", "In Review", "Resolved", "Accepted"] = Field(
        ..., description="Updated lifecycle status of the gap"
    )
    notes: Optional[str] = Field(default=None, description="Optional audit notes on resolution or acceptance")


class GapResponse(GapBase):
    id: int
    asset_id: int
    asset_name: Optional[str] = None
    asset_type: Optional[str] = None
    criticality: Optional[str] = None
    exposure: Optional[str] = None
    fingerprint: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class GapSummaryResponse(BaseModel):
    total_gaps: int
    high_severity: int
    medium_severity: int
    low_severity: int
    open_gaps: int
    in_review_gaps: int
    resolved_gaps: int
    accepted_gaps: int
    by_category: dict[str, int]
    by_severity: dict[str, int]
    affected_assets_count: int
    total_assets: int
    coverage_rate: float
    last_analyzed_at: Optional[datetime] = None


class GapAnalysisReport(BaseModel):
    message: str
    assets_analyzed: int
    total_gaps_detected: int
    new_gaps_created: int
    existing_gaps_preserved: int
    summary: GapSummaryResponse
