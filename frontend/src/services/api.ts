import type { Asset, AssetCreate, AssetUpdate, ImportReport } from "../types/asset";

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
