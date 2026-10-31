import type {
  Asset,
  AssetCreate,
  AssetUpdate,
  ImportReport,
  Vulnerability,
  AssetVulnerability,
  AssessmentSummary,
  VulnerabilityStats,
  AssessmentDashboardSummary,
} from "../types/asset";

const API_URL = "http://127.0.0.1:8000";

// ── Helpers ────────────────────────────────────────────────────────────────

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(err.detail ?? "Request failed");
  }
  return res.json();
}

// ── Assets ─────────────────────────────────────────────────────────────────

export async function getAssets(params?: {
  search?: string;
  criticality?: string;
  asset_type?: string;
  exposure?: string;
  environment?: string;
}): Promise<Asset[]> {
  const query = new URLSearchParams();
  if (params?.search) query.set("search", params.search);
  if (params?.criticality) query.set("criticality", params.criticality);
  if (params?.asset_type) query.set("asset_type", params.asset_type);
  if (params?.exposure) query.set("exposure", params.exposure);
  if (params?.environment) query.set("environment", params.environment);

  const res = await fetch(`${API_URL}/api/assets/?${query.toString()}`);
  return handleResponse<Asset[]>(res);
}

export async function getAsset(id: number): Promise<Asset> {
  const res = await fetch(`${API_URL}/api/assets/${id}`);
  return handleResponse<Asset>(res);
}

export async function createAsset(data: AssetCreate): Promise<Asset> {
  const res = await fetch(`${API_URL}/api/assets/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse<Asset>(res);
}

export async function updateAsset(id: number, data: AssetUpdate): Promise<Asset> {
  const res = await fetch(`${API_URL}/api/assets/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse<Asset>(res);
}

export async function deleteAsset(id: number): Promise<void> {
  const res = await fetch(`${API_URL}/api/assets/${id}`, { method: "DELETE" });
  return handleResponse<void>(res);
}

export async function importAssets(file: File): Promise<ImportReport> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_URL}/api/assets/import`, {
    method: "POST",
    body: formData,
  });
  return handleResponse<ImportReport>(res);
}

// ── Phase 2: Vulnerabilities ─────────────────────────────────────────────────

export async function getVulnerabilities(params?: {
  search?: string;
  severity?: string;
  min_score?: number;
  limit?: number;
  offset?: number;
}): Promise<Vulnerability[]> {
  const query = new URLSearchParams();
  if (params?.search) query.set("search", params.search);
  if (params?.severity) query.set("severity", params.severity);
  if (params?.min_score !== undefined) query.set("min_score", params.min_score.toString());
  if (params?.limit) query.set("limit", params.limit.toString());
  if (params?.offset) query.set("offset", params.offset.toString());

  const res = await fetch(`${API_URL}/api/vulnerabilities/?${query.toString()}`);
  return handleResponse<Vulnerability[]>(res);
}

export async function getVulnerabilityStats(): Promise<VulnerabilityStats> {
  const res = await fetch(`${API_URL}/api/vulnerabilities/stats`);
  return handleResponse<VulnerabilityStats>(res);
}

export async function seedVulnerabilities(): Promise<{ inserted: number; updated: number; total: number }> {
  const res = await fetch(`${API_URL}/api/vulnerabilities/seed`, {
    method: "POST",
  });
  return handleResponse<{ inserted: number; updated: number; total: number }>(res);
}

export async function syncNvdVulnerabilities(keywords: string[] = [], maxPerKeyword: number = 50): Promise<{
  inserted: number;
  updated: number;
  skipped: number;
  keywords_synced: number;
}> {
  const res = await fetch(`${API_URL}/api/vulnerabilities/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keywords, max_per_keyword: maxPerKeyword }),
  });
  return handleResponse(res);
}

export async function runAssessment(assetIds?: number[]): Promise<AssessmentSummary> {
  const res = await fetch(`${API_URL}/api/assessment/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ asset_ids: assetIds ?? null }),
  });
  return handleResponse<AssessmentSummary>(res);
}

export async function getAssessmentResults(params?: {
  asset_id?: number;
  severity?: string;
  limit?: number;
  offset?: number;
}): Promise<AssetVulnerability[]> {
  const query = new URLSearchParams();
  if (params?.asset_id) query.set("asset_id", params.asset_id.toString());
  if (params?.severity) query.set("severity", params.severity);
  if (params?.limit) query.set("limit", params.limit.toString());
  if (params?.offset) query.set("offset", params.offset.toString());

  const res = await fetch(`${API_URL}/api/assessment/results?${query.toString()}`);
  return handleResponse<AssetVulnerability[]>(res);
}

export async function getAssessmentSummary(): Promise<AssessmentDashboardSummary> {
  const res = await fetch(`${API_URL}/api/assessment/summary`);
  return handleResponse<AssessmentDashboardSummary>(res);
}

export async function getAssetVulnerabilities(assetId: number): Promise<AssetVulnerability[]> {
  const res = await fetch(`${API_URL}/api/assets/${assetId}/vulnerabilities`);
  return handleResponse<AssetVulnerability[]>(res);
}
