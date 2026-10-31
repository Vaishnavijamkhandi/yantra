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

  const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400";
  const labelCls = "block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide";

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Core fields */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Asset Name *</label>
          <input name="asset_name" value={form.asset_name} onChange={handleChange}
            required placeholder="e.g. Patient Management Server" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Asset Type *</label>
          <select name="asset_type" value={form.asset_type} onChange={handleChange} className={inputCls}>
            {["Server","Database","Computer","Router","Firewall","IoT","Application"].map(t => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>IP Address</label>
          <input name="ip_address" value={form.ip_address} onChange={handleChange}
            placeholder="e.g. 192.168.1.10" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Operating System</label>
          <input name="operating_system" value={form.operating_system} onChange={handleChange}
            placeholder="e.g. Ubuntu Server 22.04" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Criticality *</label>
          <select name="criticality" value={form.criticality} onChange={handleChange} className={inputCls}>
            {["Low","Medium","High","Critical"].map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Exposure *</label>
          <select name="exposure" value={form.exposure} onChange={handleChange} className={inputCls}>
            <option>Internal</option>
            <option>External</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Department</label>
          <input name="department" value={form.department} onChange={handleChange}
            placeholder="e.g. Patient Services" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Environment</label>
          <select name="environment" value={form.environment} onChange={handleChange} className={inputCls}>
            <option>Simulated</option>
            <option>Production</option>
            <option>Staging</option>
          </select>
        </div>
      </div>

      {/* Software section */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className={labelCls}>Installed Software</span>
          <button type="button" onClick={addSoftwareRow}
            className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1 rounded-lg">
            + Add Software
          </button>
        </div>
        {software.length === 0 && (
          <p className="text-xs text-gray-400 italic">No software added. Click "+ Add Software" to include installed components.</p>
        )}
        {software.map((sw, i) => (
          <div key={i} className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2 p-3 bg-gray-50 rounded-lg border">
            <input name="software_name" placeholder="Name *" value={sw.software_name}
              onChange={e => handleSwChange(i, e)} required className={inputCls} />
            <input name="vendor" placeholder="Vendor" value={sw.vendor}
              onChange={e => handleSwChange(i, e)} className={inputCls} />
            <input name="version" placeholder="Version *" value={sw.version}
              onChange={e => handleSwChange(i, e)} required className={inputCls} />
            <div className="flex gap-2">
              <select name="software_type" value={sw.software_type}
                onChange={e => handleSwChange(i, e)} className={inputCls}>
                {["Application","Database","Web Server","OS","Security","Monitoring","Other"].map(t => (
                  <option key={t}>{t}</option>
                ))}
              </select>
              <button type="button" onClick={() => removeSoftwareRow(i)}
                className="text-red-500 hover:text-red-700 text-lg px-1">✕</button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-3 pt-2">
        <button type="submit" disabled={saving}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg text-sm font-semibold disabled:opacity-60">
          {saving ? "Saving..." : "Register Asset"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel}
            className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-6 py-2 rounded-lg text-sm">
            Cancel
          </button>
        )}
      </div>

      {message && (
        <p className={`text-sm font-medium ${message.startsWith("✅") ? "text-green-600" : "text-red-600"}`}>
          {message}
        </p>
      )}
    </form>
  );
}

