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
  ip_address?: string;
  operating_system?: string;
  criticality?: string;
  exposure?: string;
  department?: string;
  environment?: string;
}

export interface ImportReport {
  imported: number;
  failed: number;
  errors: string[];
}
