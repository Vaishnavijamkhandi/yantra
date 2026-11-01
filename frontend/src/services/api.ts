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
  User,
  TokenResponse,
  CsvValidationReport,
  ReportsSummary,
  ActionPlanProfile,
  DependencyImpact,
  InfrastructureMap,
  InfrastructureGap,
  GapSummary,
  GapAnalysisReport,
  RiskSummary,
  RiskAssessment,
  DepartmentRisk,
  AssessmentFleetReport,
} from "../types/asset";

export const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

// ── Auth Storage & Headers ─────────────────────────────────────────────────

export function getAuthToken(): string | null {
  return localStorage.getItem("cybersentra_token");
}

export function setAuthToken(token: string): void {
  localStorage.setItem("cybersentra_token", token);
}

export function removeAuthToken(): void {
  localStorage.removeItem("cybersentra_token");
  localStorage.removeItem("cybersentra_user");
}

export function getStoredUser(): User | null {
  const u = localStorage.getItem("cybersentra_user");
  if (!u) return null;
  try {
    return JSON.parse(u);
  } catch {
    return null;
  }
}

export function setStoredUser(user: User): void {
  localStorage.setItem("cybersentra_user", JSON.stringify(user));
}

function authHeaders(extraHeaders: Record<string, string> = {}): Record<string, string> {
  const token = getAuthToken();
  const headers: Record<string, string> = { ...extraHeaders };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

// ── Helper ─────────────────────────────────────────────────────────────────

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    if (res.status === 401) {
      removeAuthToken();
    }
    const err = await res.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(err.detail ?? "Request failed");
  }
  return res.json();
}

// ── Authentication ─────────────────────────────────────────────────────────

export async function login(email: string, password: string): Promise<TokenResponse> {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await handleResponse<TokenResponse>(res);
  setAuthToken(data.access_token);
  setStoredUser(data.user);
  return data;
}

export async function getCurrentUser(): Promise<User> {
  const res = await fetch(`${API_URL}/api/auth/me`, {
    headers: authHeaders(),
  });
  const user = await handleResponse<User>(res);
  setStoredUser(user);
  return user;
}

export async function logout(): Promise<void> {
  try {
    await fetch(`${API_URL}/api/auth/logout`, {
      method: "POST",
      headers: authHeaders(),
    });
  } finally {
    removeAuthToken();
  }
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

  const qs = query.toString();
  const res = await fetch(qs ? `${API_URL}/api/assets/?${qs}` : `${API_URL}/api/assets/`, {
    headers: authHeaders(),
  });
  return handleResponse<Asset[]>(res);
}

export async function getAsset(id: number): Promise<Asset> {
  const res = await fetch(`${API_URL}/api/assets/${id}`, {
    headers: authHeaders(),
  });
  return handleResponse<Asset>(res);
}

export async function getAssetDependencies(assetId: number): Promise<import("../types/asset").AssetDependency[]> {
  const res = await fetch(`${API_URL}/api/assets/${assetId}/dependencies`, {
    headers: authHeaders(),
  });
  return handleResponse<import("../types/asset").AssetDependency[]>(res);
}

export async function getInfrastructureMap(): Promise<InfrastructureMap> {
  const res = await fetch(`${API_URL}/api/assets/infrastructure-map`, {
    headers: authHeaders(),
  });
  return handleResponse<InfrastructureMap>(res);
}

export async function getAssetImpact(assetId: number): Promise<DependencyImpact> {
  const res = await fetch(`${API_URL}/api/assets/${assetId}/impact`, {
    headers: authHeaders(),
  });
  return handleResponse<DependencyImpact>(res);
}

export async function createAsset(data: AssetCreate): Promise<Asset> {
  const res = await fetch(`${API_URL}/api/assets/`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(data),
  });
  return handleResponse<Asset>(res);
}

export async function updateAsset(id: number, data: AssetUpdate): Promise<Asset> {
  const res = await fetch(`${API_URL}/api/assets/${id}`, {
    method: "PATCH",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(data),
  });
  return handleResponse<Asset>(res);
}

export async function deleteAsset(id: number): Promise<void> {
  const res = await fetch(`${API_URL}/api/assets/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  return handleResponse<void>(res);
}

// ── CSV Upload & Row Validation ─────────────────────────────────────────────

export async function validateCsv(file: File): Promise<CsvValidationReport> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_URL}/api/assets/validate-csv`, {
    method: "POST",
    headers: authHeaders(),
    body: formData,
  });
  return handleResponse<CsvValidationReport>(res);
}

export async function importValidatedAssets(rows: AssetCreate[]): Promise<ImportReport> {
  const res = await fetch(`${API_URL}/api/assets/import-validated`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ rows }),
  });
  return handleResponse<ImportReport>(res);
}

export async function importAssets(file: File): Promise<ImportReport> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_URL}/api/assets/import`, {
    method: "POST",
    headers: authHeaders(),
    body: formData,
  });
  return handleResponse<ImportReport>(res);
}

// ── Vulnerabilities & Assessments ──────────────────────────────────────────

export async function getVulnerabilities(params?: {
  search?: string;
  severity?: string;
  limit?: number;
  offset?: number;
}): Promise<Vulnerability[]> {
  const query = new URLSearchParams();
  if (params?.search) query.set("search", params.search);
  if (params?.severity) query.set("severity", params.severity);
  if (params?.limit) query.set("limit", params.limit.toString());
  if (params?.offset) query.set("offset", params.offset.toString());

  const qs = query.toString();
  const res = await fetch(`${API_URL}/api/vulnerabilities/${qs ? `?${qs}` : ""}`, {
    headers: authHeaders(),
  });
  return handleResponse<Vulnerability[]>(res);
}

export async function getVulnerabilityStats(): Promise<VulnerabilityStats> {
  const res = await fetch(`${API_URL}/api/vulnerabilities/stats`, {
    headers: authHeaders(),
  });
  return handleResponse<VulnerabilityStats>(res);
}

export async function getAssessmentDashboardSummary(): Promise<AssessmentDashboardSummary> {
  const res = await fetch(`${API_URL}/api/assessment/dashboard`, {
    headers: authHeaders(),
  });
  return handleResponse<AssessmentDashboardSummary>(res);
}

export async function runAssessment(assetIds?: number[]): Promise<AssessmentSummary> {
  const res = await fetch(`${API_URL}/api/assessment/run`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ asset_ids: assetIds ?? null }),
  });
  return handleResponse<AssessmentSummary>(res);
}

export async function getAssetVulnerabilities(assetId: number): Promise<AssetVulnerability[]> {
  const res = await fetch(`${API_URL}/api/assessment/asset/${assetId}`, {
    headers: authHeaders(),
  });
  return handleResponse<AssetVulnerability[]>(res);
}

export async function getAllAssetVulnerabilities(params?: number | {
  asset_id?: number;
  severity?: string;
  limit?: number;
  offset?: number;
}): Promise<AssetVulnerability[]> {
  const query = new URLSearchParams();
  if (typeof params === "number") {
    query.set("limit", params.toString());
  } else if (params && typeof params === "object") {
    if (params.asset_id) query.set("asset_id", params.asset_id.toString());
    if (params.severity && params.severity !== "ALL") query.set("severity", params.severity);
    if (params.limit) query.set("limit", params.limit.toString());
    if (params.offset) query.set("offset", params.offset.toString());
  }
  const qs = query.toString();
  const res = await fetch(`${API_URL}/api/assessment/results${qs ? `?${qs}` : ""}`, {
    headers: authHeaders(),
  });
  return handleResponse<AssetVulnerability[]>(res);
}

export async function updateFindingStatus(
  findingId: number,
  status: "Open" | "In Progress" | "Resolved" | "Accepted Risk",
  resolution_notes?: string,
  remediated_by?: string
): Promise<{ success: boolean; message: string; asset_id: number; status: string }> {
  const res = await fetch(`${API_URL}/api/assessment/${findingId}/status`, {
    method: "PATCH",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ status, resolution_notes, remediated_by }),
  });
  return handleResponse<{ success: boolean; message: string; asset_id: number; status: string }>(res);
}

export async function resolveFinding(
  assetVulnId: number,
  notes?: string
): Promise<{ success: boolean; message: string; asset_id: number }> {
  const query = notes ? `?notes=${encodeURIComponent(notes)}` : "";
  const res = await fetch(`${API_URL}/api/assessment/${assetVulnId}/resolve${query}`, {
    method: "POST",
    headers: authHeaders(),
  });
  return handleResponse<{ success: boolean; message: string; asset_id: number }>(res);
}

export async function getActionPlanProfile(
  cveId: string,
  assetId?: number,
  software?: string
): Promise<ActionPlanProfile> {
  const query = new URLSearchParams();
  if (assetId) query.set("asset_id", assetId.toString());
  if (software) query.set("software", software);

  const res = await fetch(`${API_URL}/api/vulnerabilities/${cveId}/action-plan?${query.toString()}`, {
    headers: authHeaders(),
  });
  return handleResponse<ActionPlanProfile>(res);
}

// ── Risks & Remediation Engine ─────────────────────────────────────────────

export async function getRiskSummary(): Promise<RiskSummary> {
  const res = await fetch(`${API_URL}/api/risks/summary`, {
    headers: authHeaders(),
  });
  return handleResponse<RiskSummary>(res);
}

export async function getLatestRisks(): Promise<RiskAssessment[]> {
  const res = await fetch(`${API_URL}/api/risks/latest`, {
    headers: authHeaders(),
  });
  return handleResponse<RiskAssessment[]>(res);
}

export async function getDepartmentRisks(): Promise<DepartmentRisk[]> {
  const res = await fetch(`${API_URL}/api/risks/departments`, {
    headers: authHeaders(),
  });
  return handleResponse<DepartmentRisk[]>(res);
}

export async function assessAllRisks(): Promise<AssessmentFleetReport> {
  const res = await fetch(`${API_URL}/api/risks/assess-all`, {
    method: "POST",
    headers: authHeaders(),
  });
  return handleResponse<AssessmentFleetReport>(res);
}

export async function assessAssetRisk(assetId: number): Promise<RiskAssessment> {
  const res = await fetch(`${API_URL}/api/risks/assess/${assetId}`, {
    method: "POST",
    headers: authHeaders(),
  });
  return handleResponse<RiskAssessment>(res);
}

export async function seedVulnerabilities(): Promise<{ message: string; inserted: number }> {
  const res = await fetch(`${API_URL}/api/risks/seed-vulnerabilities`, {
    method: "POST",
    headers: authHeaders(),
  });
  return handleResponse<{ message: string; inserted: number }>(res);
}

// ── Infrastructure Gap Analysis ────────────────────────────────────────────

export async function runGapAnalysis(assetId?: number): Promise<GapAnalysisReport> {
  const query = new URLSearchParams();
  if (assetId) query.set("asset_id", assetId.toString());
  const qs = query.toString();
  const res = await fetch(`${API_URL}/api/gaps/analyze${qs ? `?${qs}` : ""}`, {
    method: "POST",
    headers: authHeaders(),
  });
  return handleResponse<GapAnalysisReport>(res);
}

export async function getGaps(params?: {
  severity?: string;
  category?: string;
  status?: string;
  asset_id?: number;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<InfrastructureGap[]> {
  const query = new URLSearchParams();
  if (params?.severity && params.severity !== "ALL") query.set("severity", params.severity);
  if (params?.category && params.category !== "ALL") query.set("category", params.category);
  if (params?.status && params.status !== "ALL") query.set("status", params.status);
  if (params?.asset_id) query.set("asset_id", params.asset_id.toString());
  if (params?.search) query.set("search", params.search);
  if (params?.limit) query.set("limit", params.limit.toString());
  if (params?.offset) query.set("offset", params.offset.toString());

  const qs = query.toString();
  const res = await fetch(`${API_URL}/api/gaps/${qs ? `?${qs}` : ""}`, {
    headers: authHeaders(),
  });
  return handleResponse<InfrastructureGap[]>(res);
}

export async function getGapSummary(): Promise<GapSummary> {
  const res = await fetch(`${API_URL}/api/gaps/summary`, {
    headers: authHeaders(),
  });
  return handleResponse<GapSummary>(res);
}

export async function updateGapStatus(
  gapId: number,
  status: "Open" | "In Review" | "Resolved" | "Accepted",
  notes?: string
): Promise<InfrastructureGap> {
  const res = await fetch(`${API_URL}/api/gaps/${gapId}`, {
    method: "PATCH",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ status, notes }),
  });
  return handleResponse<InfrastructureGap>(res);
}

// ── Reports ────────────────────────────────────────────────────────────────

export async function getReportsSummary(): Promise<ReportsSummary> {
  const res = await fetch(`${API_URL}/api/reports/summary`, {
    headers: authHeaders(),
  });
  return handleResponse<ReportsSummary>(res);
}

export function getReportDownloadUrl(): string {
  return `${API_URL}/api/reports/download-pdf`;
}


// ── Assessment & Operational Exports ───────────────────────────────────────

export const getAssessmentResults = getAllAssetVulnerabilities;
export const getAssessmentSummary = getAssessmentDashboardSummary;
export const getActionPlan = getActionPlanProfile;
export const syncNvdVulnerabilities = seedVulnerabilities;

export async function quarantineAsset(
  assetId: number | string
): Promise<{ success: boolean; message: string; asset_id: number | string; environment?: string }> {
  const res = await fetch(`${API_URL}/api/assets/${assetId}/quarantine`, {
    method: "POST",
    headers: authHeaders(),
  });
  return handleResponse(res);
}

// ── AI Copilot (Gemini) ────────────────────────────────────────────────────

export interface ChatMessage {
  role: "user" | "assistant" | "model";
  content: string;
}

export interface ChatResponse {
  reply: string;
  model: string;
}

export async function sendChatMessage(
  message: string,
  history: ChatMessage[] = [],
  context?: Record<string, unknown>
): Promise<ChatResponse> {
  const res = await fetch(`${API_URL}/api/chat`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ message, history, context }),
  });
  return handleResponse<ChatResponse>(res);
}
