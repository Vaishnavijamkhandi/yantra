import { useEffect, useState } from "react";
import {
  getAllAssetVulnerabilities,
  getLatestRisks,
  updateFindingStatus,
  assessAssetRisk,
  getActionPlanProfile,
} from "../services/api";
import type {
  AssetVulnerability,
  RiskAssessment,
  ActionPlanProfile,
} from "../types/asset";

const STATUS_CONFIG: Record<string, { bg: string; text: string; dot: string }> = {
  Open: { bg: "bg-[#800020]/10 border-[#800020]/30 text-[#800020]", text: "text-[#800020]", dot: "bg-[#800020]" },
  "In Progress": { bg: "bg-amber-50 border-amber-200 text-amber-800", text: "text-amber-700", dot: "bg-amber-500" },
  Resolved: { bg: "bg-emerald-50 border-emerald-200 text-emerald-800", text: "text-emerald-700", dot: "bg-emerald-500" },
  "Accepted Risk": { bg: "bg-stone-100 border-stone-200 text-stone-700", text: "text-stone-600", dot: "bg-stone-400" },
};

export default function Remediation() {
  const [findings, setFindings] = useState<AssetVulnerability[]>([]);
  const [risks, setRisks] = useState<RiskAssessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [search, setSearch] = useState<string>("");

  // Action Plan Modal
  const [activePlan, setActivePlan] = useState<{
    finding: AssetVulnerability;
    profile: ActionPlanProfile;
  } | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState<string>("");
  const [updatingStatus, setUpdatingStatus] = useState<boolean>(false);

  async function loadData() {
    setLoading(true);
    try {
      const [vData, rData] = await Promise.all([
        getAllAssetVulnerabilities({ limit: 150 }).catch(() => []),
        getLatestRisks().catch(() => []),
      ]);
      setFindings(vData);
      setRisks(rData);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleOpenActionPlan(finding: AssetVulnerability) {
    try {
      const profile = await getActionPlanProfile(
        finding.vulnerability.cve_id,
        finding.asset_id,
        finding.matched_software ?? undefined
      );
      setActivePlan({ finding, profile });
      setResolutionNotes(finding.resolution_notes || "");
    } catch (err: any) {
      setToast(`Failed to load Action Plan: ${err.message}`);
    }
  }

  async function handleStatusUpdate(
    newStatus: "Open" | "In Progress" | "Resolved" | "Accepted Risk"
  ) {
    if (!activePlan) return;
    setUpdatingStatus(true);
    try {
      await updateFindingStatus(
        activePlan.finding.id,
        newStatus,
        resolutionNotes.trim() || undefined,
        "Security Lead"
      );

      // Reassess affected asset risk if resolved
      let reassessNotice = "";
      if (newStatus === "Resolved") {
        try {
          const res = await assessAssetRisk(activePlan.finding.asset_id);
          reassessNotice = ` Asset #${activePlan.finding.asset_id} risk reassessed to ${res.risk_score.toFixed(1)}/100 (${res.risk_level}).`;
        } catch {
          // ignore reassess error
        }
      }

      setToast(
        `Finding ${activePlan.finding.vulnerability.cve_id} marked as "${newStatus}".${reassessNotice}`
      );
      setActivePlan(null);
      await loadData();
    } catch (err: any) {
      setToast(`Status update failed: ${err.message}`);
    } finally {
      setUpdatingStatus(false);
    }
  }

  const filteredFindings = findings.filter((f) => {
    const st = f.status || "Open";
    if (statusFilter !== "ALL" && st !== statusFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchCve = f.vulnerability?.cve_id.toLowerCase().includes(q);
      const matchDesc = f.vulnerability?.description.toLowerCase().includes(q);
      const matchSw = f.matched_software?.toLowerCase().includes(q);
      const matchAsset = f.asset?.asset_name?.toLowerCase().includes(q);
      if (!matchCve && !matchDesc && !matchSw && !matchAsset) return false;
    }
    return true;
  });

  const openCount = findings.filter((f) => (f.status || "Open") === "Open").length;
  const inProgressCount = findings.filter((f) => f.status === "In Progress").length;
  const resolvedCount = findings.filter((f) => f.status === "Resolved").length;
  const acceptedCount = findings.filter((f) => f.status === "Accepted Risk").length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8 text-stone-900">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-[#e5ded0]">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase bg-[#800020]/10 text-[#800020] border border-[#800020]/20 font-mono">
              Operational Hardening
            </span>
            <span className="text-stone-400 text-xs">/</span>
            <span className="text-xs font-semibold text-stone-600">Risk Triage &amp; Lifecycle Verification</span>
          </div>
          <h1 className="text-2xl font-black text-[#800020] tracking-tight flex items-center gap-2">
            Risk &amp; Remediation Console
          </h1>
          <p className="text-xs text-stone-600 mt-1 max-w-2xl">
            Triage prioritized vulnerabilities, inspect actionable vendor remediation playbooks, track status transitions with audit notes, and trigger genuine technical reassessments.
          </p>
        </div>
      </div>

      {toast && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold">✓</span>
            <span>{toast}</span>
          </div>
          <button onClick={() => setToast(null)} className="font-bold text-stone-500 hover:text-stone-900 cursor-pointer">
            ×
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="bg-white border border-[#e5ded0] rounded-2xl p-4 shadow-xs">
          <span className="text-[10px] font-bold text-[#800020] uppercase tracking-wider block">
            Open Threats
          </span>
          <span className="text-2xl font-black text-[#800020] mt-1 block font-mono">{openCount}</span>
          <span className="text-[11px] text-stone-500 mt-0.5 block">Requires active remediation</span>
        </div>

        <div className="bg-white border border-[#e5ded0] rounded-2xl p-4 shadow-xs">
          <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider block">
            In Progress
          </span>
          <span className="text-2xl font-black text-amber-700 mt-1 block font-mono">
            {inProgressCount}
          </span>
          <span className="text-[11px] text-stone-500 mt-0.5 block">Under patch or verification</span>
        </div>

        <div className="bg-white border border-[#e5ded0] rounded-2xl p-4 shadow-xs">
          <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">
            Resolved Findings
          </span>
          <span className="text-2xl font-black text-emerald-700 mt-1 block font-mono">
            {resolvedCount}
          </span>
          <span className="text-[11px] text-stone-500 mt-0.5 block">Excluded from active risk</span>
        </div>

        <div className="bg-white border border-[#e5ded0] rounded-2xl p-4 shadow-xs">
          <span className="text-[10px] font-bold text-stone-600 uppercase tracking-wider block">
            Accepted Risks
          </span>
          <span className="text-2xl font-black text-stone-800 mt-1 block font-mono">
            {acceptedCount}
          </span>
          <span className="text-[11px] text-stone-500 mt-0.5 block">Operational sign-off</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white border border-[#e5ded0] rounded-2xl p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 shadow-xs">
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="Search by CVE, asset, software name, or description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[#faf7f2] border border-[#d6ccbe] rounded-xl px-3.5 py-2 text-xs text-stone-900 placeholder-stone-400 focus:border-[#800020] focus:outline-none"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-2 text-stone-500 hover:text-stone-900 text-xs font-bold cursor-pointer"
            >
              ×
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-bold text-stone-600 mr-1">Status:</span>
          {["ALL", "Open", "In Progress", "Resolved", "Accepted Risk"].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                statusFilter === st
                  ? "bg-[#800020] text-white font-bold shadow-xs"
                  : "bg-[#faf7f2] border border-[#d6ccbe] text-stone-700 hover:bg-[#ede5d8]"
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Findings Table */}
      <div className="bg-white border border-[#e5ded0] rounded-2xl shadow-xs overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#e5ded0] bg-[#faf7f2] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-black text-stone-900 uppercase tracking-wide">
              Prioritized Vulnerabilities &amp; Remediation Queue
            </span>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-white border border-[#d6ccbe] text-stone-700 font-semibold">
              {filteredFindings.length} findings
            </span>
          </div>

          <span className="text-[11px] text-stone-500">
            Resolved items are mathematically omitted from blast radius &amp; asset risk scores.
          </span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-xs text-stone-500 font-mono animate-pulse">
            Loading vulnerability findings and threat intelligence records...
          </div>
        ) : filteredFindings.length === 0 ? (
          <div className="p-12 text-center text-xs text-stone-500 font-mono">
            No vulnerabilities found matching current filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#e5ded0] text-stone-500 uppercase text-[10px] tracking-wider font-mono bg-[#faf7f2]">
                  <th className="py-3 px-4">CVE Identifier</th>
                  <th className="py-3 px-4">Target Asset</th>
                  <th className="py-3 px-4">Impacted Component</th>
                  <th className="py-3 px-4">Severity</th>
                  <th className="py-3 px-4">Status &amp; Lifecycle</th>
                  <th className="py-3 px-4 text-right">Remediation Action</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-[#e5ded0] bg-white">
                {filteredFindings.map((f) => {
                  const st = f.status || "Open";
                  const cfg = STATUS_CONFIG[st] || STATUS_CONFIG.Open;
                  const sev = f.vulnerability?.severity?.toUpperCase() || "MEDIUM";

                  return (
                    <tr
                      key={`${f.asset_id}-${f.vulnerability_id}-${f.id}`}
                      className="hover:bg-[#faf7f2] transition group"
                    >
                      <td className="py-3.5 px-4 font-mono font-bold text-stone-900">
                        {f.vulnerability?.cve_id}
                        {f.vulnerability?.cvss_score && (
                          <span className="ml-2 text-[10px] text-stone-500 font-normal">
                            CVSS {f.vulnerability.cvss_score}
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-bold text-stone-900">
                          {f.asset?.asset_name || `Asset #${f.asset_id}`}
                        </div>
                        <div className="text-[10px] text-stone-500 font-mono">
                          {f.asset?.ip_address || "Internal IP"} • {f.asset?.criticality || "Medium"}
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-mono text-stone-800">
                          {f.matched_software || "System Core"}
                        </div>
                        {f.matched_version && (
                          <div className="text-[10px] text-stone-500 font-mono">
                            v{f.matched_version}
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider font-mono uppercase ${
                            sev === "CRITICAL"
                              ? "bg-[#800020]/10 text-[#800020] border border-[#800020]/30"
                              : sev === "HIGH"
                              ? "bg-red-50 text-red-700 border border-red-200"
                              : sev === "MEDIUM"
                              ? "bg-amber-50 text-amber-800 border border-amber-200"
                              : "bg-emerald-50 text-emerald-800 border border-emerald-200"
                          }`}
                        >
                          {sev}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${cfg.bg}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                          <span>{st}</span>
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <button
                          onClick={() => handleOpenActionPlan(f)}
                          className="px-3 py-1 rounded-lg text-xs font-bold text-white bg-[#800020] hover:bg-[#66001a] transition cursor-pointer shadow-xs"
                        >
                          Action Plan →
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Action Plan & Remediation Modal */}
      {activePlan && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border-2 border-[#d6ccbe] rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col text-xs text-stone-800">
            {/* Header */}
            <div className="p-5 border-b border-[#e5ded0] bg-[#faf7f2] flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono font-bold text-[#800020] text-sm">
                    {activePlan.profile.cve_id}
                  </span>
                  <span className="text-stone-400">•</span>
                  <span className="text-stone-900 font-bold">{activePlan.profile.asset_name}</span>
                </div>
                <h3 className="text-sm font-bold text-stone-700">
                  {activePlan.profile.remedy.title || "Targeted Vulnerability Remediation"}
                </h3>
              </div>
              <button
                onClick={() => setActivePlan(null)}
                className="text-stone-400 hover:text-stone-900 text-lg font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-5">
              {/* Technical Remedy Playbook */}
              <div className="bg-[#faf7f2] border border-[#d6ccbe] rounded-xl p-4 space-y-3">
                <div className="font-bold text-[#800020] text-xs flex items-center gap-1.5">
                  <span>🛠</span>
                  <span>Vendor Patch Command &amp; Workaround</span>
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] text-stone-500 uppercase font-bold block">
                    Recommended CLI Command:
                  </span>
                  <pre className="bg-[#f5f0e6] p-2.5 rounded-lg font-mono text-[11px] text-[#800020] overflow-x-auto border border-[#d6ccbe]">
                    {activePlan.profile.remedy.patch_command}
                  </pre>
                </div>

                {activePlan.profile.remedy.workaround && (
                  <div className="space-y-1">
                    <span className="text-[10px] text-stone-500 uppercase font-bold block">
                      Defensive Workaround:
                    </span>
                    <p className="text-stone-700 text-[11px] bg-white p-2 rounded-lg border border-[#d6ccbe]">
                      {activePlan.profile.remedy.workaround}
                    </p>
                  </div>
                )}

                {activePlan.profile.remedy.firewall_rule && (
                  <div className="space-y-1">
                    <span className="text-[10px] text-stone-500 uppercase font-bold block">
                      Firewall Isolation Rule:
                    </span>
                    <p className="text-stone-700 text-[11px] bg-white p-2 rounded-lg border border-[#d6ccbe] font-mono">
                      {activePlan.profile.remedy.firewall_rule}
                    </p>
                  </div>
                )}
              </div>

              {/* Status Transition & Resolution Notes */}
              <div className="bg-[#faf7f2] border border-[#d6ccbe] rounded-xl p-4 space-y-3">
                <div className="font-bold text-stone-900 text-xs flex items-center justify-between">
                  <span>Lifecycle Status &amp; Reassessment Verification</span>
                  <span className="text-stone-600 text-[11px]">
                    Current: <b>{activePlan.finding.status || "Open"}</b>
                  </span>
                </div>

                <div>
                  <label className="block text-[10px] text-stone-500 uppercase font-bold mb-1">
                    Resolution / Acceptance Notes:
                  </label>
                  <textarea
                    rows={2}
                    value={resolutionNotes}
                    onChange={(e) => setResolutionNotes(e.target.value)}
                    placeholder="Document patch version applied, configuration verification, or risk acceptance justification..."
                    className="w-full bg-white border border-[#d6ccbe] rounded-lg p-2.5 text-xs text-stone-900 placeholder-stone-400 focus:border-[#800020] focus:outline-none"
                  />
                </div>

                <div className="pt-2 border-t border-[#e5ded0] flex flex-wrap items-center gap-2">
                  <span className="text-[10px] text-stone-500 font-bold uppercase mr-1">
                    Transition To:
                  </span>
                  {(["Open", "In Progress", "Resolved", "Accepted Risk"] as const).map((st) => (
                    <button
                      key={st}
                      disabled={updatingStatus}
                      onClick={() => handleStatusUpdate(st)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition border cursor-pointer ${
                        activePlan.finding.status === st
                          ? "bg-[#800020] text-white border-[#800020]"
                          : "bg-white border-[#d6ccbe] text-stone-700 hover:bg-[#ede5d8]"
                      }`}
                    >
                      {st === "Resolved" ? "✓ Mark Resolved & Reassess" : st}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-[#e5ded0] bg-[#faf7f2] flex items-center justify-between">
              <span className="text-[11px] text-stone-500">
                Resolving triggers automated risk score recalculation.
              </span>
              <button
                onClick={() => setActivePlan(null)}
                className="px-4 py-1.5 rounded-lg bg-stone-200 hover:bg-stone-300 text-stone-800 font-bold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
