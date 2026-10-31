import type { Asset, Risk, Summary } from './types'

const BASE = import.meta.env.VITE_API_BASE_URL || ''

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}/api${path}`, init)
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.detail || `Request failed (${response.status})`)
  }
  if (response.status === 204) return undefined as T
  return response.json()
}

export const api = {
  assets: (search = '') => request<{items: Asset[]; total: number; page: number; page_size: number}>(`/assets?page_size=100${search ? `&search=${encodeURIComponent(search)}` : ''}`),
  asset: (id: string) => request<Asset>(`/assets/${id}`),
  createAsset: (payload: unknown) => request<Asset>('/assets', {method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload)}),
  updateAsset: (id: string, payload: unknown) => request<Asset>(`/assets/${id}`, {method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload)}),
  deleteAsset: (id: string) => request<void>(`/assets/${id}`, {method: 'DELETE'}),
  importCsv: async (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return request<{created: number; errors: {row: number; error: string}[]}>('/assets/import', {method: 'POST', body: form})
  },
  assessVulnerabilities: (id: string) => request<any>(`/vulnerabilities/assess/${id}`, {method: 'POST'}),
  assetVulnerabilities: (id: string) => request<any[]>(`/vulnerabilities/asset/${id}`),
  assessAllRisks: () => request<any>('/risks/assess-all', {method: 'POST'}),
  risks: () => request<{items: Risk[]; total: number}>('/risks'),
  assessRisk: (id: string) => request<Risk & {recommendations: string[]}>(`/risks/assess/${id}`, {method: 'POST'}),
  summary: () => request<Summary>('/risks/summary')
}
