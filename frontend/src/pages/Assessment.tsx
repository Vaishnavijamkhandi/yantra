import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  getAssessmentResults,
  getAssessmentSummary,
  runAssessment,
  getActionPlan,
  resolveFinding,
  } from "../services/api";
import type {
  AssetVulnerability,
  AssessmentDashboardSummary,
  ActionPlanProfile,
} from "../types/asset";

const SEVERITY_BADGES: Record<string, string> = {
  CRITICAL: "bg-[#800020]/10 text-[#800020] border-[#800020]/30",
  HIGH: "bg-red-50 text-red-700 border-red-200",
  MEDIUM: "bg-amber-50 text-amber-800 border-amber-200",
  LOW: "bg-emerald-50 text-emerald-800 border-emerald-200",
};

export default function Assessment() {
  const [results, setResults] = useState<AssetVulnerability[]>([]);
  const [summary, setSummary] = useState<AssessmentDashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const [filterSeverity, setFilterSeverity] = useState("");

  // Modal State for Action Plan (Remedy, Threat, Consequences)
  const [activeFinding, setActiveFinding] = useState<AssetVulnerability | null>(null);
  const [actionPlan, setActionPlan] = useState<ActionPlanProfile | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [activeTab, setActiveTab] = useState<"remedy" | "threat" | "consequences">("remedy");
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [actionSuccessMsg, setActionSuccessMsg] = useState("");

  async function loadData() {
    try {
      setLoading(true);
      const [resList, sum] = await Promise.all([
        getAssessmentResults({ severity: filterSeverity || undefined, limit: 300 }),
        getAssessmentSummary(),
      ]);
      setResults(resList);
      setSummary(sum);
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "Failed to load assessment data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [filterSeverity]);

  async function handleRunAssessment() {
    try {
      setRunning(true);
      setMessage("Running vulnerability matching engine across all enterprise assets...");
      const summaryResult = await runAssessment();
      setMessage(
        `✅ Assessment completed! Scanned ${summaryResult.assets_assessed} assets. Identified ${summaryResult.total_matches} vulnerability matches.`
      );
      await loadData();
    } catch (err: unknown) {
      setMessage(`❌ ${err instanceof Error ? err.message : "Assessment run failed"}`);
    } finally {
      setRunning(false);
    }
  }

  async function handleOpenActionPlan(finding: AssetVulnerability) {
    setActiveFinding(finding);
    setActionPlan(null);
    setLoadingPlan(true);
    setActiveTab("remedy");
    setActionSuccessMsg("");
    setCopiedCmd(false);

    try {
      const plan = await getActionPlan(
        finding.vulnerability.cve_id,
        finding.asset_id,
        finding.matched_software ?? undefined
      );
      setActionPlan(plan);
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "Failed to load action plan");
    } finally {
      setLoadingPlan(false);
    }
  }

  async function handleResolveFinding(findingId: number) {
    if (!window.confirm("Confirm that this patch/mitigation has been applied to the asset?")) return;
    try {
      const res = await resolveFinding(findingId);
      setActionSuccessMsg(`✅ ${res.message}`);
      setMessage(`Vulnerability resolved for Asset #${res.asset_id}.`);
      setActiveFinding(null);
      await loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to resolve finding");
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 2000);
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 text-stone-900">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[#e5ded0]">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black text-[#800020] tracking-tight">
              Vulnerability Assessment &amp; Actions
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold uppercase bg-[#800020]/10 text-[#800020] border border-[#800020]/20">
              Matching Engine
            </span>
          </div>
          <p className="text-stone-600 text-xs mt-1">
            Automated software signature matching, exploit intelligence, and operational mitigation playbooks.
          </p>
        </div>
        <button
          onClick={handleRunAssessment}
          disabled={running}
          className="bg-[#800020] hover:bg-[#66001a] text-white text-xs font-mono font-bold px-5 py-2.5 rounded-xl disabled:opacity-50 transition flex items-center gap-2 cursor-pointer uppercase shadow-xs"
        >
          {running ? "Scanning Assets..." : "⚡ Run Vulnerability Assessment"}
        </button>
      </div>

      {/* Message Banner */}
      {message && (
        <div
          className={`p-3.5 rounded-xl text-xs font-mono border font-medium ${
            message.startsWith("✅")
              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
              : message.startsWith("❌")
              ? "bg-red-50 text-red-800 border-red-200"
              : "bg-white text-stone-800 border-[#e5ded0]"
          }`}
        >
          {message}
        </div>
      )}

      {/* Summary Stat Cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-[#e5ded0] shadow-xs">
            <span className="text-[11px] font-mono font-semibold text-stone-500 uppercase">Total Findings</span>
            <p className="text-3xl font-black text-stone-900 font-mono mt-1">
              {summary.total_asset_vulnerability_links}
            </p>
            <span className="text-xs text-stone-500">Active CVE matches</span>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-[#e5ded0] shadow-xs">
            <span className="text-[11px] font-mono font-semibold text-[#800020] uppercase">Affected Assets</span>
            <p className="text-3xl font-black text-[#800020] font-mono mt-1">{summary.assets_affected}</p>
            <span className="text-xs text-stone-500">Require remediation</span>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-[#e5ded0] shadow-xs">
            <span className="text-[11px] font-mono font-semibold text-red-700 uppercase">Critical CVEs</span>
            <p className="text-3xl font-black text-red-700 font-mono mt-1">
              {summary.by_severity["CRITICAL"] || 0}
            </p>
            <span className="text-xs text-stone-500">CVSS 9.0 - 10.0</span>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-[#e5ded0] shadow-xs">
            <span className="text-[11px] font-mono font-semibold text-stone-500 uppercase">High CVEs</span>
            <p className="text-3xl font-black text-stone-900 font-mono mt-1">
              {summary.by_severity["HIGH"] || 0}
            </p>
            <span className="text-xs text-stone-500">CVSS 7.0 - 8.9</span>
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-[#e5ded0] shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono font-bold text-stone-600 uppercase">
            Filter Severity:
          </span>
          <select
            value={filterSeverity}
            onChange={(e) => setFilterSeverity(e.target.value)}
            className="bg-[#faf7f2] border border-[#d6ccbe] rounded-lg px-3 py-1.5 text-xs text-stone-800 focus:outline-none focus:border-[#800020] font-mono"
          >
            <option value="">All Severities</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </div>
        <span className="text-xs font-mono text-stone-500">
          Showing <span className="text-[#800020] font-bold">{results.length}</span> finding(s)
        </span>
      </div>

      {/* Findings & Actions Table */}
      <div className="bg-white rounded-2xl border border-[#e5ded0] shadow-xs overflow-x-auto">
        {loading ? (
          <div className="p-12 text-center text-stone-500 font-mono text-xs">Loading findings...</div>
        ) : results.length === 0 ? (
          <div className="p-12 text-center text-stone-500 space-y-2 font-mono text-xs">
            <p className="text-sm font-semibold">No vulnerability matches found.</p>
            <p className="text-stone-400">
              Run the Vulnerability Assessment above to evaluate inventory against current CVE definitions.
            </p>
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="bg-[#f5f0e6] text-stone-600 font-mono uppercase tracking-wider border-b border-[#e5ded0]">
              <tr>
                <th className="px-4 py-3">Asset</th>
                <th className="px-4 py-3">Matched Software</th>
                <th className="px-4 py-3">CVE ID</th>
                <th className="px-4 py-3">Severity</th>
                <th className="px-4 py-3">CVSS</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0eae0] font-mono">
              {results.map((r) => {
                const sev = r.vulnerability.severity?.toUpperCase() || "UNKNOWN";
                return (
                  <tr key={r.id} className="hover:bg-[#faf6f0] transition-colors border-b border-[#f0eae0]">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Link
                        to={`/assets/${r.asset_id}`}
                        className="text-[#800020] hover:underline font-bold"
                      >
                        Asset #{r.asset_id}
                      </Link>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-semibold text-stone-800">
                        {r.matched_software || "System"}
                      </span>
                      {r.matched_version && (
                        <span className="text-[11px] text-stone-500 block">v{r.matched_version}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-bold text-[#800020] whitespace-nowrap">
                      {r.vulnerability.cve_id}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`text-xs px-2.5 py-0.5 rounded-md font-bold border ${
                          SEVERITY_BADGES[sev] ?? "bg-[#f5f0e6] text-stone-700 border-[#d6ccbe]"
                        }`}
                      >
                        {sev}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-bold">
                      {r.vulnerability.cvss_score !== null && r.vulnerability.cvss_score !== undefined ? (
                        <span className={r.vulnerability.cvss_score >= 8 ? "text-[#800020]" : "text-amber-700"}>
                          {r.vulnerability.cvss_score.toFixed(1)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-stone-600 max-w-xs line-clamp-2 font-sans text-xs">
                      {r.vulnerability.description}
                    </td>

                    {/* Action buttons */}
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleOpenActionPlan(r)}
                          className="bg-[#800020]/10 hover:bg-[#800020] text-[#800020] hover:text-white border border-[#800020]/30 font-bold px-3 py-1 rounded-lg text-xs transition cursor-pointer"
                        >
                          Remediation Plan →
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* 3-Part Action Modal */}
      {activeFinding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto border-2 border-[#d6ccbe] flex flex-col text-stone-900">
            {/* Modal Header */}
            <div className="p-6 border-b border-[#e5ded0] bg-[#f5f0e6] flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 font-mono">
                  <span className="text-sm font-bold text-[#800020]">
                    {activeFinding.vulnerability.cve_id}
                  </span>
                  <span
                    className={`text-xs px-2.5 py-0.5 rounded-md font-bold border ${
                      SEVERITY_BADGES[activeFinding.vulnerability.severity?.toUpperCase() || ""] ??
                      "bg-[#f5f0e6] text-stone-700 border-[#d6ccbe]"
                    }`}
                  >
                    {activeFinding.vulnerability.severity} (CVSS {activeFinding.vulnerability.cvss_score ?? "N/A"})
                  </span>
                </div>
                <h3 className="text-base font-bold text-stone-900 mt-1">
                  Security Action Profile: {actionPlan?.asset_name || `Asset #${activeFinding.asset_id}`}
                </h3>
                <p className="text-xs text-stone-500 font-mono">
                  Component: <strong className="text-stone-800">{activeFinding.matched_software || "Operating System"}</strong>
                  {activeFinding.matched_version && ` (v${activeFinding.matched_version})`}
                </p>
              </div>
              <button
                onClick={() => setActiveFinding(null)}
                className="text-stone-500 hover:text-stone-900 text-lg font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Success message */}
            {actionSuccessMsg && (
              <div className="mx-6 mt-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-lg font-mono">
                {actionSuccessMsg}
              </div>
            )}

            {/* Navigation Tabs (Remedy / Threat / Consequences) */}
            <div className="flex border-b border-[#e5ded0] px-6 pt-2 bg-[#fbf9f5] font-mono text-xs">
              <button
                onClick={() => setActiveTab("remedy")}
                className={`py-2.5 px-4 font-bold border-b-2 transition-colors cursor-pointer ${
                  activeTab === "remedy"
                    ? "border-emerald-700 text-emerald-800 bg-white"
                    : "border-transparent text-stone-600 hover:text-stone-900"
                }`}
              >
                1. Technical Remediation
              </button>
              <button
                onClick={() => setActiveTab("threat")}
                className={`py-2.5 px-4 font-bold border-b-2 transition-colors cursor-pointer ${
                  activeTab === "threat"
                    ? "border-[#800020] text-[#800020] bg-white"
                    : "border-transparent text-stone-600 hover:text-stone-900"
                }`}
              >
                2. Threat &amp; Exploitability
              </button>
              <button
                onClick={() => setActiveTab("consequences")}
                className={`py-2.5 px-4 font-bold border-b-2 transition-colors cursor-pointer ${
                  activeTab === "consequences"
                    ? "border-[#800020] text-[#800020] bg-white"
                    : "border-transparent text-stone-600 hover:text-stone-900"
                }`}
              >
                3. Business &amp; Operational Impact
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 flex-1 space-y-4 bg-white">
              {loadingPlan ? (
                <div className="p-12 text-center text-stone-500 font-mono text-xs">
                  <div className="text-lg mb-2">⏳</div>
                  <span>Querying live actions and mitigation directives...</span>
                </div>
              ) : !actionPlan ? (
                <div className="p-8 text-center text-stone-400 font-mono text-xs">Failed to load action profile.</div>
              ) : (
                <>
                  {/* TAB 1: REMEDY */}
                  {activeTab === "remedy" && (
                    <div className="space-y-4">
                      {actionPlan.remedy.cisa_mandate && (
                        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-mono font-bold uppercase text-emerald-800">
                              Official CISA Action Directive
                            </span>
                            {actionPlan.remedy.due_date && (
                              <span className="text-[11px] font-mono bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-bold">
                                Due: {actionPlan.remedy.due_date}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-stone-700">
                            {actionPlan.remedy.cisa_mandate}
                          </p>
                        </div>
                      )}

                      <div className="bg-[#292524] text-white border border-stone-700 rounded-xl p-4 font-mono text-xs space-y-2">
                        <div className="flex items-center justify-between text-stone-400 text-[11px]">
                          <span className="text-emerald-400 font-bold">TERMINAL PATCH COMMAND</span>
                          <button
                            onClick={() => copyToClipboard(actionPlan.remedy.patch_command)}
                            className="bg-[#44403c] hover:bg-[#57534e] text-white px-2.5 py-0.5 rounded transition cursor-pointer"
                          >
                            {copiedCmd ? "✓ Copied!" : "📋 Copy"}
                          </button>
                        </div>
                        <pre className="overflow-x-auto text-emerald-300 whitespace-pre-wrap bg-black/40 p-2.5 rounded border border-stone-800">
                          {actionPlan.remedy.patch_command}
                        </pre>
                      </div>

                      <div className="bg-[#faf7f2] border border-[#e5ded0] rounded-xl p-4 space-y-1">
                        <span className="text-xs font-mono font-bold text-stone-700 uppercase">
                          Hardening Rule / Workaround:
                        </span>
                        <p className="text-xs text-stone-700">{actionPlan.remedy.workaround}</p>
                      </div>

                      <div className="bg-[#faf7f2] border border-[#e5ded0] rounded-xl p-4 space-y-1">
                        <span className="text-xs font-mono font-bold text-stone-700 uppercase">
                          Firewall Rule:
                        </span>
                        <code className="block bg-[#f5f0e6] p-2 rounded text-xs text-stone-800 font-mono border border-[#d6ccbe]">
                          {actionPlan.remedy.firewall_rule}
                        </code>
                      </div>
                    </div>
                  )}

                  {/* TAB 2: THREAT */}
                  {activeTab === "threat" && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-[#faf7f2] border border-[#e5ded0] rounded-xl p-3.5">
                          <span className="text-xs font-mono text-stone-500 uppercase">
                            Exploit Likelihood (EPSS)
                          </span>
                          <p className="text-xl font-bold text-[#800020] font-mono mt-1">
                            {actionPlan.what_if_not_cured.epss_probability}
                          </p>
                        </div>
                        <div className="bg-[#faf7f2] border border-[#e5ded0] rounded-xl p-3.5">
                          <span className="text-xs font-mono text-[#800020] uppercase font-bold">
                            CISA Weaponization
                          </span>
                          <p className="text-sm font-bold text-[#800020] mt-1">
                            {actionPlan.what_if_not_cured.weaponized_status}
                          </p>
                        </div>
                      </div>

                      <div className="bg-[#800020]/5 border border-[#800020]/20 rounded-xl p-4 space-y-1">
                        <span className="text-xs font-mono font-bold text-[#800020] uppercase">
                          Technical Vector:
                        </span>
                        <p className="text-xs text-stone-700 leading-relaxed">
                          {actionPlan.what_if_not_cured.exploit_mechanism}
                        </p>
                      </div>

                      <div className="bg-[#faf7f2] border border-[#e5ded0] rounded-xl p-4 space-y-1">
                        <span className="text-xs font-mono font-bold text-stone-700 uppercase">
                          Attacker Capabilities Once Exploited:
                        </span>
                        <p className="text-xs text-stone-700">
                          {actionPlan.what_if_not_cured.attacker_capability}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* TAB 3: CONSEQUENCES */}
                  {activeTab === "consequences" && (
                    <div className="space-y-4">
                      <div className="bg-[#800020]/5 border border-[#800020]/20 rounded-xl p-4 space-y-1">
                        <span className="text-xs font-mono font-bold uppercase text-[#800020] block">
                          Core Infrastructure Impact:
                        </span>
                        <p className="text-xs text-stone-700 leading-relaxed">
                          {actionPlan.consequences.primary_impact || actionPlan.consequences.clinical_impact}
                        </p>
                      </div>

                      <div className="bg-[#faf7f2] border border-[#e5ded0] rounded-xl p-4 space-y-1">
                        <span className="text-xs font-mono font-bold text-stone-700 uppercase">
                          Service Disruption:
                        </span>
                        <p className="text-xs text-stone-700 leading-relaxed">
                          {actionPlan.consequences.operational_impact}
                        </p>
                      </div>

                      <div className="bg-[#faf7f2] border border-[#e5ded0] rounded-xl p-4 space-y-1">
                        <span className="text-xs font-mono font-bold text-stone-700 uppercase">
                          Regulatory Liability:
                        </span>
                        <p className="text-xs text-stone-700 leading-relaxed">
                          {actionPlan.consequences.legal_regulatory}
                        </p>
                      </div>

                      <div className="bg-[#faf7f2] border border-[#e5ded0] rounded-xl p-3.5 flex items-center justify-between font-mono">
                        <span className="text-xs text-stone-500">
                          Estimated Financial Blast Radius:
                        </span>
                        <span className="text-sm font-bold text-[#800020]">
                          {actionPlan.consequences.financial_cost}
                        </span>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Modal Footer Controls */}
            <div className="p-4 border-t border-[#e5ded0] bg-[#f5f0e6] flex items-center justify-between gap-3 font-mono text-xs">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleResolveFinding(activeFinding.id)}
                  className="bg-[#800020] hover:bg-[#66001a] text-white px-3 py-1.5 rounded-lg transition cursor-pointer font-bold"
                >
                  Mark Remediated
                </button>
              </div>
              <button
                onClick={() => setActiveFinding(null)}
                className="bg-white hover:bg-stone-100 text-stone-800 border border-[#d6ccbe] px-4 py-1.5 rounded-lg transition cursor-pointer font-bold"
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
