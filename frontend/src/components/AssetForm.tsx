import { useState } from "react";
import { createAsset } from "../services/api";
import type { AssetCreate, SoftwareCreate } from "../types/asset";

interface Props {
  onSuccess: () => void;
  onCancel?: () => void;
}

const EMPTY_FORM: AssetCreate = {
  asset_name: "",
  asset_type: "Server",
  ip_address: "",
  operating_system: "",
  criticality: "Medium",
  exposure: "Internal",
  department: "",
  environment: "Simulated",
  software: [],
};

const EMPTY_SW: SoftwareCreate = {
  software_name: "",
  vendor: "",
  version: "",
  software_type: "Application",
};

export default function AssetForm({ onSuccess, onCancel }: Props) {
  const [form, setForm] = useState<AssetCreate>(EMPTY_FORM);
  const [software, setSoftware] = useState<SoftwareCreate[]>([]);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  function addSoftwareRow() {
    setSoftware([...software, { ...EMPTY_SW }]);
  }

  function removeSoftwareRow(i: number) {
    setSoftware(software.filter((_, idx) => idx !== i));
  }

  function handleSwChange(
    i: number,
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) {
    const updated = [...software];
    updated[i] = { ...updated[i], [e.target.name]: e.target.value };
    setSoftware(updated);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      await createAsset({ ...form, software });
      setMessage("✅ Asset registered successfully!");
      setForm(EMPTY_FORM);
      setSoftware([]);
      onSuccess();
    } catch (err: unknown) {
      setMessage(`❌ ${err instanceof Error ? err.message : "Failed to register asset"}`);
    } finally {
      setSaving(false);
    }
  }

  const inputCls = "w-full bg-[#faf7f2] border border-[#d6ccbe] rounded-lg px-3 py-2 text-xs font-mono text-stone-900 focus:outline-none focus:border-[#800020] placeholder-stone-400";
  const labelCls = "block text-[11px] font-mono font-bold text-[#800020] mb-1 uppercase tracking-wide";

  return (
    <form onSubmit={handleSubmit} className="space-y-5 text-stone-900">
      {/* Core fields */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Asset Name *</label>
          <input name="asset_name" value={form.asset_name} onChange={handleChange}
            required placeholder="e.g. Substation SCADA Gateway" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Asset Type *</label>
          <select name="asset_type" value={form.asset_type} onChange={handleChange} className={inputCls}>
            {["Server","Database","Computer","Router","Firewall","IoT","Application"].map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>IP Address</label>
          <input name="ip_address" value={form.ip_address} onChange={handleChange}
            placeholder="e.g. 192.168.10.15" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Operating System</label>
          <input name="operating_system" value={form.operating_system} onChange={handleChange}
            placeholder="e.g. Embedded Linux / Ubuntu 22.04" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Criticality *</label>
          <select name="criticality" value={form.criticality} onChange={handleChange} className={inputCls}>
            {["Low","Medium","High","Critical"].map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Exposure *</label>
          <select name="exposure" value={form.exposure} onChange={handleChange} className={inputCls}>
            <option value="Internal">Internal (Segmented)</option>
            <option value="External">External (Internet-Facing)</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Sector / Department</label>
          <input name="department" value={form.department} onChange={handleChange}
            placeholder="e.g. Power Grid & Energy, Water Utilities" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Environment</label>
          <select name="environment" value={form.environment} onChange={handleChange} className={inputCls}>
            <option value="Simulated">Simulated</option>
            <option value="Production">Production</option>
            <option value="Staging">Staging</option>
          </select>
        </div>
      </div>

      {/* Software section */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className={labelCls}>Installed Software Components</span>
          <button type="button" onClick={addSoftwareRow}
            className="text-xs font-mono font-bold bg-[#faf7f2] hover:bg-[#ede5d8] text-[#800020] border border-[#d6ccbe] px-3 py-1 rounded-lg transition cursor-pointer">
            + Add Software Component
          </button>
        </div>
        {software.length === 0 && (
          <p className="text-xs text-stone-500 font-mono italic">No software packages registered yet. Click &quot;+ Add Software Component&quot; to specify.</p>
        )}
        {software.map((sw, i) => (
          <div key={i} className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2 p-3 bg-[#faf7f2] rounded-xl border border-[#e5ded0]">
            <input name="software_name" placeholder="Name * (e.g. openssh-server)" value={sw.software_name}
              onChange={e => handleSwChange(i, e)} required className={inputCls} />
            <input name="vendor" placeholder="Vendor" value={sw.vendor}
              onChange={e => handleSwChange(i, e)} className={inputCls} />
            <input name="version" placeholder="Version * (e.g. 8.9p1)" value={sw.version}
              onChange={e => handleSwChange(i, e)} required className={inputCls} />
            <div className="flex gap-2">
              <select name="software_type" value={sw.software_type}
                onChange={e => handleSwChange(i, e)} className={inputCls}>
                {["Application","Database","Web Server","OS","Security","Monitoring","Other"].map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <button type="button" onClick={() => removeSoftwareRow(i)}
                className="text-stone-400 hover:text-red-700 text-lg px-2 cursor-pointer">✕</button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-3 pt-2">
        <button type="submit" disabled={saving}
          className="bg-[#800020] hover:bg-[#66001a] text-white px-6 py-2 rounded-xl text-xs font-mono font-bold disabled:opacity-60 shadow-xs uppercase tracking-wider cursor-pointer">
          {saving ? "Registering..." : "⚡ Register Asset"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel}
            className="bg-[#f5f0e6] hover:bg-[#ede5d8] text-stone-700 px-6 py-2 rounded-xl text-xs font-mono cursor-pointer border border-[#d6ccbe]">
            Cancel
          </button>
        )}
      </div>

      {message && (
        <p className={`text-xs font-mono font-medium ${message.startsWith("✅") ? "text-emerald-700" : "text-red-700"}`}>
          {message}
        </p>
      )}
    </form>
  );
}
