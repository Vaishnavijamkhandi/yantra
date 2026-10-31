export type Software = {
  id: string
  vendor?: string | null
  software_name: string
  software_version?: string | null
  cpe_name?: string | null
}
export type Asset = {
  id: string
  asset_name: string
  asset_type: string
  ip_address?: string | null
  operating_system?: string | null
  criticality: string
  exposure: string
  department?: string | null
  environment: string
  notes?: string | null
  created_at: string
  software: Software[]
}
export type Risk = {
  id: string
  asset_id: string
  asset_name: string
  risk_score: number
  risk_level: string
  factors: Record<string, any>
  explanation: string
  evidence_coverage: string
  assessed_at: string
  recommendations?: string[]
}
export type Summary = {
  total_assets: number
  assets_with_confirmed_matches: number
  critical: number
  high: number
  medium: number
  low: number
  needs_verification: number
  average_risk: number
  assessed_assets?: number
}
