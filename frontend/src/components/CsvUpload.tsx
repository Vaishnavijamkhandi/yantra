import { useState } from "react";
import { importAssets } from "../services/api";

interface Props {
  onSuccess: () => void;
}

const SAMPLE_CSV_CONTENT = `hostname,device_type,ip,os,priority,network_exposure,business_unit,stage,software
substation-alpha-scada,IoT,192.168.10.15,Embedded Linux,Critical,Internal,Power Grid & Energy,Production,modbus-daemon;openssh-server
water-treatment-plc-01,IoT,192.168.20.10,Embedded Linux,Critical,Internal,Water Treatment Utilities,Production,modbus-daemon;busybox
telecom-5g-core-router,Router,203.0.113.1,Cisco IOS-XE,Critical,External,Telecommunications,Production,cisco-ios-xe;openssh-server
hospital-icu-monitoring,Computer,10.0.6.15,Windows 10 Enterprise,Critical,Internal,Healthcare Critical Care,Production,cerner-client;office-365
metro-signaling-gateway,Server,10.0.14.22,Red Hat Enterprise Linux 8,Critical,Internal,Transit & Rail Signaling,Production,nginx;openssh-server
smartcity-surveillance-hub,Server,10.0.30.50,Ubuntu 22.04 LTS,High,External,Smart City IoT Hub,Production,nginx;nodejs;docker
auth-gateway-prod,Server,10.0.1.15,Ubuntu 22.04 LTS,Critical,External,Identity & Security,Production,nginx;openssh-server
payments-api-cluster,Server,10.0.2.20,Red Hat Enterprise Linux 9,Critical,External,Fintech & Payments,Production,spring-boot;java-17
customer-core-db,Database,10.0.2.25,PostgreSQL 16,Critical,Internal,Core Banking,Production,postgresql
corporate-vpn-gateway,Router,203.0.113.5,OpenWRT,High,External,Remote Access,Production,openvpn
`;

export default function CsvUpload({ onSuccess }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  async function handleUpload() {
    if (!file) {
      setResult({ type: "error", text: "Please select a CSV file first." });
      return;
    }
    setUploading(true);
    setResult(null);
    try {
      const data = await importAssets(file);
      const text = `Successfully imported ${data.imported} asset(s).${
        data.failed > 0 ? ` Encountered ${data.failed} error(s):\n` + data.errors.join("\n") : ""
      }`;
      setResult({ type: data.failed > 0 && data.imported === 0 ? "error" : "success", text });
      setFile(null);
      onSuccess();
    } catch (err: unknown) {
      setResult({
        type: "error",
        text: err instanceof Error ? err.message : "Import failed. Please check CSV format.",
      });
    } finally {
      setUploading(false);
    }
  }

  function handleDownloadTemplate() {
    const blob = new Blob([SAMPLE_CSV_CONTENT], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "infrastructure_assets_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4 text-stone-900">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-mono font-bold text-[#800020] uppercase tracking-wider">
              Universal Infrastructure CSV Ingestion
            </h3>
            <button
              type="button"
              onClick={() => setShowGuide(!showGuide)}
              className="text-xs font-mono text-stone-600 hover:text-[#800020] underline cursor-pointer"
            >
              {showGuide ? "[Hide Specs]" : "[View Schema Specs]"}
            </button>
          </div>
          <p className="text-xs text-stone-500 mt-0.5">
            Ingest infrastructure inventories across Power Grids, Water Treatment, Telecom, Healthcare, and Smart City IoT.
          </p>
        </div>

        <button
          type="button"
          onClick={handleDownloadTemplate}
          className="self-start md:self-auto text-xs font-mono font-bold bg-[#faf7f2] hover:bg-[#ede5d8] text-[#800020] border border-[#d6ccbe] px-3.5 py-1.5 rounded-xl transition shadow-2xs flex items-center gap-2 cursor-pointer"
          title="Download sample infrastructure CSV template"
        >
          <span>📥 Sample CSV Template</span>
        </button>
      </div>

      {showGuide && (
        <div className="bg-[#faf7f2] border border-[#e5ded0] rounded-xl p-3.5 text-xs text-stone-700 font-mono space-y-2">
          <p className="font-bold text-[#800020]">Supported CSV Header Aliases (Case-insensitive):</p>
          <ul className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 text-[11px]">
            <li><strong className="text-stone-900">Hostname / Asset:</strong> hostname, name, host</li>
            <li><strong className="text-stone-900">IP Address:</strong> ip, ip_address, ipv4</li>
            <li><strong className="text-stone-900">Operating System:</strong> os, operating_system</li>
            <li><strong className="text-stone-900">Asset Type:</strong> type, asset_type, role</li>
            <li><strong className="text-stone-900">Sector / Dept:</strong> department, business_unit</li>
            <li><strong className="text-stone-900">Criticality:</strong> priority, criticality</li>
            <li><strong className="text-stone-900">Network Zone:</strong> exposure, network_exposure</li>
            <li><strong className="text-stone-900">Environment:</strong> environment, stage</li>
            <li><strong className="text-stone-900">Software:</strong> software, applications</li>
          </ul>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-1">
        <input
          type="file"
          accept=".csv"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-xs font-mono text-stone-700 file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border file:border-[#d6ccbe] file:bg-[#faf7f2] file:text-stone-800 hover:file:bg-[#ede5d8] cursor-pointer"
        />
        <button
          onClick={handleUpload}
          disabled={uploading || !file}
          className="bg-[#800020] hover:bg-[#66001a] text-white px-5 py-2 rounded-xl text-xs font-mono font-bold disabled:opacity-50 transition shadow-xs cursor-pointer whitespace-nowrap uppercase tracking-wider"
        >
          {uploading ? "Parsing CSV..." : "⚡ Upload & Ingest"}
        </button>
      </div>

      {result && (
        <div
          className={`p-3 rounded-xl text-xs font-mono font-medium whitespace-pre-line border ${
            result.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-red-50 border-red-200 text-red-800"
          }`}
        >
          {result.text}
        </div>
      )}
    </div>
  );
}
