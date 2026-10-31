from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel, ConfigDict


class RiskFactors(BaseModel):
    severity: float
    exploitability: float
    exposure: float
    criticality: float
    matched_cve_count: int
    cisa_kev_alert: bool
    weights: dict[str, float]

    model_config = ConfigDict(from_attributes=True)


class RiskAssessmentResponse(BaseModel):
    id: int
    asset_id: int
    asset_name: str | None = None
    asset_type: str | None = None
    department: str | None = None
    risk_score: float
    risk_level: str
    severity_score: float
    exploitability_score: float
    exposure_score: float
    criticality_score: float
    factors: dict
    explanation: str
    evidence_coverage: str
    recommendations: list[str]
    assessed_at: datetime

    model_config = ConfigDict(from_attributes=True)


class RiskSummaryResponse(BaseModel):
    total_assets: int
    assessed_assets: int
    assets_with_confirmed_matches: int
    critical_risk_count: int
    high_risk_count: int
    medium_risk_count: int
    low_risk_count: int
    average_risk_score: float
    cisa_kev_alert_count: int

    model_config = ConfigDict(from_attributes=True)


class DepartmentRiskItem(BaseModel):
    department: str
    asset_count: int
    average_risk: float
    critical_count: int
    high_count: int


class AssessAllReport(BaseModel):
    assessed: int
    average_score: float
    critical_count: int
    items: list[RiskAssessmentResponse]
