export interface Software {
  id: number;
  asset_id: number;
  software_name: string;
  vendor?: string | null;
  version: string;
  software_type: string;
}

export interface Asset {
  id: number;
  asset_name: string;
  asset_type: string;
  ip_address?: string | null;
  operating_system?: string | null;
  criticality: string;
  exposure: string;
  owner?: string | null;
  department?: string | null;
  environment: string;
  created_at: string;
  software: Software[];
}

export interface AssetDependency {
  id: number;
  source_asset_id: number;
  target_asset_id: number;
  target_asset_name?: string;
  dependency_type: string;
  dependency_strength: number;
  service_impact?: string | null;
}

export interface InfrastructureMap {
  nodes: Array<{
    id: number;
    label: string;
    type: string;
    criticality: string;
    department?: string | null;
  }>;
  edges: Array<{
    from: number;
    to: number;
    strength: number;
    impact?: string | null;
  }>;
  asset_count: number;
}

export interface DependencyImpact {
  asset_id: number;
  asset_name: string;
  downstream_assets: string[];
  upstream_dependencies: string[];
  affected_assets: string[];
  blast_radius: number;
  recommendations: string[];
}

export interface AssetCreate {
  asset_name: string;
  asset_type: string;
  ip_address?: string;
  operating_system?: string;
  criticality: string;
  exposure: string;
  department?: string;
  environment: string;
  software: SoftwareCreate[];
}

export interface SoftwareCreate {
  software_name: string;
  vendor?: string;
  version: string;
  software_type: string;
}

export interface AssetUpdate {
  asset_name?: string;
  asset_type?: string;
  ip_address?: string | null;
  operating_system?: string | null;
  criticality?: string;
  exposure?: string;
  department?: string | null;
  environment?: string;
}

export interface ImportReport {
  imported: number;
  failed: number;
  errors: string[];
}

// ── Phase 2: Vulnerability Types ─────────────────────────────────────────────

export interface Vulnerability {
  id: number;
  cve_id: string;
  description: string;
  cvss_score?: number | null;
  cvss_version?: string | null;
  severity?: string | null;
  published_date?: string | null;
  reference_url?: string | null;
  affected_products?: string | null;
}

export interface AssetVulnerability {
  id: number;
  asset_id: number;
  vulnerability_id: number;
  matched_software?: string | null;
  matched_version?: string | null;
  match_method: string;
  assessed_at: string;
  status?: string;
  resolution_notes?: string | null;
  remediated_by?: string | null;
  resolved_at?: string | null;
  asset?: Asset;
  vulnerability: Vulnerability;
}

export interface AssessmentSummary {
  assets_assessed: number;
  assets_with_vulnerabilities: number;
  total_matches: number;
}

export interface VulnerabilityStats {
  total: number;
  by_severity: Record<string, number>;
}

export interface AssessmentDashboardSummary {
  total_vulnerabilities_in_db: number;
  total_asset_vulnerability_links: number;
  assets_affected: number;
  by_severity: Record<string, number>;
}


// ── Phase 3 & Phase 4: Risk Assessment & Dashboard Types ─────────────────────

export interface RiskFactors {
  severity: number;
  exploitability: number;
  exposure: number;
  criticality: number;
  matched_cve_count: number;
  cisa_kev_alert: boolean;
  weights: Record<string, number>;
}

export interface RiskAssessment {
  id: number;
  asset_id: number;
  asset_name?: string | null;
  asset_type?: string | null;
  department?: string | null;
  risk_score: number;
  risk_level: string; // 'Critical' | 'High' | 'Medium' | 'Low'
  severity_score: number;
  exploitability_score: number;
  exposure_score: number;
  criticality_score: number;
  factors: RiskFactors;
  explanation: string;
  evidence_coverage: string;
  recommendations: string[];
  assessed_at: string;
}

export interface RiskSummary {
  total_assets: number;
  assessed_assets: number;
  assets_with_confirmed_matches: number;
  critical_risk_count: number;
  high_risk_count: number;
  medium_risk_count: number;
  low_risk_count: number;
  average_risk_score: number;
  cisa_kev_alert_count: number;
}

export interface DepartmentRisk {
  department: string;
  asset_count: number;
  average_risk: number;
  critical_count: number;
  high_count: number;
}

export interface AssessAllReport {
  assessed: number;
  average_score: number;
  critical_count: number;
  items: RiskAssessment[];
}

// ── ML Types ───────────────────────────────────────────────────────────────────

export interface MLStatus {
  epss_records_loaded: number;
  anomaly_model_trained: boolean;
  anomaly_trained_at: string | null;
  supervised_models_trained: boolean;
  supervised_algorithms: string[];
  warning: string;
}

export interface MLInsight {
  asset_id: number;
  asset_name: string;
  asset_type: string;
  department: string | null;
  anomaly_score: number | null;
  is_anomaly: boolean | null;
  model_available: boolean;
}

export interface MLModelCard {
  id: number;
  mode: string;
  algorithm: string;
  training_rows: number | null;
  test_rows: number | null;
  roc_auc: number | null;
  f1_score: number | null;
  precision: number | null;
  recall: number | null;
  epss_threshold: number | null;
  is_active: boolean;
  trained_at: string;
  warning: string;
  metrics: Record<string, unknown> | null;
  feature_names: string[];
}


// ── 3-Part Action Profile Types ──────────────────────────────────────────────

export interface RemedyInfo {
  title: string;
  cisa_mandate?: string | null;
  due_date?: string | null;
  patch_command: string;
  workaround: string;
  firewall_rule: string;
  verification_step: string;
}

export interface WhatIfNotCuredInfo {
  exploit_mechanism: string;
  attacker_capability: string;
  epss_probability: string;
  epss_percentile?: number;
  weaponized_status: string;
  severity_level: string;
}

export interface ConsequencesInfo {
  domain_category?: string;
  primary_impact?: string;
  clinical_impact: string;
  operational_impact: string;
  legal_regulatory: string;
  financial_cost: string;
}

export interface ActionPlanProfile {
  cve_id: string;
  asset_name: string;
  software: string;
  cvss_score: number | null;
  reference_url?: string | null;
  remedy: RemedyInfo;
  what_if_not_cured: WhatIfNotCuredInfo;
  consequences: ConsequencesInfo;
}


// ── Infrastructure Gap Analysis Types ────────────────────────────────────────

export interface InfrastructureGap {
  id: number;
  asset_id: number;
  asset_name: string;
  asset_type: string;
  criticality: string;
  exposure: string;
  gap_title: string;
  category: string;
  gap_type: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  reason: string;
  recommendation: string;
  status: "Open" | "In Review" | "Resolved" | "Accepted";
  fingerprint: string;
  created_at: string;
  updated_at: string;
}

export interface GapSummary {
  total_gaps: number;
  high_severity: number;
  medium_severity: number;
  low_severity: number;
  open_gaps: number;
  in_review_gaps: number;
  resolved_gaps: number;
  accepted_gaps: number;
  by_category: Record<string, number>;
  by_severity: Record<string, number>;
  affected_assets_count: number;
  total_assets: number;
  coverage_rate: number;
  last_analyzed_at?: string | null;
}

export interface GapAnalysisReport {
  message: string;
  assets_analyzed: number;
  total_gaps_detected: number;
  new_gaps_created: number;
  existing_gaps_preserved: number;
  summary: GapSummary;
}


// ── Authentication Types ─────────────────────────────────────────────────────

export interface User {
  id: number;
  email: string;
  full_name: string;
  role: "admin" | "analyst";
  is_active: boolean;
  last_login?: string | null;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: User;
}

// ── CSV Validation & Row-level Preview Types ─────────────────────────────────

export interface CsvRowValidation {
  row_index: number;
  asset_name: string;
  asset_type: string;
  ip_address?: string | null;
  operating_system?: string | null;
  criticality: string;
  exposure: string;
  owner?: string | null;
  department?: string | null;
  environment: string;
  software: string[];
  software_version: string;
  is_valid: boolean;
  is_duplicate: boolean;
  errors: string[];
  warnings: string[];
}

export interface CsvValidationReport {
  total_rows: number;
  valid_rows_count: number;
  invalid_rows_count: number;
  duplicate_count: number;
  detected_headers: Record<string, string>;
  rows: CsvRowValidation[];
}

// ── Reports Types ────────────────────────────────────────────────────────────

export interface ReportsSummary {
  status: string;
  total_assets: number;
  assessed_assets: number;
  critical_risks: number;
  detected_gaps: number;
  matched_vulnerabilities: number;
  report_format: string;
  platform: string;
}


export type AssessmentFleetReport = AssessAllReport;
