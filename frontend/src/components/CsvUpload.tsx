import { useState } from "react";
import {
  validateCsv,
  importValidatedAssets,
  runAssessment,
  runGapAnalysis,
  assessAllRisks,
} from "../services/api";
import type { CsvValidationReport, AssetCreate } from "../types/asset";

interface Props {
  onSuccess: (newDatasetName?: string) => void;
}

const SAMPLE_CSV = `hostname,device_type,ip,os,priority,network_exposure,business_unit,stage,software
substation-alpha-scada,IoT,192.168.10.15,Embedded Linux,Critical,Internal,Power Grid & Energy,Production,modbus-daemon;openssh-server
water-treatment-plc-01,IoT,192.168.20.10,Embedded Linux,Critical,Internal,Water Treatment Utilities,Production,modbus-daemon;busybox
telecom-5g-core-router,Router,203.0.113.1,Cisco IOS-XE,Critical,External,Telecommunications,Production,cisco-ios-xe;openssh-server
hospital-icu-monitoring,Computer,10.0.6.15,Windows 10 Enterprise,Critical,Internal,Healthcare Critical Care,Production,cerner-client;office-365
metro-signaling-gateway,Server,10.0.14.22,Red Hat Enterprise Linux 8,Critical,Internal,Transit & Rail Signaling,Production,nginx;openssh-server
smartcity-surveillance-hub,Server,10.0.30.50,Ubuntu 22.04 LTS,High,External,Smart City IoT Hub,Production,nginx;nodejs;docker
`;

export default function CsvUpload({ onSuccess }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [validating, setValidating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [report, setReport] = useState<CsvValidationReport | null>(null);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [resultMessage, setResultMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function handleValidate() {
    if (!file) return;
    setValidating(true);
    setResultMessage(null);
    setReport(null);

    try {
      const rep = await validateCsv(file);
      setReport(rep);
      // Auto-select valid rows by default
      const valids = new Set<number>();
      rep.rows.forEach((r) => {
        if (r.is_valid) valids.add(r.row_index);
      });
      setSelectedIndices(valids);
    } catch (err: any) {
      setResultMessage({ type: "error", text: err.message || "CSV validation failed." });
    } finally {
      setValidating(false);
    }
  }

  function toggleRow(idx: number) {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  }

  async function handleCommitImport() {
    if (!report || !file) return;
    setImporting(true);
    setResultMessage(null);

    const datasetLabel = file.name || "Uploaded Fleet";

    const rowsToImport: AssetCreate[] = report.rows
      .filter((r) => selectedIndices.has(r.row_index))
      .map((r) => ({
        asset_name: r.asset_name,
        asset_type: r.asset_type,
        ip_address: r.ip_address || undefined,
        operating_system: r.operating_system || undefined,
        criticality: r.criticality,
        exposure: r.exposure,
        department: r.department || undefined,
        environment: datasetLabel, // Tag with dataset name
        software: r.software.map((s) => ({
          software_name: s,
          version: r.software_version || "1.0",
          software_type: "Application",
        })),
      }));

    try {
      setResultMessage({
        type: "success",
        text: `Ingesting ${rowsToImport.length} verified asset(s)...`,
      });
      const res = await importValidatedAssets(rowsToImport);

      // Automatically run vulnerability assessment, gap analysis, and fleet risk
      try {
        await Promise.allSettled([
          runAssessment(),
          runGapAnalysis(),
          assessAllRisks(),
        ]);
      } catch (pipelineErr) {
        console.warn("Auto-pipeline completed with warnings:", pipelineErr);
      }

      setResultMessage({
        type: "success",
        text: `✓ Committed ${res.imported} asset(s) to dataset "${datasetLabel}". Automatically executed Vulnerability Assessment & Infrastructure Gap Analysis!`,
      });

      // Save dataset name to local history
      try {
        const stored = JSON.parse(localStorage.getItem("cybersentra_datasets") || "[]");
        if (!stored.includes(datasetLabel)) {
          stored.push(datasetLabel);
          localStorage.setItem("cybersentra_datasets", JSON.stringify(stored));
        }
      } catch {
        // ignore
      }

      setReport(null);
      setFile(null);
      onSuccess(datasetLabel);
    } catch (err: any) {
      setResultMessage({ type: "error", text: err.message || "Failed to commit validated assets." });
    } finally {
      setImporting(false);
    }
  }

  function downloadSample() {
    const blob = new Blob([SAMPLE_CSV], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cybersentra_infrastructure_sample.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="bg-white border border-[#e5ded0] rounded-2xl p-6 text-xs text-stone-800 shadow-xs space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#e5ded0] pb-4">
        <div>
          <h2 className="text-sm font-bold text-[#800020] flex items-center gap-2">
            <span>📥</span>
            <span>Enterprise Infrastructure Asset Ingestion</span>
          </h2>
          <p className="text-[11px] text-stone-600 mt-0.5">
            Universal column mapping with pre-import row validation, duplicate detection, and invalid-row exclusion.
          </p>
        </div>

        <button
          onClick={downloadSample}
          className="text-[#800020] hover:underline font-mono text-[11px] flex items-center gap-1 shrink-0 font-bold cursor-pointer"
        >
          <span>⬇ Download Sample CSV</span>
        </button>
      </div>

      {resultMessage && (
        <div
          className={`p-3 rounded-xl border flex items-center justify-between ${
            resultMessage.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800 font-medium"
              : "bg-red-50 border-red-200 text-red-700 font-medium"
          }`}
        >
          <span>{resultMessage.text}</span>
          <button onClick={() => setResultMessage(null)} className="font-bold ml-2 cursor-pointer">
            ×
          </button>
        </div>
      )}

      {/* Step 1: File Selection & Validation Action */}
      {!report && (
        <div className="space-y-4">
          <div className="border-2 border-dashed border-[#d6ccbe] hover:border-[#800020] rounded-xl p-6 text-center transition bg-[#faf7f2]">
            <input
              type="file"
              accept=".csv"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setFile(f);
                  setResultMessage(null);
                }
              }}
              className="hidden"
              id="csv-file-input"
            />
            <label htmlFor="csv-file-input" className="cursor-pointer block space-y-2">
              <div className="text-3xl text-stone-400">📄</div>
              <div className="font-bold text-stone-900">
                {file ? file.name : "Click to select or drag CSV inventory here"}
              </div>
              <div className="text-[11px] text-stone-500">
                {file
                  ? `${(file.size / 1024).toFixed(1)} KB ready for schema analysis`
                  : "Supports comma-delimited files with headers: hostname, ip_address, asset_type, criticality..."}
              </div>
            </label>
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleValidate}
              disabled={!file || validating}
              className={`px-5 py-2.5 rounded-xl font-bold transition flex items-center gap-2 cursor-pointer ${
                !file || validating
                  ? "bg-stone-200 text-stone-400 cursor-not-allowed"
                  : "bg-[#800020] hover:bg-[#66001a] text-white shadow-xs"
              }`}
            >
              {validating ? (
                <>
                  <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  <span>Validating CSV Rows...</span>
                </>
              ) : (
                <span>Validate &amp; Preview Rows →</span>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Interactive Validation Preview Table */}
      {report && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#faf7f2] border border-[#d6ccbe] p-3.5 rounded-xl">
            <div className="flex items-center gap-3">
              <span className="font-bold text-stone-900">{file?.name}</span>
              <span className="text-stone-400">|</span>
              <span className="text-stone-600">{report.total_rows} total rows detected</span>
            </div>

            <div className="flex items-center gap-2 font-mono text-[11px]">
              <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">
                ✓ {report.valid_rows_count} Valid
              </span>
              {report.invalid_rows_count > 0 && (
                <span className="px-2 py-0.5 rounded bg-red-50 text-red-700 border border-red-200 font-bold">
                  ✕ {report.invalid_rows_count} Syntax Errors
                </span>
              )}
              {report.duplicate_count > 0 && (
                <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 font-bold">
                  ⚠ {report.duplicate_count} Duplicate IPs
                </span>
              )}
            </div>
          </div>

          {/* Row Checklist Table */}
          <div className="border border-[#e5ded0] rounded-xl overflow-hidden max-h-80 overflow-y-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-[#faf7f2] text-stone-600 font-mono text-[10px] uppercase sticky top-0 border-b border-[#e5ded0]">
                <tr>
                  <th className="p-2.5 text-center w-10">Select</th>
                  <th className="p-2.5">Row</th>
                  <th className="p-2.5">Hostname / IP</th>
                  <th className="p-2.5">Asset Type</th>
                  <th className="p-2.5">Criticality / Exposure</th>
                  <th className="p-2.5">Software</th>
                  <th className="p-2.5">Verification Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e5ded0] bg-white">
                {report.rows.map((r) => {
                  const isChecked = selectedIndices.has(r.row_index);
                  return (
                    <tr
                      key={r.row_index}
                      className={`transition ${
                        !r.is_valid
                          ? "bg-red-50/50"
                          : isChecked
                          ? "bg-emerald-50/30"
                          : "hover:bg-[#faf7f2]"
                      }`}
                    >
                      <td className="p-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleRow(r.row_index)}
                          className="rounded border-[#d6ccbe] text-[#800020] focus:ring-[#800020] cursor-pointer"
                        />
                      </td>
                      <td className="p-2.5 font-mono text-stone-500">#{r.row_index}</td>
                      <td className="p-2.5">
                        <div className="font-bold text-stone-900">{r.asset_name || "MISSING"}</div>
                        <div className="text-[10px] text-stone-500 font-mono">{r.ip_address || "No IP"}</div>
                      </td>
                      <td className="p-2.5 text-stone-700">{r.asset_type}</td>
                      <td className="p-2.5">
                        <span className="font-bold text-stone-900">{r.criticality}</span>
                        <span className="text-stone-400 text-[10px]"> / </span>
                        <span className="text-stone-600 text-[10px]">{r.exposure}</span>
                      </td>
                      <td className="p-2.5 text-stone-600">
                        {r.software.length > 0 ? r.software.join(", ") : "None specified"}
                      </td>
                      <td className="p-2.5">
                        {r.is_valid ? (
                          <span className="text-emerald-700 font-bold flex items-center gap-1">
                            ✓ Ready to Import
                          </span>
                        ) : (
                          <div className="text-red-700 space-y-0.5">
                            {r.errors.map((e, i) => (
                              <div key={i} className="text-[10px]">
                                • {e}
                              </div>
                            ))}
                          </div>
                        )}
                        {r.warnings.length > 0 && (
                          <div className="text-amber-800 space-y-0.5 mt-0.5">
                            {r.warnings.map((w, i) => (
                              <div key={i} className="text-[10px]">
                                ⚠ {w}
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between pt-2">
            <button
              onClick={() => {
                setReport(null);
                setFile(null);
              }}
              className="text-stone-600 hover:text-stone-900 text-xs font-semibold cursor-pointer"
            >
              ← Cancel &amp; Choose Different File
            </button>

            <button
              onClick={handleCommitImport}
              disabled={importing || selectedIndices.size === 0}
              className={`px-5 py-2.5 rounded-xl font-bold transition flex items-center gap-2 cursor-pointer ${
                importing || selectedIndices.size === 0
                  ? "bg-stone-200 text-stone-400 cursor-not-allowed"
                  : "bg-[#800020] hover:bg-[#66001a] text-white shadow-xs"
              }`}
            >
              {importing ? (
                <>
                  <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  <span>Ingesting to Database...</span>
                </>
              ) : (
                <span>Commit {selectedIndices.size} Selected Asset(s) to Database →</span>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
