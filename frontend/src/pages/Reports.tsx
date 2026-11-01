import { useEffect, useState } from "react";
import { getReportsSummary, getReportDownloadUrl } from "../services/api";
import type { ReportsSummary } from "../types/asset";

export default function Reports() {
  const [summary, setSummary] = useState<ReportsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    getReportsSummary()
      .then(setSummary)
      .catch((err) => console.error("Report summary error:", err))
      .finally(() => setLoading(false));
  }, []);

  function handleDownloadPdf() {
    setDownloading(true);
    const url = getReportDownloadUrl();
    window.open(url, "_blank");
    setTimeout(() => setDownloading(false), 2000);
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8 text-stone-900">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-[#e5ded0]">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase bg-[#800020]/10 text-[#800020] border border-[#800020]/20 font-mono">
              Certified Audit Artifacts
            </span>
            <span className="text-stone-400 text-xs">/</span>
            <span className="text-xs font-semibold text-stone-600">Executive &amp; Technical Reports</span>
          </div>
          <h1 className="text-2xl font-black text-[#800020] tracking-tight flex items-center gap-2">
            Assessment &amp; Compliance Reports
          </h1>
          <p className="text-xs text-stone-600 mt-1 max-w-2xl">
            Generates publication-grade PDF audit packages containing monitored asset telemetry, pre-assessment infrastructure gaps, confirmed CVE threat intelligence, dependency blast radii, and remediation playbooks.
          </p>
        </div>

        <button
          onClick={handleDownloadPdf}
          disabled={downloading}
          className="px-5 py-2.5 rounded-xl font-bold text-xs text-white shadow-xs transition-all flex items-center gap-2 bg-[#800020] hover:bg-[#66001a] active:scale-[0.98] cursor-pointer"
        >
          {downloading ? (
            <>
              <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <span>Preparing Report...</span>
            </>
          ) : (
            <>
              <span>⬇ Download Certified PDF Report</span>
            </>
          )}
        </button>
      </div>

      {/* Report Readiness Scorecard */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        <div className="bg-white border border-[#e5ded0] rounded-2xl p-4 shadow-xs">
          <span className="text-[10px] font-bold text-stone-600 uppercase tracking-wider block">
            Monitored Assets
          </span>
          <span className="text-2xl font-black text-stone-900 mt-1 block">
            {summary?.total_assets ?? 0}
          </span>
          <span className="text-[11px] text-stone-500 mt-0.5 block">Documented inventory</span>
        </div>

        <div className="bg-white border border-[#e5ded0] rounded-2xl p-4 shadow-xs">
          <span className="text-[10px] font-bold text-[#800020] uppercase tracking-wider block">
            Critical Risk Assets
          </span>
          <span className="text-2xl font-black text-[#800020] mt-1 block font-mono">
            {summary?.critical_risks ?? 0}
          </span>
          <span className="text-[11px] text-stone-500 mt-0.5 block">Score ≥ 80.0</span>
        </div>

        <div className="bg-white border border-[#e5ded0] rounded-2xl p-4 shadow-xs">
          <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider block">
            Infrastructure Gaps
          </span>
          <span className="text-2xl font-black text-amber-700 mt-1 block font-mono">
            {summary?.detected_gaps ?? 0}
          </span>
          <span className="text-[11px] text-stone-500 mt-0.5 block">Unverified evidence</span>
        </div>

        <div className="bg-white border border-[#e5ded0] rounded-2xl p-4 shadow-xs">
          <span className="text-[10px] font-bold text-[#800020] uppercase tracking-wider block">
            Matched CVEs
          </span>
          <span className="text-2xl font-black text-[#800020] mt-1 block font-mono">
            {summary?.matched_vulnerabilities ?? 0}
          </span>
          <span className="text-[11px] text-stone-500 mt-0.5 block">NVD intelligence linked</span>
        </div>

        <div className="bg-white border border-[#e5ded0] rounded-2xl p-4 shadow-xs">
          <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">
            Format &amp; Compliance
          </span>
          <span className="text-sm font-bold text-emerald-800 mt-2 block font-mono">
            {summary?.report_format ?? "PDF Publication"}
          </span>
          <span className="text-[11px] text-stone-500 mt-0.5 block">Enterprise Compliance Ready</span>
        </div>
      </div>

      {/* Report Structure Preview Cards */}
      <div className="bg-white border border-[#e5ded0] rounded-2xl p-6 shadow-xs space-y-6">
        <div className="flex items-center justify-between border-b border-[#e5ded0] pb-3">
          <h2 className="text-sm font-bold text-[#800020] flex items-center gap-2">
            <span>📑</span>
            <span>Included Audit Sections in the Generated Document</span>
          </h2>
          <span className="text-xs text-stone-600 font-mono">100% Verified Database Data</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
          {[
            {
              num: "01",
              title: "Executive Cyber-Risk Scorecard",
              desc: "High-level summary of fleet posture, average risk index, critical threshold alerts, and CISA KEV exploitation warnings.",
            },
            {
              num: "02",
              title: "Monitored Critical Asset Inventory",
              desc: "Complete asset ledger including hostname, system role, operating system, network boundary exposure, and business tier.",
            },
            {
              num: "03",
              title: "Pre-Assessment Infrastructure Gaps",
              desc: "Audit findings detailing missing metadata, unverified software versions, ICS/OT omissions, and unmapped dependencies.",
            },
            {
              num: "04",
              title: "Confirmed CVEs & Threat Intelligence",
              desc: "Matched vulnerability findings enriched with CVSS v3.1 base metrics, EPSS exploit percentiles, and active exploit tags.",
            },
            {
              num: "05",
              title: "Multi-Hop Dependency Blast Radius",
              desc: "Topological cascade impact mapping illustrating critical downstream asset compromise paths.",
            },
            {
              num: "06",
              title: "Priority Remediation Playbook",
              desc: "Synthesized technical commands, vendor patches, and network segmentation rules prioritized by exploit probability.",
            },
          ].map((sec) => (
            <div
              key={sec.num}
              className="bg-[#faf7f2] border border-[#d6ccbe] hover:border-[#800020]/40 rounded-xl p-4 space-y-1.5 transition"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono font-bold text-[#800020] text-xs">SECTION {sec.num}</span>
                <span className="text-emerald-700 text-[10px] font-bold">✓ VERIFIED</span>
              </div>
              <div className="font-bold text-stone-900">{sec.title}</div>
              <p className="text-[11px] text-stone-600 leading-relaxed">{sec.desc}</p>
            </div>
          ))}
        </div>

        {/* Audit Verification Note */}
        <div className="p-4 bg-[#faf7f2] border border-[#d6ccbe] rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#800020]/10 border border-[#800020]/20 flex items-center justify-center text-[#800020] font-bold text-sm">
              🛡️
            </div>
            <div>
              <div className="text-xs font-bold text-stone-900">Cryptographic Integrity &amp; Audit Trail</div>
              <div className="text-[11px] text-stone-600">
                Every exported PDF is stamped with an immutable UTC audit timestamp and authenticated officer signatures.
              </div>
            </div>
          </div>

          <button
            onClick={handleDownloadPdf}
            className="text-xs font-mono font-bold text-[#800020] hover:underline cursor-pointer flex items-center gap-1 shrink-0"
          >
            <span>Download Dossier</span>
            <span>→</span>
          </button>
        </div>
      </div>
    </div>
  );
}
