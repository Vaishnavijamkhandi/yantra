import { useState } from "react";
import { importAssets } from "../services/api";

interface Props {
  onSuccess: () => void;
}

const SAMPLE_CSV_CONTENT = `hostname,device_type,ip,os,priority,network_exposure,business_unit,stage,software
auth-gateway-prod,Server,10.0.1.15,Ubuntu 22.04 LTS,Critical,External,Identity & Security,Production,nginx;openssh-server
payments-api-cluster,Server,10.0.2.20,Red Hat Enterprise Linux 9,Critical,External,Fintech & Payments,Production,spring-boot;java-17
customer-core-db,Database,10.0.2.25,PostgreSQL 16,Critical,Internal,Core Banking,Production,postgresql
order-processing-svc,Server,10.0.3.10,Debian 12,High,Internal,E-Commerce & Orders,Production,nginx;nodejs
perimeter-edge-firewall,Firewall,203.0.113.1,Cisco ASA,Critical,External,Infrastructure,Production,cisco-ios-xe
corporate-vpn-gateway,Router,203.0.113.5,OpenWRT,High,External,Remote Access,Production,openvpn
analytics-data-warehouse,Database,10.0.4.50,Ubuntu 22.04,Medium,Internal,Data Intelligence,Production,clickhouse
finance-ledger-workstation,Computer,10.0.5.101,Windows 11 Enterprise,High,Internal,Finance & Audit,Production,office-365
factory-scada-controller,IoT,192.168.10.12,Embedded Linux,Critical,Internal,Manufacturing Operations,Production,modbus-daemon
dev-testing-sandbox,Server,10.0.9.99,Ubuntu 20.04,Low,Internal,Engineering R&D,Development,docker
ehr-clinical-workstation,Computer,10.0.6.15,Windows 10 Enterprise,High,Internal,Healthcare Clinical,Production,cerner-client
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
    link.setAttribute("download", "enterprise_assets_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
              Universal CSV Asset Import
            </h3>
            <button
              type="button"
              onClick={() => setShowGuide(!showGuide)}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold hover:underline cursor-pointer"
            >
              {showGuide ? "Hide Column Specs" : "View Supported Columns"}
            </button>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Accepts infrastructure CSVs from any industry (Fintech, Tech, Healthcare, Retail, Manufacturing).
          </p>
        </div>

        <button
          type="button"
          onClick={handleDownloadTemplate}
          className="self-start md:self-auto text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium px-3 py-1.5 rounded-md border border-slate-300 transition-colors cursor-pointer flex items-center gap-1.5"
          title="Download pre-formatted universal enterprise CSV template"
        >
          <span>Download Sample CSV Template</span>
        </button>
      </div>

      {showGuide && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-600 space-y-1">
          <p className="font-semibold text-slate-700">Supported CSV Header Aliases (Case-insensitive):</p>
          <ul className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-1 list-disc list-inside">
            <li><strong className="text-slate-800">Hostname / Name:</strong> hostname, name, device_name, host</li>
            <li><strong className="text-slate-800">IP Address:</strong> ip, ip_address, address, ipv4</li>
            <li><strong className="text-slate-800">Operating System:</strong> os, operating_system, platform</li>
            <li><strong className="text-slate-800">Asset Type:</strong> type, asset_type, device_type, role</li>
            <li><strong className="text-slate-800">Department / Unit:</strong> department, business_unit, dept, team</li>
            <li><strong className="text-slate-800">Criticality:</strong> priority, criticality, tier, severity</li>
            <li><strong className="text-slate-800">Network Exposure:</strong> exposure, network_exposure, zone</li>
            <li><strong className="text-slate-800">Lifecycle Stage:</strong> environment, stage, env</li>
            <li><strong className="text-slate-800">Software Packages:</strong> software, packages, applications</li>
          </ul>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-1">
        <input
          type="file"
          accept=".csv"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 cursor-pointer"
        />
        <button
          onClick={handleUpload}
          disabled={uploading || !file}
          className="bg-indigo-700 hover:bg-indigo-800 text-white px-4 py-1.5 rounded-md text-xs font-semibold disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
        >
          {uploading ? "Importing Assets..." : "Upload & Parse CSV"}
        </button>
      </div>

      {result && (
        <div
          className={`p-3 rounded-lg text-xs font-medium whitespace-pre-line border ${
            result.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-rose-50 border-rose-200 text-rose-800"
          }`}
        >
          {result.text}
        </div>
      )}
    </div>
  );
}
