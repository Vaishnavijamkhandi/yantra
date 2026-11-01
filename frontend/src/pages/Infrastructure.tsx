import { useEffect, useState, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  getAssets,
  deleteAsset,
  getAssessmentResults,
  getActionPlanProfile,
  quarantineAsset,
  resolveFinding,
} from "../services/api";
import type {
  Asset,
  AssetVulnerability,
  ActionPlanProfile,
} from "../types/asset";
import AssetForm from "../components/AssetForm";
import CsvUpload from "../components/CsvUpload";

const CRITICALITY_BADGES: Record<string, string> = {
  Critical: "bg-[#800020]/10 text-[#800020] border border-[#800020]/30",
  High: "bg-red-50 text-red-700 border border-red-200",
  Medium: "bg-amber-50 text-amber-800 border border-amber-200",
  Low: "bg-emerald-50 text-emerald-800 border border-emerald-200",
};

const EXPOSURE_BADGES: Record<string, string> = {
  Internal: "bg-[#ede5d8] text-stone-700 border border-[#d6ccbe]",
  External: "bg-red-50 text-red-700 border border-red-200 font-bold",
};

const SEV_COLORS: Record<string, string> = {
  CRITICAL: "bg-[#800020]/15 text-[#800020] border border-[#800020]/30",
  HIGH: "bg-red-50 text-red-700 border border-red-200",
  MEDIUM: "bg-amber-50 text-amber-800 border border-amber-200",
  LOW: "bg-emerald-50 text-emerald-800 border border-emerald-200",
};

export default function Infrastructure() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get("tab") as "inventory" | "upload" | "topology") || "inventory";

  // Inventory State
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(true);
  const [assetError, setAssetError] = useState("");
  const [showAssetForm, setShowAssetForm] = useState(false);

  // Filters & Dataset Scope
  const [search, setSearch] = useState("");
  const [filterCriticality, setFilterCriticality] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterExposure, setFilterExposure] = useState("");
  const [selectedDataset, setSelectedDataset] = useState<string>("ALL");

  // Topology State
  const [findings, setFindings] = useState<AssetVulnerability[]>([]);
  const [selectedFinding, setSelectedFinding] = useState<AssetVulnerability | null>(null);
  const [actionPlan, setActionPlan] = useState<ActionPlanProfile | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [actionNotification, setActionNotification] = useState<string | null>(null);

  const setTab = (tab: "inventory" | "upload" | "topology") => {
    setSearchParams({ tab });
  };

  async function loadAssets() {
    try {
      setLoadingAssets(true);
      setAssetError("");
      const data = await getAssets({
        search: search || undefined,
        criticality: filterCriticality || undefined,
        asset_type: filterType || undefined,
        exposure: filterExposure || undefined,
      });
      // Sort new rows to the top (descending ID)
      const sorted = [...data].sort((a, b) => b.id - a.id);
      setAssets(sorted);
    } catch (err: unknown) {
      setAssetError(err instanceof Error ? err.message : "Failed to load assets");
    } finally {
      setLoadingAssets(false);
    }
  }

  useEffect(() => {
    loadAssets();
  }, [search, filterCriticality, filterType, filterExposure]);

  // Load findings for Topology tab
  useEffect(() => {
    async function loadFindings() {
      try {
        const results = await getAssessmentResults({ limit: 100 });
        setFindings(results);
        if (results.length > 0 && !selectedFinding) {
          setSelectedFinding(results[0]);
        }
      } catch (err) {
        console.error("Failed to load assessment results", err);
      }
    }
    loadFindings();
  }, []);

  // Fetch Action Plan when selected finding changes
  useEffect(() => {
    if (!selectedFinding) return;
    async function fetchPlan() {
      setLoadingPlan(true);
      try {
        const plan = await getActionPlanProfile(
          selectedFinding!.vulnerability.cve_id,
          selectedFinding!.asset_id,
          selectedFinding!.matched_software ?? undefined
        );
        setActionPlan(plan);
      } catch (err) {
        console.error("Failed to load plan", err);
      } finally {
        setLoadingPlan(false);
      }
    }
    fetchPlan();
  }, [selectedFinding]);

  async function handleDeleteAsset(id: number, name: string) {
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    try {
      await deleteAsset(id);
      await loadAssets();
    } catch (err: unknown) {
      setAssetError(err instanceof Error ? err.message : "Failed to delete asset");
    }
  }

  // Dataset list extracted from asset environment tags and upload history
  const availableDatasets = useMemo(() => {
    const set = new Set<string>();
    assets.forEach((a) => {
      if (a.environment && a.environment !== "Production" && a.environment !== "Simulated") {
        set.add(a.environment);
      }
    });
    try {
      const stored: string[] = JSON.parse(localStorage.getItem("cybersentra_datasets") || "[]");
      stored.forEach((s) => set.add(s));
    } catch {
      // ignore
    }
    return Array.from(set);
  }, [assets]);

  // Scoped assets filtered by dataset selection
  const displayAssets = useMemo(() => {
    let list = [...assets].sort((a, b) => b.id - a.id);
    if (selectedDataset !== "ALL") {
      list = list.filter((a) => a.environment === selectedDataset);
    }
    return list;
  }, [assets, selectedDataset]);

  const criticalCount = useMemo(
    () => displayAssets.filter((a) => a.criticality === "Critical").length,
    [displayAssets]
  );
  const externalCount = useMemo(
    () => displayAssets.filter((a) => a.exposure === "External").length,
    [displayAssets]
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 text-stone-900">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[#e5ded0]">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black text-[#800020] tracking-tight font-mono flex items-center gap-2">
              <span>🖥️</span> Infrastructure Command
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold uppercase bg-[#800020]/10 text-[#800020] border border-[#800020]/20">
              {assets.length} Ingested Assets
            </span>
          </div>
          <p className="text-stone-600 text-xs mt-1">
            Critical infrastructure profiling, CSV batch validation, and conceptual perimeter topology.
          </p>
        </div>

        {/* Sub-navigation Tabs */}
        <div className="flex items-center gap-1.5 bg-[#faf7f2] p-1 rounded-xl border border-[#d6ccbe]">
          <button
            onClick={() => setTab("inventory")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === "inventory"
                ? "bg-[#800020] text-white shadow-xs font-bold"
                : "text-stone-700 hover:text-[#800020] hover:bg-white"
            }`}
          >
            <span>📋</span> Fleet Inventory
          </button>
          <button
            onClick={() => setTab("upload")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === "upload"
                ? "bg-[#800020] text-white shadow-xs font-bold"
                : "text-stone-700 hover:text-[#800020] hover:bg-white"
            }`}
          >
            <span>📥</span> CSV Ingestion
          </button>
          <button
            onClick={() => setTab("topology")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === "topology"
                ? "bg-[#800020] text-white shadow-xs font-bold"
                : "text-stone-700 hover:text-[#800020] hover:bg-white"
            }`}
          >
            <span>🌐</span> Perimeter Topology
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-[#e5ded0] rounded-xl p-3.5 flex items-center justify-between shadow-xs">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-stone-500">Total Fleet</div>
            <div className="text-xl font-bold font-mono text-stone-900 mt-0.5">{assets.length}</div>
          </div>
          <div className="w-9 h-9 rounded-lg bg-[#faf7f2] border border-[#d6ccbe] flex items-center justify-center text-stone-700 text-sm">
            🖥️
          </div>
        </div>

        <div className="bg-white border border-[#e5ded0] rounded-xl p-3.5 flex items-center justify-between shadow-xs">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-stone-500">Critical Tier</div>
            <div className="text-xl font-bold font-mono text-[#800020] mt-0.5">{criticalCount}</div>
          </div>
          <div className="w-9 h-9 rounded-lg bg-[#800020]/10 border border-[#800020]/20 flex items-center justify-center text-[#800020] text-sm">
            🚨
          </div>
        </div>

        <div className="bg-white border border-[#e5ded0] rounded-xl p-3.5 flex items-center justify-between shadow-xs">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-stone-500">Internet Exposed</div>
            <div className="text-xl font-bold font-mono text-red-600 mt-0.5">{externalCount}</div>
          </div>
          <div className="w-9 h-9 rounded-lg bg-red-50 border border-red-200 flex items-center justify-center text-red-700 text-sm">
            ⚡
          </div>
        </div>

        <div className="bg-white border border-[#e5ded0] rounded-xl p-3.5 flex items-center justify-between shadow-xs">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-stone-500">Active Vulnerabilities</div>
            <div className="text-xl font-bold font-mono text-[#800020] mt-0.5">{findings.length}</div>
          </div>
          <div className="w-9 h-9 rounded-lg bg-[#800020]/10 border border-[#800020]/20 flex items-center justify-center text-[#800020] text-sm">
            🛡️
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          TAB 1: FLEET INVENTORY
      ───────────────────────────────────────────────────────────── */}
      {activeTab === "inventory" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-[#e5ded0] shadow-xs">
            {/* Filters */}
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-4 gap-2.5">
              <input
                placeholder="🔍 Search name, IP, sector, OS..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-[#faf7f2] border border-[#d6ccbe] rounded-lg px-3 py-1.5 text-xs font-mono text-stone-900 placeholder-stone-400 focus:outline-none focus:border-[#800020] sm:col-span-2"
              />
              <select
                value={filterCriticality}
                onChange={(e) => setFilterCriticality(e.target.value)}
                className="bg-[#faf7f2] border border-[#d6ccbe] rounded-lg px-2.5 py-1.5 text-xs font-mono text-stone-800 focus:outline-none focus:border-[#800020]"
              >
                <option value="">All Criticalities</option>
                {["Critical", "High", "Medium", "Low"].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <select
                value={filterExposure}
                onChange={(e) => setFilterExposure(e.target.value)}
                className="bg-[#faf7f2] border border-[#d6ccbe] rounded-lg px-2.5 py-1.5 text-xs font-mono text-stone-800 focus:outline-none focus:border-[#800020]"
              >
                <option value="">All Zones</option>
                <option value="Internal">Internal (Segmented)</option>
                <option value="External">External (Internet)</option>
              </select>

              {/* Dataset Scope Dropdown */}
              <select
                value={selectedDataset}
                onChange={(e) => setSelectedDataset(e.target.value)}
                className="bg-[#faf7f2] border border-[#d6ccbe] rounded-lg px-2.5 py-1.5 text-xs font-mono text-stone-900 font-bold focus:outline-none focus:border-[#800020] sm:col-span-2 md:col-span-1"
              >
                <option value="ALL">📁 All Datasets ({assets.length})</option>
                {availableDatasets.map((ds) => {
                  const count = assets.filter((a) => a.environment === ds).length;
                  return (
                    <option key={ds} value={ds}>
                      📄 {ds} {count > 0 ? `(${count})` : ""}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAssetForm(!showAssetForm)}
                className="px-3 py-1.5 bg-[#800020] hover:bg-[#66001a] text-white rounded-lg text-xs font-mono font-bold transition cursor-pointer flex items-center gap-1.5 shadow-xs"
              >
                {showAssetForm ? "✕ Close Form" : "+ Register Asset"}
              </button>
              <button
                onClick={() => setTab("upload")}
                className="px-3 py-1.5 bg-[#faf7f2] hover:bg-stone-200 text-stone-800 rounded-lg text-xs font-mono font-medium border border-[#d6ccbe] transition cursor-pointer flex items-center gap-1"
              >
                <span>📥</span> Batch CSV
              </button>
            </div>
          </div>

          {/* Asset Registration Modal / Form */}
          {showAssetForm && (
            <div className="bg-white border-2 border-[#d6ccbe] rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-[#e5ded0]">
                <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-[#800020] flex items-center gap-2">
                  <span>⚡</span> Register Infrastructure Asset
                </h3>
                <button
                  onClick={() => setShowAssetForm(false)}
                  className="text-xs text-stone-500 hover:text-stone-900 cursor-pointer"
                >
                  ✕
                </button>
              </div>
              <AssetForm
                onSuccess={() => {
                  loadAssets();
                  setShowAssetForm(false);
                }}
                onCancel={() => setShowAssetForm(false)}
              />
            </div>
          )}

          {/* Asset Inventory Table */}
          <div className="bg-white border border-[#e5ded0] rounded-2xl overflow-hidden shadow-xs">
            {loadingAssets ? (
              <div className="p-8 text-center text-xs font-mono text-stone-500 animate-pulse">
                Loading infrastructure assets from database...
              </div>
            ) : assetError ? (
              <div className="p-6 text-center text-xs font-mono text-red-700 bg-red-50">
                Error loading assets: {assetError}
              </div>
            ) : displayAssets.length === 0 ? (
              <div className="p-12 text-center text-xs font-mono text-stone-500 space-y-3">
                <div className="text-2xl">🔍</div>
                <div>No matching assets found in database.</div>
                <button
                  onClick={() => setTab("upload")}
                  className="px-4 py-2 bg-[#800020] hover:bg-[#66001a] text-white rounded-lg text-xs font-mono font-bold transition cursor-pointer inline-block"
                >
                  Upload Sample CSV
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono border-collapse">
                  <thead>
                    <tr className="border-b border-[#e5ded0] bg-[#faf7f2] text-stone-600 text-[10px] uppercase tracking-wider">
                      <th className="py-3 px-4">Asset Identification</th>
                      <th className="py-3 px-4">Type & Sector</th>
                      <th className="py-3 px-4">IP & Network Zone</th>
                      <th className="py-3 px-4">Criticality Tier</th>
                      <th className="py-3 px-4">OS / Environment</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e5ded0]">
                    {displayAssets.map((asset) => (
                      <tr
                        key={asset.id}
                        className="hover:bg-[#faf7f2] transition group"
                      >
                        <td className="py-3 px-4">
                          <Link
                            to={`/assets/${asset.id}`}
                            className="font-bold text-stone-900 hover:text-[#800020] transition flex items-center gap-1.5"
                          >
                            <span>🖥️</span>
                            <span>{asset.asset_name}</span>
                          </Link>
                          <div className="text-[10px] text-stone-500 mt-0.5">
                            ID: #{asset.id} {asset.owner && `• Owner: ${asset.owner}`}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-stone-800">{asset.asset_type}</div>
                          <div className="text-[10px] text-stone-500">
                            {asset.department || "General"}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-stone-800 font-mono">{asset.ip_address}</div>
                          <span
                            className={`inline-block mt-0.5 text-[9px] px-1.5 py-0.2 rounded font-mono font-semibold uppercase ${
                              EXPOSURE_BADGES[asset.exposure] || EXPOSURE_BADGES.Internal
                            }`}
                          >
                            {asset.exposure}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              CRITICALITY_BADGES[asset.criticality] ||
                              "bg-stone-100 text-stone-800"
                            }`}
                          >
                            {asset.criticality}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-stone-600">
                          <div>{asset.operating_system || "Unknown OS"}</div>
                          <div className="text-[10px] text-stone-500">
                            {asset.software?.length || 0} packages
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Link
                              to={`/assets/${asset.id}`}
                              className="px-2 py-1 rounded bg-[#faf7f2] hover:bg-stone-200 text-[#800020] hover:text-[#66001a] border border-[#d6ccbe] text-[10px] font-semibold transition"
                            >
                              Inspect →
                            </Link>
                            <button
                              onClick={() => handleDeleteAsset(asset.id, asset.asset_name)}
                              className="px-2 py-1 rounded bg-[#faf7f2] hover:bg-red-50 text-stone-500 hover:text-red-700 border border-[#d6ccbe] text-[10px] font-semibold transition cursor-pointer"
                              title="Delete asset"
                            >
                              🗑️
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TAB 2: CSV INGESTION & VALIDATION
      ───────────────────────────────────────────────────────────── */}
      {activeTab === "upload" && (
        <div className="space-y-6">
          <div className="bg-white border border-[#e5ded0] rounded-2xl p-6 shadow-xs">
            <div className="mb-4">
              <h2 className="text-base font-black text-[#800020] font-mono flex items-center gap-2">
                <span>📥</span> Two-Step CSV Ingestion Pipeline
              </h2>
              <p className="text-xs text-stone-600 mt-1">
                Upload your asset inventory CSV. The server validates every row before import,
                flagging syntax errors, duplicate IPs, or missing required fields for operator sign-off.
              </p>
            </div>

            <CsvUpload
              onSuccess={(newDatasetName) => {
                loadAssets();
                if (newDatasetName) {
                  setSelectedDataset(newDatasetName);
                }
                setTab("inventory");
              }}
            />
          </div>

          {/* Expected CSV Schema Guide */}
          <div className="bg-white border border-[#e5ded0] rounded-2xl p-5 shadow-xs">
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-[#800020] mb-2">
              Expected CSV Schema Specification
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs font-mono">
              <div className="p-2.5 rounded-lg bg-[#faf7f2] border border-[#d6ccbe]">
                <div className="font-bold text-[#800020]">hostname</div>
                <div className="text-[11px] text-stone-600 mt-0.5">Asset identifier / FQDN (Required)</div>
              </div>
              <div className="p-2.5 rounded-lg bg-[#faf7f2] border border-[#d6ccbe]">
                <div className="font-bold text-[#800020]">ip_address</div>
                <div className="text-[11px] text-stone-600 mt-0.5">IPv4 address format (Required)</div>
              </div>
              <div className="p-2.5 rounded-lg bg-[#faf7f2] border border-[#d6ccbe]">
                <div className="font-bold text-[#800020]">asset_type</div>
                <div className="text-[11px] text-stone-600 mt-0.5">Server, Database, IoT, etc.</div>
              </div>
              <div className="p-2.5 rounded-lg bg-[#faf7f2] border border-[#d6ccbe]">
                <div className="font-bold text-[#800020]">criticality</div>
                <div className="text-[11px] text-stone-600 mt-0.5">Critical, High, Medium, Low</div>
              </div>
              <div className="p-2.5 rounded-lg bg-[#faf7f2] border border-[#d6ccbe]">
                <div className="font-bold text-[#800020]">exposure</div>
                <div className="text-[11px] text-stone-600 mt-0.5">Internal or External</div>
              </div>
              <div className="p-2.5 rounded-lg bg-[#faf7f2] border border-[#d6ccbe]">
                <div className="font-bold text-[#800020]">installed_software</div>
                <div className="text-[11px] text-stone-600 mt-0.5">Semicolon-delimited name:version pairs</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TAB 3: PERIMETER TOPOLOGY MAP
      ───────────────────────────────────────────────────────────── */}
      {activeTab === "topology" && (
        <div className="space-y-6">
          {actionNotification && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-mono rounded-xl flex items-center justify-between">
              <span>✓ {actionNotification}</span>
              <button
                onClick={() => setActionNotification(null)}
                className="text-stone-500 hover:text-stone-900 cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {/* Network Canvas Section */}
          <div className="relative rounded-2xl overflow-hidden bg-[#f4efe6] border-2 border-[#d6ccbe] shadow-sm flex items-center justify-center p-8 h-[480px]">
            {/* Subtle Grid Dots */}
            <div className="absolute inset-0 bg-[radial-gradient(#d6ccbe_1.5px,transparent_1.5px)] [background-size:26px_26px] opacity-70 pointer-events-none" />

            <div className="relative w-full max-w-4xl h-full flex items-center justify-center">
              {/* Connection Lines */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none stroke-[#c4b5a0]">
                <line x1="50%" y1="50%" x2="16%" y2="20%" strokeDasharray="4 4" strokeWidth="1.5" />
                <line x1="50%" y1="50%" x2="84%" y2="18%" strokeDasharray="4 4" strokeWidth="1.5" />
                <line x1="50%" y1="50%" x2="14%" y2="80%" strokeDasharray="4 4" strokeWidth="1.5" />
                <line x1="50%" y1="50%" x2="86%" y2="82%" strokeDasharray="4 4" strokeWidth="1.5" />
              </svg>

              {/* Background Network Elements */}
              <div className="absolute top-[12%] left-[10%] flex flex-col items-center filter blur-[0.5px] opacity-70 select-none">
                <div className="w-12 h-12 rounded-xl bg-white border border-[#d6ccbe] flex items-center justify-center text-stone-600 shadow-xs">
                  🛡️
                </div>
                <span className="text-xs font-bold text-stone-700 mt-1 font-mono">Perimeter Gateway</span>
                <span className="text-[10px] text-stone-500 font-mono">10.0.1.1</span>
              </div>

              <div className="absolute top-[10%] right-[10%] flex flex-col items-center filter blur-[0.5px] opacity-70 select-none">
                <div className="w-12 h-12 rounded-xl bg-white border border-[#d6ccbe] flex items-center justify-center text-stone-600 shadow-xs">
                  ☁️
                </div>
                <span className="text-xs font-bold text-stone-700 mt-1 font-mono">Cloud Directory</span>
                <span className="text-[10px] text-stone-500 font-mono">cloud.internal</span>
              </div>

              <div className="absolute bottom-[10%] left-[8%] flex flex-col items-center filter blur-[0.5px] opacity-70 select-none">
                <div className="w-12 h-12 rounded-xl bg-white border border-[#d6ccbe] flex items-center justify-center text-stone-600 shadow-xs">
                  💾
                </div>
                <span className="text-xs font-bold text-stone-700 mt-1 font-mono">Database Node</span>
                <span className="text-[10px] text-stone-500 font-mono">10.0.2.25</span>
              </div>

              <div className="absolute bottom-[10%] right-[8%] flex flex-col items-center filter blur-[0.5px] opacity-70 select-none">
                <div className="w-12 h-12 rounded-xl bg-white border border-[#d6ccbe] flex items-center justify-center text-stone-600 shadow-xs">
                  🗄️
                </div>
                <span className="text-xs font-bold text-stone-700 mt-1 font-mono">Backup Vault</span>
                <span className="text-[10px] text-stone-500 font-mono">10.0.4.50</span>
              </div>

              {/* Central Workstation (Target Asset) */}
              <div className="relative z-10 flex flex-col items-center">
                <div className="w-72 bg-white border-2 border-[#800020] rounded-2xl p-5 shadow-lg flex flex-col items-center text-center">
                  <div className="w-14 h-14 rounded-xl bg-[#f5f0e6] border border-[#d6ccbe] flex items-center justify-center text-[#800020] mb-2.5 relative">
                    <span className="text-2xl">🖥️</span>
                    <span className="absolute top-1.5 right-1.5 w-3 h-3 rounded-full bg-[#800020]" />
                  </div>

                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#800020] bg-[#800020]/10 px-2 py-0.5 rounded border border-[#800020]/20 mb-1">
                    TARGET ASSET • IMPACTED
                  </span>
                  <h3 className="text-base font-black text-stone-900 tracking-tight">
                    {selectedFinding
                      ? `Asset #${selectedFinding.asset_id}`
                      : assets[0]?.asset_name || "Enterprise Host"}
                  </h3>
                  <div className="text-xs text-stone-600 font-mono mt-1">
                    Software:{" "}
                    <span className="text-[#800020] font-bold">
                      {selectedFinding?.matched_software || "OpenSSL / Apache"}
                    </span>
                  </div>
                </div>

                {/* Floating Vulnerability Card */}
                {selectedFinding && (
                  <div className="absolute -top-14 -right-24 md:-right-48 z-20">
                    <button
                      onClick={() => setIsModalOpen(true)}
                      className="bg-white hover:bg-[#faf7f2] border-2 border-[#800020] text-left rounded-2xl p-4 shadow-xl max-w-xs transition-all hover:scale-105 cursor-pointer group"
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[#800020] text-sm">⚠️</span>
                          <span
                            className={`text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                              SEV_COLORS[selectedFinding.vulnerability.severity?.toUpperCase() || "HIGH"]
                            }`}
                          >
                            {selectedFinding.vulnerability.severity || "HIGH"} SEVERITY
                          </span>
                        </div>
                        <span className="text-[#800020] group-hover:translate-x-1 transition text-sm">
                          →
                        </span>
                      </div>
                      <div className="font-bold text-stone-900 text-xs truncate">
                        {selectedFinding.vulnerability.cve_id}
                      </div>
                      <div className="text-[11px] text-stone-600 line-clamp-2 mt-1">
                        {selectedFinding.vulnerability.description || "Active security vulnerability"}
                      </div>
                      <div className="mt-2 text-[10px] text-[#800020] font-mono font-semibold">
                        Investigate Blast Radius & Plan →
                      </div>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Finding Selection Table */}
          <div className="bg-white border border-[#e5ded0] rounded-2xl overflow-hidden p-4 shadow-xs">
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-[#800020] mb-3 flex items-center justify-between">
              <span>Select Finding to Focus Topology</span>
              <span className="text-stone-500 text-[11px]">{findings.length} findings available</span>
            </h3>

            {findings.length === 0 ? (
              <div className="text-center py-6 text-xs font-mono text-stone-500">
                No detected vulnerabilities yet. Run assessment in the Assessments tab.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="border-b border-[#e5ded0] text-[10px] uppercase text-stone-600 bg-[#faf7f2]">
                      <th className="py-2.5 px-3">CVE Identifier</th>
                      <th className="py-2.5 px-3">Asset ID</th>
                      <th className="py-2.5 px-3">Component</th>
                      <th className="py-2.5 px-3">Severity</th>
                      <th className="py-2.5 px-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e5ded0]">
                    {findings.slice(0, 10).map((f) => {
                      const isSelected =
                        selectedFinding?.id === f.id ||
                        (selectedFinding?.asset_id === f.asset_id &&
                          selectedFinding?.vulnerability_id === f.vulnerability_id);
                      return (
                        <tr
                          key={`${f.asset_id}-${f.vulnerability_id}`}
                          onClick={() => setSelectedFinding(f)}
                          className={`cursor-pointer transition ${
                            isSelected ? "bg-[#800020]/10 text-[#800020]" : "hover:bg-[#faf7f2]"
                          }`}
                        >
                          <td className="py-2.5 px-3 font-bold text-stone-900">{f.vulnerability.cve_id}</td>
                          <td className="py-2.5 px-3 text-stone-700">Asset #{f.asset_id}</td>
                          <td className="py-2.5 px-3 text-stone-600">{f.matched_software || "System"}</td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                SEV_COLORS[f.vulnerability.severity?.toUpperCase() || "HIGH"]
                              }`}
                            >
                              {f.vulnerability.severity || "HIGH"}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedFinding(f);
                                setIsModalOpen(true);
                              }}
                              className="px-2 py-1 bg-[#800020] hover:bg-[#66001a] text-white rounded text-[10px] font-semibold cursor-pointer"
                            >
                              Investigate
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Investigation Modal */}
          {isModalOpen && selectedFinding && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs">
              <div className="bg-white border-2 border-[#d6ccbe] rounded-2xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto shadow-2xl">
                <div className="flex items-center justify-between pb-3 border-b border-[#e5ded0]">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🛡️</span>
                    <div>
                      <h3 className="font-bold text-[#800020] font-mono text-base">
                        {selectedFinding.vulnerability.cve_id}
                      </h3>
                      <div className="text-[11px] text-stone-600 font-mono">
                        Target Asset #{selectedFinding.asset_id} • {selectedFinding.matched_software}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsModalOpen(false)}
                    className="text-stone-400 hover:text-stone-900 text-base cursor-pointer font-bold"
                  >
                    ✕
                  </button>
                </div>

                <div className="space-y-3 text-xs font-mono">
                  <div className="bg-[#faf7f2] p-3 rounded-xl border border-[#d6ccbe]">
                    <div className="text-stone-500 text-[10px] uppercase font-bold">Description</div>
                    <div className="text-stone-800 mt-1 leading-relaxed">
                      {selectedFinding.vulnerability.description || "No description provided."}
                    </div>
                  </div>

                  {loadingPlan ? (
                    <div className="p-4 text-center text-[#800020] font-bold animate-pulse">
                      Synthesizing Action Plan and Threat Intelligence...
                    </div>
                  ) : actionPlan ? (
                    <div className="space-y-3">
                      <div className="bg-[#faf7f2] p-3 rounded-xl border border-[#d6ccbe]">
                        <div className="text-stone-500 text-[10px] uppercase font-bold">Threat Vector & Exploit Mechanism</div>
                        <div className="text-stone-800 mt-1">
                          {actionPlan.what_if_not_cured?.exploit_mechanism || "Remote Code Execution / Unauthorized privilege elevation."}
                        </div>
                      </div>

                      <div className="bg-[#faf7f2] p-3 rounded-xl border border-[#d6ccbe]">
                        <div className="text-stone-500 text-[10px] uppercase font-bold">Operational Impact Assessment</div>
                        <div className="text-stone-800 mt-1">
                          {actionPlan.consequences?.operational_impact || "Potential disruption to critical infrastructure node and attached services."}
                        </div>
                      </div>

                      <div className="bg-[#faf7f2] p-3 rounded-xl border border-[#d6ccbe]">
                        <div className="text-stone-500 text-[10px] uppercase font-bold">Remediation & Patch Guidance</div>
                        <div className="text-stone-900 mt-1 font-semibold">
                          {actionPlan.remedy?.title || "Apply vendor security update"}
                        </div>
                        {actionPlan.remedy?.patch_command && (
                          <div className="mt-2 bg-[#f5f0e6] p-2 rounded border border-[#d6ccbe] text-[#800020] font-mono text-[11px]">
                            <code>{actionPlan.remedy.patch_command}</code>
                          </div>
                        )}
                        {actionPlan.remedy?.workaround && (
                          <div className="mt-2 text-stone-600 text-[11px]">
                            <span className="text-amber-700 font-bold">Workaround: </span>
                            {actionPlan.remedy.workaround}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#e5ded0]">
                  <button
                    onClick={async () => {
                      try {
                        await quarantineAsset(selectedFinding.asset_id);
                        setActionNotification(`Asset #${selectedFinding.asset_id} isolated from network.`);
                        setIsModalOpen(false);
                      } catch (e: any) {
                        alert(e.message);
                      }
                    }}
                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-mono font-bold cursor-pointer"
                  >
                    ⚠️ Isolate Asset
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        await resolveFinding(selectedFinding.id);
                        setActionNotification(`Finding ${selectedFinding.vulnerability.cve_id} resolved.`);
                        setIsModalOpen(false);
                        const results = await getAssessmentResults({ limit: 100 });
                        setFindings(results);
                      } catch (e: any) {
                        alert(e.message);
                      }
                    }}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-mono font-bold cursor-pointer"
                  >
                    ✓ Mark Remediated
                  </button>
                  <button
                    onClick={() => setIsModalOpen(false)}
                    className="px-3 py-1.5 bg-stone-200 hover:bg-stone-300 text-stone-800 rounded-lg text-xs font-mono cursor-pointer font-semibold"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
