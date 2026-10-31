import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  getAssessmentResults,
  getAssessmentSummary,
  runAssessment,
  getActionPlan,
  resolveFinding,
  quarantineAsset,
} from "../services/api";
import type {
  AssetVulnerability,
  AssessmentDashboardSummary,
  ActionPlanProfile,
} from "../types/asset";

const SEVERITY_BADGES: Record<string, string> = {
  CRITICAL: "bg-rose-950/80 text-rose-300 border-rose-800/80",
  HIGH: "bg-amber-950/80 text-amber-300 border-amber-800/80",
  MEDIUM: "bg-yellow-950/80 text-yellow-300 border-yellow-800/80",
  LOW: "bg-emerald-950/80 text-emerald-300 border-emerald-800/80",
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
        `✅ Assessment completed! Scanned ${summaryResult.assets_assessed} assets. Identified ${summaryResult.total_matches} vulnerability matches across ${summaryResult.assets_with_vulnerabilities} affected assets.`
      );
      await loadData();
    } catch (err: unknown) {
      setMessage(`❌ ${err instanceof Error ? err.message : "Assessment run failed"}`);
    } finally {
      setRunning(false);
    }
  }

  // Open 3-part Action Profile Modal
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

  // Quarantine Action
  async function handleQuarantine(assetId: number) {
    if (!window.confirm(`Isolate and quarantine Asset #${assetId} from internal production network?`)) return;
    try {
      const res = await quarantineAsset(assetId);
      setActionSuccessMsg(`${res.message}`);
      setMessage(`Asset #${assetId} is now quarantined.`);
      await loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Quarantine failed");
    }
  }

  // Resolve / Remediate Action
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
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-200">Vulnerability Assessment &amp; Actions</h1>
          <p className="text-slate-400 text-sm">
            Phase 2: Automated software matching engine &amp; operational mitigation playbooks
          </p>
        </div>
        <button
          onClick={handleRunAssessment}
          disabled={running}
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg shadow-sm disabled:opacity-50 transition-colors flex items-center gap-2 cursor-pointer"
        >
          {running ? "Scanning Assets..." : "⚡ Run Vulnerability Assessment"}
        </button>
      </div>

      {/* Message Banner */}
      {message && (
        <div
          className={`p-3 rounded-lg text-sm border font-medium ${
            message.startsWith("✅")
              ? "bg-green-50 text-green-800 border-green-200"
              : message.startsWith("❌")
              ? "bg-red-50 text-red-800 border-red-200"
              : "bg-blue-50 text-blue-800 border-blue-200"
          }`}
        >
          {message}
        </div>
      )}

      {/* Summary Stat Cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-slate-900 p-5 rounded-xl shadow-lg border border-slate-800">
            <span className="text-xs uppercase font-semibold text-gray-400">Total Findings</span>
            <p className="text-3xl font-bold text-slate-100 mt-1">
              {summary.total_asset_vulnerability_links}
            </p>
            <span className="text-xs text-slate-400">Active CVE matches</span>
          </div>
          <div className="bg-slate-900 p-5 rounded-xl shadow-lg border border-slate-800">
            <span className="text-xs uppercase font-semibold text-indigo-600">Affected Assets</span>
            <p className="text-3xl font-bold text-indigo-700 mt-1">{summary.assets_affected}</p>
            <span className="text-xs text-slate-400">Require remediation</span>
          </div>
          <div className="bg-slate-900 p-5 rounded-xl shadow-lg border border-slate-800">
            <span className="text-xs uppercase font-semibold text-red-600">Critical CVEs</span>
            <p className="text-3xl font-bold text-red-700 mt-1">
              {summary.by_severity["CRITICAL"] || 0}
            </p>
            <span className="text-xs text-slate-400">CVSS 9.0 - 10.0</span>
          </div>
          <div className="bg-slate-900 p-5 rounded-xl shadow-lg border border-slate-800">
            <span className="text-xs uppercase font-semibold text-orange-600">High CVEs</span>
            <p className="text-3xl font-bold text-orange-700 mt-1">
              {summary.by_severity["HIGH"] || 0}
            </p>
            <span className="text-xs text-slate-400">CVSS 7.0 - 8.9</span>
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-slate-900 p-4 rounded-xl shadow-lg border border-slate-800 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
            Filter Severity:
          </span>
          <select
            value={filterSeverity}
            onChange={(e) => setFilterSeverity(e.target.value)}
            className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          >
            <option value="">All Severities</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </div>
        <span className="text-xs text-gray-400">
          Showing {results.length} detected finding(s)
        </span>
      </div>

      {/* Findings & Actions Table */}
      <div className="bg-slate-900 rounded-xl shadow-lg overflow-x-auto border border-slate-800">
        {loading ? (
          <div className="p-12 text-center text-gray-400">Loading findings...</div>
        ) : results.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-3">
            <p className="text-base font-semibold">No vulnerability matches found.</p>
            <p className="text-sm text-gray-400">
              Run the Vulnerability Assessment above to evaluate inventory against current CVE definitions.
            </p>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-950 text-slate-400 text-xs uppercase tracking-wider border-b border-slate-800">
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
            <tbody className="divide-y divide-slate-800">
              {results.map((r) => {
                const sev = r.vulnerability.severity?.toUpperCase() || "UNKNOWN";
                return (
                  <tr key={r.id} className="hover:bg-slate-800/50 transition-colors">
                    <td className="px-4 py-3 font-semibold text-slate-300 whitespace-nowrap">
                      <Link
                        to={`/assets/${r.asset_id}`}
                        className="text-cyan-400 hover:text-cyan-300 hover:underline flex items-center gap-1 font-semibold"
                      >
                        <span>Asset #{r.asset_id}</span>
                        <span className="text-xs text-gray-400">↗</span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-medium text-slate-200">
                        {r.matched_software || "System"}
                      </span>
                      {r.matched_version && (
                        <span className="text-xs text-slate-400 block">v{r.matched_version}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono font-semibold text-blue-700 whitespace-nowrap">
                      {r.vulnerability.cve_id}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`text-xs px-2.5 py-0.5 rounded-full font-bold border ${
                          SEVERITY_BADGES[sev] ?? "bg-gray-100 text-slate-300 border-gray-300"
                        }`}
                      >
                        {sev}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-200 whitespace-nowrap">
                      {r.vulnerability.cvss_score !== null && r.vulnerability.cvss_score !== undefined ? (
                        <div className="flex items-center gap-1">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              r.vulnerability.cvss_score >= 9
                                ? "bg-red-600"
                                : r.vulnerability.cvss_score >= 7
                                ? "bg-orange-500"
                                : r.vulnerability.cvss_score >= 4
                                ? "bg-yellow-500"
                                : "bg-green-500"
                            }`}
                          />
                          <span>{r.vulnerability.cvss_score.toFixed(1)}</span>
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-300 max-w-xs line-clamp-2">
                      {r.vulnerability.description}
                    </td>

                    {/* ACTION PLAN COLUMN */}
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleOpenActionPlan(r)}
                          className="bg-indigo-700 hover:bg-indigo-800 text-white font-medium px-3 py-1.5 rounded-md text-xs shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                          title="Open detailed remediation plan, threat vectors, and business consequences"
                        >
                          <span>Remediation Plan</span>
                        </button>
                        <button
                          onClick={() => handleQuarantine(r.asset_id)}
                          className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer"
                          title="Isolate this host from the enterprise network"
                        >
                          Isolate Host
                        </button>
                        {r.vulnerability.reference_url && (
                          <a
                            href={r.vulnerability.reference_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-slate-500 hover:text-blue-600 text-xs px-1 font-medium"
                            title="Official NIST NVD Advisory"
                          >
                            Advisory ↗
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {/* 3-PART ACTION MODAL: REMEDY | WHAT IF NOT CURED | CONSEQUENCES           */}
      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {activeFinding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto border border-gray-100 flex flex-col">
            {/* Modal Header */}
            <div className="p-6 border-b border-gray-100 bg-gray-50/50 flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-base font-bold text-blue-700">
                    {activeFinding.vulnerability.cve_id}
                  </span>
                  <span
                    className={`text-xs px-2.5 py-0.5 rounded-full font-bold border ${
                      SEVERITY_BADGES[activeFinding.vulnerability.severity?.toUpperCase() || ""] ??
                      "bg-gray-100 text-slate-300 border-gray-300"
                    }`}
                  >
                    {activeFinding.vulnerability.severity} (CVSS {activeFinding.vulnerability.cvss_score ?? "N/A"})
                  </span>
                </div>
                <h3 className="text-lg font-bold text-slate-200 mt-1">
                  Security Action Profile: {actionPlan?.asset_name || `Asset #${activeFinding.asset_id}`}
                </h3>
                <p className="text-xs text-slate-400">
                  Component: <strong className="text-slate-300">{activeFinding.matched_software || "Operating System"}</strong>
                  {activeFinding.matched_version && ` (v${activeFinding.matched_version})`}
                </p>
              </div>
              <button
                onClick={() => setActiveFinding(null)}
                className="text-gray-400 hover:text-gray-600 text-xl font-bold cursor-pointer p-1"
              >
                ✕
              </button>
            </div>

            {/* Success message inside modal */}
            {actionSuccessMsg && (
              <div className="mx-6 mt-4 p-3 bg-green-50 border border-green-200 text-green-800 text-xs rounded-lg font-semibold">
                {actionSuccessMsg}
              </div>
            )}

            {/* Navigation Tabs (Remedy / Threat / Consequences) */}
            <div className="flex border-b border-gray-200 px-6 pt-2 bg-slate-50/50">
              <button
                onClick={() => setActiveTab("remedy")}
                className={`py-3 px-4 font-semibold text-xs sm:text-sm border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
                  activeTab === "remedy"
                    ? "border-indigo-600 text-indigo-700 bg-white"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                <span>1. Technical Remediation</span>
              </button>
              <button
                onClick={() => setActiveTab("threat")}
                className={`py-3 px-4 font-semibold text-xs sm:text-sm border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
                  activeTab === "threat"
                    ? "border-amber-600 text-amber-700 bg-white"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                <span>2. Threat Vector & Exploitability</span>
              </button>
              <button
                onClick={() => setActiveTab("consequences")}
                className={`py-3 px-4 font-semibold text-xs sm:text-sm border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
                  activeTab === "consequences"
                    ? "border-rose-600 text-rose-700 bg-white"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                <span>3. Business & Operational Impact</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 flex-1 space-y-4">
              {loadingPlan ? (
                <div className="p-12 text-center text-gray-400">
                  <div className="animate-spin text-2xl mb-2">⚡</div>
                  <span>Querying CISA KEV &amp; FIRST.org EPSS APIs for live actions...</span>
                </div>
              ) : !actionPlan ? (
                <div className="p-8 text-center text-gray-400">Failed to load action profile.</div>
              ) : (
                <>
                  {/* TAB 1: REMEDY */}
                  {activeTab === "remedy" && (
                    <div className="space-y-4">
                      {/* CISA Directive */}
                      {actionPlan.remedy.cisa_mandate && (
                        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-bold uppercase tracking-wide text-emerald-800 flex items-center gap-1">
                              <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">Official CISA Action Directive</span>
                            </span>
                            {actionPlan.remedy.due_date && (
                              <span className="text-[11px] font-semibold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">
                                Due: {actionPlan.remedy.due_date}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-emerald-900 font-medium">
                            {actionPlan.remedy.cisa_mandate}
                          </p>
                        </div>
                      )}

                      {/* Patch Command */}
                      <div className="bg-slate-900 text-slate-100 rounded-xl p-4 font-mono text-xs space-y-2">
                        <div className="flex items-center justify-between text-slate-400 text-[11px]">
                          <span>TERMINAL PATCH COMMAND</span>
                          <button
                            onClick={() => copyToClipboard(actionPlan.remedy.patch_command)}
                            className="bg-slate-800 hover:bg-slate-700 text-white px-2 py-0.5 rounded text-[11px] transition-colors cursor-pointer"
                          >
                            {copiedCmd ? "✓ Copied!" : "📋 Copy"}
                          </button>
                        </div>
                        <pre className="overflow-x-auto text-emerald-400 whitespace-pre-wrap">
                          {actionPlan.remedy.patch_command}
                        </pre>
                      </div>

                      {/* Workaround */}
                      <div className="border border-gray-200 rounded-xl p-4 space-y-1">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">
                          Emergency Workaround / Hardening Rule:
                        </span>
                        <p className="text-sm text-slate-300">{actionPlan.remedy.workaround}</p>
                      </div>

                      {/* Firewall Containment */}
                      <div className="border border-gray-200 rounded-xl p-4 space-y-1">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">
                          Firewall Isolation Rule:
                        </span>
                        <code className="block bg-gray-50 p-2 rounded text-xs text-slate-200 font-mono">
                          {actionPlan.remedy.firewall_rule}
                        </code>
                      </div>
                    </div>
                  )}

                  {/* TAB 2: WHAT IF NOT CURED */}
                  {activeTab === "threat" && (
                    <div className="space-y-4">
                      {/* Live Telemetry Bar */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5">
                          <span className="text-xs font-semibold text-amber-800 uppercase">
                            Exploit Likelihood (EPSS Live)
                          </span>
                          <p className="text-xl font-bold text-amber-900 mt-1">
                            {actionPlan.what_if_not_cured.epss_probability}
                          </p>
                          {actionPlan.what_if_not_cured.epss_percentile && (
                            <span className="text-xs text-amber-700">
                              Higher threat than {actionPlan.what_if_not_cured.epss_percentile}% of all known CVEs
                            </span>
                          )}
                        </div>
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                          <span className="text-xs font-semibold text-slate-700 uppercase">
                            CISA Weaponization
                          </span>
                          <p className="text-sm font-bold text-slate-900 mt-1">
                            {actionPlan.what_if_not_cured.weaponized_status}
                          </p>
                          <span className="text-xs text-slate-500">
                            Active in-the-wild exploitation catalog
                          </span>
                        </div>
                      </div>

                      {/* Exploit Mechanism */}
                      <div className="border border-amber-100 bg-amber-50/40 rounded-xl p-4 space-y-1">
                        <span className="text-xs font-bold text-amber-900 uppercase tracking-wide">
                          How Attackers Exploit It (Technical Vector):
                        </span>
                        <p className="text-sm text-slate-200 leading-relaxed">
                          {actionPlan.what_if_not_cured.exploit_mechanism}
                        </p>
                      </div>

                      {/* Attacker Capability */}
                      <div className="border border-gray-200 rounded-xl p-4 space-y-1">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">
                          Attacker Capabilities Once Compromised:
                        </span>
                        <p className="text-sm text-slate-200 font-medium">
                          {actionPlan.what_if_not_cured.attacker_capability}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* TAB 3: CONSEQUENCES */}
                  {activeTab === "consequences" && (
                    <div className="space-y-4">
                      {/* Industry Domain Header */}
                      {actionPlan.consequences.domain_category && (
                        <div className="flex items-center justify-between bg-slate-100 border border-slate-200 rounded-lg px-4 py-2">
                          <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                            Evaluated Organizational Context:
                          </span>
                          <span className="text-xs font-bold text-slate-800 bg-white px-2.5 py-0.5 rounded border border-slate-200">
                            {actionPlan.consequences.domain_category}
                          </span>
                        </div>
                      )}

                      {/* Primary Business & Mission Impact */}
                      <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 space-y-1">
                        <span className="text-xs font-bold uppercase tracking-wider text-rose-800 block">
                          Mission & Core Business Impact:
                        </span>
                        <p className="text-sm text-rose-950 font-medium leading-relaxed">
                          {actionPlan.consequences.primary_impact || actionPlan.consequences.clinical_impact}
                        </p>
                      </div>

                      {/* Operational Disruption */}
                      <div className="border border-gray-200 rounded-xl p-4 space-y-1">
                        <span className="text-xs font-bold text-gray-600 uppercase tracking-wider">
                          Operational Service Disruption:
                        </span>
                        <p className="text-sm text-slate-200 leading-relaxed">
                          {actionPlan.consequences.operational_impact}
                        </p>
                      </div>

                      {/* Legal, Regulatory & Compliance */}
                      <div className="border border-gray-200 rounded-xl p-4 space-y-1">
                        <span className="text-xs font-bold text-gray-600 uppercase tracking-wider">
                          Legal, Compliance & Regulatory Liability:
                        </span>
                        <p className="text-sm text-slate-200 font-medium leading-relaxed">
                          {actionPlan.consequences.legal_regulatory}
                        </p>
                      </div>

                      {/* Financial Damage */}
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-600">
                          Estimated Financial Exposure:
                        </span>
                        <span className="text-sm font-bold text-rose-700">
                          {actionPlan.consequences.financial_cost}
                        </span>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Modal Footer Controls */}
            <div className="p-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleQuarantine(activeFinding.asset_id)}
                  className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors cursor-pointer"
                >
                  Isolate / Quarantine Host
                </button>
                <button
                  onClick={() => handleResolveFinding(activeFinding.id)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors cursor-pointer"
                >
                  Mark as Remediated
                </button>
              </div>
              <div className="flex items-center gap-2">
                {activeFinding.vulnerability.reference_url && (
                  <a
                    href={activeFinding.vulnerability.reference_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-blue-600 hover:underline px-2"
                  >
                    NVD Advisory ↗
                  </a>
                )}
                <button
                  onClick={() => setActiveFinding(null)}
                  className="bg-gray-200 hover:bg-gray-300 text-slate-300 text-xs font-semibold px-4 py-2 rounded-lg transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
