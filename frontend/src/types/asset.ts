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
  department?: string | null;
  environment: string;
  created_at: string;
  software: Software[];
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
