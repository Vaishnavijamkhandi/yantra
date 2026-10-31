import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { getAsset, deleteAsset, updateAsset, getAssetVulnerabilities } from "../services/api";
import type { Asset, AssetUpdate, AssetVulnerability } from "../types/asset";

const CRITICALITY_COLORS: Record<string, string> = {
  Critical: "bg-[#800020]/10 text-[#800020] border border-[#800020]/30",
  High: "bg-red-50 text-red-700 border border-red-200",
  Medium: "bg-amber-50 text-amber-800 border border-amber-200",
  Low: "bg-emerald-50 text-emerald-800 border border-emerald-200",
};

const SEVERITY_BADGES: Record<string, string> = {
  CRITICAL: "bg-[#800020]/10 text-[#800020] border-[#800020]/30",
  HIGH: "bg-red-50 text-red-700 border-red-200",
  MEDIUM: "bg-amber-50 text-amber-800 border-amber-200",
  LOW: "bg-emerald-50 text-emerald-800 border-emerald-200",
};

export default function AssetDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [asset, setAsset] = useState<Asset | null>(null);
  const [vulnerabilities, setVulnerabilities] = useState<AssetVulnerability[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Edit mode
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<AssetUpdate>({});
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  useEffect(() => {
    if (!id) return;
    const assetId = Number(id);
    Promise.all([
      getAsset(assetId),
      getAssetVulnerabilities(assetId).catch(() => []),
    ])
      .then(([assetData, vulnsData]) => {
        setAsset(assetData);
        setEditForm(assetData);
        setVulnerabilities(vulnsData);
      })
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

  const inputCls = "bg-[#faf7f2] border border-[#d6ccbe] rounded-lg px-3 py-1.5 text-xs font-mono text-stone-900 focus:outline-none focus:border-[#800020] w-full";

  if (loading) return <div className="p-8 text-stone-500 font-mono text-xs">Loading asset record...</div>;
  if (error || !asset) return (
    <div className="p-8 space-y-3 font-mono">
      <p className="text-red-700 text-xs">⚠️ {error || "Asset not found"}</p>
      <Link to="/assets" className="text-[#800020] hover:underline text-xs font-bold">← Back to Inventory</Link>
    </div>
  );

  const row = (label: string, value: string | null | undefined, editKey?: keyof AssetUpdate, options?: string[]) => (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 py-3 border-b border-[#f0eae0] last:border-0 font-mono">
      <span className="text-[11px] font-bold text-stone-500 uppercase tracking-wide sm:w-44">{label}</span>
      {editing && editKey ? (
        options ? (
          <select value={(editForm[editKey] as string) ?? ""} onChange={e => setEditForm({ ...editForm, [editKey]: e.target.value })} className={inputCls}>
            {options.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        ) : (
          <input value={(editForm[editKey] as string) ?? ""} onChange={e => setEditForm({ ...editForm, [editKey]: e.target.value })} className={inputCls} />
        )
      ) : (
        <span className="text-xs text-stone-800 font-semibold">{value || <span className="text-stone-400 italic">Not specified</span>}</span>
      )}
    </div>
  );

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6 text-stone-900">
      <div className="flex items-center gap-2 font-mono text-xs">
        <Link to="/assets" className="text-[#800020] hover:underline font-bold">← Inventory</Link>
        <span className="text-stone-400">/</span>
        <span className="text-stone-600">{asset.asset_name}</span>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-[#e5ded0] overflow-hidden">
        {/* Asset header in solid maroon */}
        <div className="bg-[#800020] text-white p-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-black">
                {asset.asset_name}
              </h1>
              <p className="text-rose-100 text-xs font-mono mt-1">{asset.asset_type} · Asset ID #{asset.id}</p>
            </div>
            <span className={`text-xs px-3 py-1 rounded-lg font-mono font-bold bg-white text-[#800020]`}>
              {asset.criticality}
            </span>
          </div>
        </div>

        {/* Detail fields */}
        <div className="p-6">
          {row("IP Address", asset.ip_address, "ip_address")}
          {row("Operating System", asset.operating_system, "operating_system")}
          {row("Asset Type", asset.asset_type, "asset_type", ["Server","Database","Computer","Router","Firewall","IoT","Application"])}
          {row("Criticality Tier", asset.criticality, "criticality", ["Low","Medium","High","Critical"])}
          {row("Zone Exposure", asset.exposure, "exposure", ["Internal","External"])}
          {row("Sector / Department", asset.department, "department")}
          {row("Environment", asset.environment, "environment", ["Simulated","Production","Staging"])}
          {row("Registered", new Date(asset.created_at).toLocaleString())}
        </div>

        {/* Software */}
        {asset.software.length > 0 && (
          <div className="px-6 pb-6 border-t border-[#e5ded0] pt-5">
            <h2 className="text-xs font-mono font-bold text-[#800020] uppercase tracking-wide mb-3">
              Installed Software Inventory ({asset.software.length})
            </h2>
            <div className="grid gap-2">
              {asset.software.map(sw => (
                <div key={sw.id} className="flex items-center justify-between bg-[#faf7f2] rounded-xl px-4 py-2.5 border border-[#e5ded0] font-mono text-xs">
                  <div>
                    <span className="font-bold text-stone-900">{sw.software_name}</span>
                    {sw.vendor && <span className="text-stone-500 text-[11px] ml-2">by {sw.vendor}</span>}
                  </div>
                  <div className="flex gap-3 items-center">
                    <span className="text-[11px] bg-white border border-[#d6ccbe] text-[#800020] px-2.5 py-0.5 rounded-lg font-bold">{sw.version}</span>
                    <span className="text-[11px] text-stone-500">{sw.software_type}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Detected Vulnerabilities */}
        <div className="px-6 pb-6 border-t border-[#e5ded0] pt-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-mono font-bold text-[#800020] uppercase tracking-wide flex items-center gap-2">
              <span>⚠️ Confirmed CVE Matches</span>
              <span className={`px-2 py-0.5 text-xs rounded-full font-bold ${
                vulnerabilities.length > 0 ? "bg-[#800020]/10 text-[#800020] border border-[#800020]/20" : "bg-emerald-50 text-emerald-800 border border-emerald-200"
              }`}>
                {vulnerabilities.length}
              </span>
            </h2>
            <Link to="/assessment" className="text-xs font-mono text-[#800020] hover:underline font-bold">
              Open Assessment Engine →
            </Link>
          </div>

          {vulnerabilities.length === 0 ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 text-xs font-mono text-emerald-800">
              ✅ No known vulnerabilities matched currently. Run the Assessment engine to re-evaluate against latest CVE signatures.
            </div>
          ) : (
            <div className="space-y-2.5">
              {vulnerabilities.map((av) => {
                const sev = av.vulnerability.severity?.toUpperCase() || "UNKNOWN";
                return (
                  <div
                    key={av.id}
                    className="p-3.5 bg-[#faf7f2] border border-[#e5ded0] rounded-xl text-xs font-mono space-y-1.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[#800020]">
                          {av.vulnerability.cve_id}
                        </span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-md font-bold border ${
                            SEVERITY_BADGES[sev] ?? "bg-[#f5f0e6] text-stone-700 border-[#d6ccbe]"
                          }`}
                        >
                          {sev}
                        </span>
                        {av.vulnerability.cvss_score && (
                          <span className="text-[11px] font-bold text-stone-800">
                            CVSS {av.vulnerability.cvss_score.toFixed(1)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-stone-500">
                        <span>Component: <strong className="text-stone-800">{av.matched_software}</strong></span>
                        {av.vulnerability.reference_url && (
                          <a
                            href={av.vulnerability.reference_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[#800020] hover:underline"
                          >
                            NVD ↗
                          </a>
                        )}
                      </div>
                    </div>
                    <p className="text-stone-600 line-clamp-2 leading-relaxed font-sans text-xs">
                      {av.vulnerability.description}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-6 pb-6 flex gap-3 flex-wrap border-t border-[#e5ded0] pt-5 font-mono">
          {editing ? (
            <>
              <button onClick={handleSave} disabled={saving}
                className="bg-[#800020] hover:bg-[#66001a] text-white px-5 py-2 rounded-xl text-xs font-bold disabled:opacity-60 cursor-pointer shadow-xs">
                {saving ? "Saving..." : "Save Changes"}
              </button>
              <button onClick={() => { setEditing(false); setEditForm(asset); }}
                className="bg-[#f5f0e6] hover:bg-[#ede5d8] text-stone-700 px-5 py-2 rounded-xl text-xs cursor-pointer border border-[#d6ccbe]">
                Cancel
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setEditing(true)}
                className="bg-[#800020] hover:bg-[#66001a] text-white px-5 py-2 rounded-xl text-xs font-bold cursor-pointer shadow-xs">
                Edit Asset Telemetry
              </button>
              <button onClick={handleDelete}
                className="bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 px-5 py-2 rounded-xl text-xs font-bold cursor-pointer transition">
                Delete Node
              </button>
            </>
          )}
          {saveMsg && <p className={`text-xs self-center ${saveMsg.startsWith("✅") ? "text-emerald-700" : "text-red-700"}`}>{saveMsg}</p>}
        </div>
      </div>
    </div>
  );
}
