import { useEffect, useState } from "react";
import { getAssets, deleteAsset } from "../services/api";
import type { Asset } from "../types/asset";
import AssetForm from "../components/AssetForm";
import CsvUpload from "../components/CsvUpload";
import { Link } from "react-router-dom";

const CRITICALITY_COLORS: Record<string, string> = {
  Critical: "bg-[#800020]/10 text-[#800020] border border-[#800020]/30",
  High: "bg-red-50 text-red-700 border border-red-200",
  Medium: "bg-amber-50 text-amber-800 border border-amber-200",
  Low: "bg-emerald-50 text-emerald-800 border border-emerald-200",
};

const EXPOSURE_COLORS: Record<string, string> = {
  Internal: "bg-[#ede5d8] text-stone-700 border border-[#d6ccbe]",
  External: "bg-red-50 text-red-700 border border-red-200",
};

export default function AssetInventory() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [filterCriticality, setFilterCriticality] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterExposure, setFilterExposure] = useState("");

  async function loadAssets() {
    try {
      setLoading(true);
      setError("");
      const data = await getAssets({
        search: search || undefined,
        criticality: filterCriticality || undefined,
        asset_type: filterType || undefined,
        exposure: filterExposure || undefined,
      });
      setAssets(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load assets");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAssets(); }, [search, filterCriticality, filterType, filterExposure]);

  async function handleDelete(id: number, name: string) {
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    try {
      await deleteAsset(id);
      await loadAssets();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete asset");
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 text-stone-900">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#e5ded0]">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black text-[#800020] tracking-tight">
              Asset Inventory
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold uppercase bg-[#800020]/10 text-[#800020] border border-[#800020]/20">
              {assets.length} Assets
            </span>
          </div>
          <p className="text-stone-600 text-xs mt-1">
            Profiling power grid nodes, water utilities, telecom gateways, healthcare, and ICS/OT equipment.
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-[#800020] hover:bg-[#66001a] text-white px-4 py-2 rounded-xl text-xs font-mono font-bold transition cursor-pointer uppercase shadow-xs"
        >
          {showForm ? "✕ Close Form" : "+ Register Asset"}
        </button>
      </div>

      {/* Add Asset Form */}
      {showForm && (
        <div className="bg-white rounded-2xl p-6 border-2 border-[#d6ccbe] shadow-sm">
          <h2 className="text-xs font-mono font-bold text-[#800020] mb-4 uppercase tracking-wider flex items-center gap-2">
            <span>⚡</span>
            <span>Register New Infrastructure Asset</span>
          </h2>
          <AssetForm onSuccess={() => { loadAssets(); setShowForm(false); }} onCancel={() => setShowForm(false)} />
        </div>
      )}

      {/* CSV Upload */}
      <div className="bg-white rounded-2xl p-5 border border-[#e5ded0] shadow-xs">
        <CsvUpload onSuccess={loadAssets} />
      </div>

      {/* Search & Filters */}
      <div className="bg-white rounded-2xl p-4 border border-[#e5ded0] shadow-xs">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <input
            placeholder="🔍 Search hostname, IP, sector, OS, software..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-[#faf7f2] border border-[#d6ccbe] rounded-lg px-3.5 py-2 text-xs font-mono text-stone-900 col-span-1 sm:col-span-2 focus:outline-none focus:border-[#800020] placeholder-stone-400"
          />
          <select
            value={filterCriticality}
            onChange={e => setFilterCriticality(e.target.value)}
            className="bg-[#faf7f2] border border-[#d6ccbe] rounded-lg px-3 py-2 text-xs font-mono text-stone-800 focus:outline-none focus:border-[#800020]"
          >
            <option value="">All Criticalities</option>
            {["Critical","High","Medium","Low"].map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            className="bg-[#faf7f2] border border-[#d6ccbe] rounded-lg px-3 py-2 text-xs font-mono text-stone-800 focus:outline-none focus:border-[#800020]"
          >
            <option value="">All Asset Types</option>
            {["Server","Database","Computer","Router","Firewall","IoT","Application"].map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="mt-3 flex gap-3 items-center flex-wrap">
          <select
            value={filterExposure}
            onChange={e => setFilterExposure(e.target.value)}
            className="bg-[#faf7f2] border border-[#d6ccbe] rounded-lg px-3 py-1.5 text-xs font-mono text-stone-800 focus:outline-none focus:border-[#800020]"
          >
            <option value="">All Zones</option>
            <option value="Internal">Internal (Segmented)</option>
            <option value="External">External (Internet-Facing)</option>
          </select>
          {(search || filterCriticality || filterType || filterExposure) && (
            <button
              onClick={() => { setSearch(""); setFilterCriticality(""); setFilterType(""); setFilterExposure(""); }}
              className="text-xs font-mono text-[#800020] hover:underline cursor-pointer font-bold"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-xs font-mono">
          ⚠️ {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl overflow-x-auto border border-[#e5ded0] shadow-xs">
        {loading ? (
          <div className="p-10 text-center text-stone-500 font-mono text-xs">Loading infrastructure registry...</div>
        ) : assets.length === 0 ? (
          <div className="p-10 text-center text-stone-500 font-mono text-xs">
            No assets match criteria. Register one above or import a CSV.
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="bg-[#f5f0e6] text-stone-600 font-mono uppercase tracking-wider border-b border-[#e5ded0]">
              <tr>
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">Asset Hostname</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">IP Address</th>
                <th className="px-4 py-3">OS</th>
                <th className="px-4 py-3">Criticality</th>
                <th className="px-4 py-3">Exposure</th>
                <th className="px-4 py-3">Sector</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0eae0] font-mono">
              {assets.map((asset) => (
                <tr key={asset.id} className="hover:bg-[#faf6f0] transition-colors border-b border-[#f0eae0]">
                  <td className="px-4 py-3 text-stone-400">#{asset.id}</td>
                  <td className="px-4 py-3 font-sans">
                    <Link to={`/assets/${asset.id}`} className="text-stone-900 hover:text-[#800020] font-bold hover:underline">
                      {asset.asset_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-stone-600">{asset.asset_type}</td>
                  <td className="px-4 py-3 text-stone-700 text-xs">
                    {asset.ip_address || "—"}
                  </td>
                  <td className="px-4 py-3 text-stone-600 text-xs">
                    {asset.operating_system || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[11px] px-2.5 py-0.5 rounded-md font-bold ${CRITICALITY_COLORS[asset.criticality] ?? "bg-[#f5f0e6] text-stone-700 border border-[#d6ccbe]"}`}>
                      {asset.criticality}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[11px] px-2.5 py-0.5 rounded-md font-medium ${EXPOSURE_COLORS[asset.exposure] ?? "bg-[#f5f0e6] text-stone-700 border border-[#d6ccbe]"}`}>
                      {asset.exposure}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-stone-700 font-sans">{asset.department || "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        to={`/assets/${asset.id}`}
                        className="text-[#800020] hover:underline text-xs font-bold"
                      >
                        Inspect →
                      </Link>
                      <Link
                        to={`/infrastructure?assetId=${asset.id}`}
                        className="text-indigo-600 hover:underline text-xs font-medium"
                      >
                        Infrastructure
                      </Link>
                      <button
                        onClick={() => handleDelete(asset.id, asset.asset_name)}
                        className="text-stone-400 hover:text-red-700 text-xs px-2 py-0.5 rounded transition cursor-pointer"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
