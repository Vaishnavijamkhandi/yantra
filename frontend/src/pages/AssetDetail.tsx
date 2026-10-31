import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { getAsset, deleteAsset, updateAsset } from "../services/api";
import type { Asset, AssetUpdate } from "../types/asset";

const CRITICALITY_COLORS: Record<string, string> = {
  Critical: "bg-red-100 text-red-700",
  High: "bg-orange-100 text-orange-700",
  Medium: "bg-yellow-100 text-yellow-700",
  Low: "bg-green-100 text-green-700",
};

export default function AssetDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [asset, setAsset] = useState<Asset | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Edit mode
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<AssetUpdate>({});
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  useEffect(() => {
    if (!id) return;
    getAsset(Number(id))
      .then(data => { setAsset(data); setEditForm(data); })
      .catch(() => setError("Asset not found"))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleDelete() {
    if (!asset) return;
    if (!window.confirm(`Delete "${asset.asset_name}"?`)) return;
    await deleteAsset(asset.id);
    navigate("/assets");
  }

  async function handleSave() {
    if (!asset) return;
    setSaving(true);
    setSaveMsg("");
    try {
      const updated = await updateAsset(asset.id, editForm);
      setAsset(updated);
      setEditing(false);
      setSaveMsg("✅ Saved!");
    } catch (err: unknown) {
      setSaveMsg(`❌ ${err instanceof Error ? err.message : "Save failed"}`);
    } finally {
      setSaving(false);
    }
  }

  const inputCls = "border border-gray-300 rounded px-2 py-1 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-400";

  if (loading) return <div className="p-8 text-gray-500">Loading asset...</div>;
  if (error || !asset) return (
    <div className="p-8">
      <p className="text-red-600 mb-3">⚠️ {error || "Asset not found"}</p>
      <Link to="/assets" className="text-blue-600 hover:underline text-sm">← Back to Inventory</Link>
    </div>
  );

  const row = (label: string, value: string | null | undefined, editKey?: keyof AssetUpdate, options?: string[]) => (
    <div className="flex flex-col sm:flex-row sm:items-center gap-1 py-3 border-b border-gray-100 last:border-0">
      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide sm:w-40">{label}</span>
      {editing && editKey ? (
        options ? (
          <select value={(editForm[editKey] as string) ?? ""} onChange={e => setEditForm({ ...editForm, [editKey]: e.target.value })} className={inputCls}>
            {options.map(o => <option key={o}>{o}</option>)}
          </select>
        ) : (
          <input value={(editForm[editKey] as string) ?? ""} onChange={e => setEditForm({ ...editForm, [editKey]: e.target.value })} className={inputCls} />
        )
      ) : (
        <span className="text-sm text-gray-800">{value || <span className="text-gray-400 italic">Not specified</span>}</span>
      )}
    </div>
  );

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-2 mb-4">
        <Link to="/assets" className="text-blue-600 hover:underline text-sm">← Inventory</Link>
        <span className="text-gray-400">/</span>
        <span className="text-sm text-gray-600">{asset.asset_name}</span>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {/* Asset header */}
        <div className="bg-gradient-to-r from-blue-700 to-blue-900 text-white p-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold">{asset.asset_name}</h1>
              <p className="text-blue-200 text-sm mt-1">{asset.asset_type} · ID #{asset.id}</p>
            </div>
            <span className={`text-xs px-3 py-1 rounded-full font-semibold ${CRITICALITY_COLORS[asset.criticality] ?? "bg-gray-100 text-gray-700"}`}>
              {asset.criticality}
            </span>
          </div>
        </div>

        {/* Detail fields */}
        <div className="p-6">
          {row("IP Address", asset.ip_address, "ip_address")}
          {row("Operating System", asset.operating_system, "operating_system")}
          {row("Asset Type", asset.asset_type, "asset_type", ["Server","Database","Computer","Router","Firewall","IoT","Application"])}
          {row("Criticality", asset.criticality, "criticality", ["Low","Medium","High","Critical"])}
          {row("Exposure", asset.exposure, "exposure", ["Internal","External"])}
          {row("Department", asset.department, "department")}
          {row("Environment", asset.environment, "environment", ["Simulated","Production","Staging"])}
          {row("Registered", new Date(asset.created_at).toLocaleString())}
        </div>

        {/* Software */}
        {asset.software.length > 0 && (
          <div className="px-6 pb-6">
            <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">Installed Software ({asset.software.length})</h2>
            <div className="grid gap-2">
              {asset.software.map(sw => (
                <div key={sw.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2 border border-gray-100">
                  <div>
                    <span className="font-medium text-sm text-gray-800">{sw.software_name}</span>
                    {sw.vendor && <span className="text-gray-400 text-xs ml-2">by {sw.vendor}</span>}
                  </div>
                  <div className="flex gap-3 items-center">
                    <span className="text-xs bg-white border border-gray-200 text-gray-600 px-2 py-0.5 rounded">{sw.version}</span>
                    <span className="text-xs text-gray-500">{sw.software_type}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="px-6 pb-6 flex gap-3 flex-wrap">
          {editing ? (
            <>
              <button onClick={handleSave} disabled={saving}
                className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-semibold disabled:opacity-60">
                {saving ? "Saving..." : "Save Changes"}
              </button>
              <button onClick={() => { setEditing(false); setEditForm(asset); }}
                className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-5 py-2 rounded-lg text-sm">
                Cancel
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setEditing(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-semibold">
                Edit Asset
              </button>
              <button onClick={handleDelete}
                className="bg-red-50 hover:bg-red-100 text-red-600 px-5 py-2 rounded-lg text-sm font-semibold border border-red-200">
                Delete Asset
              </button>
            </>
          )}
          {saveMsg && <p className={`text-sm self-center ${saveMsg.startsWith("✅") ? "text-green-600" : "text-red-600"}`}>{saveMsg}</p>}
        </div>
      </div>
    </div>
  );
}
