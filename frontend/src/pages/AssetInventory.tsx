import { useEffect, useState } from "react";
import { getAssets, deleteAsset } from "../services/api";
import type { Asset } from "../types/asset";
import AssetForm from "../components/AssetForm";
import CsvUpload from "../components/CsvUpload";
import { Link } from "react-router-dom";

const CRITICALITY_COLORS: Record<string, string> = {
  Critical: "bg-red-100 text-red-700 border border-red-200",
  High: "bg-orange-100 text-orange-700 border border-orange-200",
  Medium: "bg-yellow-100 text-yellow-700 border border-yellow-200",
  Low: "bg-green-100 text-green-700 border border-green-200",
};

const EXPOSURE_COLORS: Record<string, string> = {
  Internal: "bg-blue-100 text-blue-700",
  External: "bg-purple-100 text-purple-700",
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
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Asset Inventory</h1>
          <p className="text-gray-500 text-sm">{assets.length} asset(s) found</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-semibold"
        >
          {showForm ? "Close Form" : "+ Register Asset"}
        </button>
      </div>

      {/* Add Asset Form */}
      {showForm && (
        <div className="bg-white rounded-xl shadow-sm p-6 mb-5 border border-blue-100">
          <h2 className="text-lg font-bold text-gray-700 mb-4">Register New Asset</h2>
          <AssetForm onSuccess={() => { loadAssets(); setShowForm(false); }} onCancel={() => setShowForm(false)} />
        </div>
      )}

      {/* CSV Upload */}
      <div className="bg-white rounded-xl shadow-sm p-4 mb-5 border border-gray-100">
        <CsvUpload onSuccess={loadAssets} />
      </div>

      {/* Search & Filters */}
      <div className="bg-white rounded-xl shadow-sm p-4 mb-5 border border-gray-100">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <input
            placeholder="🔍 Search name, IP, type, dept..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm col-span-1 sm:col-span-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <select
            value={filterCriticality}
            onChange={e => setFilterCriticality(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            <option value="">All Criticalities</option>
            {["Critical","High","Medium","Low"].map(c => <option key={c}>{c}</option>)}
          </select>
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            <option value="">All Types</option>
            {["Server","Database","Computer","Router","Firewall","IoT","Application"].map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div className="mt-2 flex gap-2 flex-wrap">
          <select
            value={filterExposure}
            onChange={e => setFilterExposure(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            <option value="">All Exposures</option>
            <option>Internal</option>
            <option>External</option>
          </select>
          {(search || filterCriticality || filterType || filterExposure) && (
            <button
              onClick={() => { setSearch(""); setFilterCriticality(""); setFilterType(""); setFilterExposure(""); }}
              className="text-xs text-gray-500 hover:text-red-600 underline"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-red-700 text-sm">
          ⚠️ {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-x-auto border border-gray-100">
        {loading ? (
          <div className="p-10 text-center text-gray-400">Loading assets...</div>
        ) : assets.length === 0 ? (
          <div className="p-10 text-center text-gray-400">
            No assets found. Register one above or upload a CSV.
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Asset Name</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">IP Address</th>
                <th className="px-4 py-3">OS</th>
                <th className="px-4 py-3">Criticality</th>
                <th className="px-4 py-3">Exposure</th>
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {assets.map((asset) => (
                <tr key={asset.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-gray-400">{asset.id}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">
                    <Link to={`/assets/${asset.id}`} className="hover:text-blue-600 hover:underline">
                      {asset.asset_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{asset.asset_type}</td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                    {asset.ip_address || "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {asset.operating_system || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${CRITICALITY_COLORS[asset.criticality] ?? "bg-gray-100 text-gray-600"}`}>
                      {asset.criticality}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${EXPOSURE_COLORS[asset.exposure] ?? "bg-gray-100 text-gray-600"}`}>
                      {asset.exposure}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{asset.department || "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <Link
                        to={`/assets/${asset.id}`}
                        className="text-blue-600 hover:underline text-xs font-medium"
                      >
                        View
                      </Link>
                      <button
                        onClick={() => handleDelete(asset.id, asset.asset_name)}
                        className="text-red-500 hover:text-red-700 text-xs font-medium"
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
