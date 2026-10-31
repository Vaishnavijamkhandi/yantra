import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  getAssessmentResults,
  getAssessmentSummary,
  runAssessment,
} from "../services/api";
import type { AssetVulnerability, AssessmentDashboardSummary } from "../types/asset";

const SEVERITY_BADGES: Record<string, string> = {
  CRITICAL: "bg-red-100 text-red-800 border-red-300",
  HIGH: "bg-orange-100 text-orange-800 border-orange-300",
  MEDIUM: "bg-yellow-100 text-yellow-800 border-yellow-300",
  LOW: "bg-green-100 text-green-800 border-green-300",
};

export default function Assessment() {
  const [results, setResults] = useState<AssetVulnerability[]>([]);
  const [summary, setSummary] = useState<AssessmentDashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const [filterSeverity, setFilterSeverity] = useState("");

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
      setMessage("Running matching engine across all hospital assets...");
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

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Vulnerability Assessment</h1>
          <p className="text-gray-500 text-sm">
            Phase 2: Automated software matching engine against known CVE records
          </p>
        </div>
        <button
          onClick={handleRunAssessment}
          disabled={running}
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg shadow-sm disabled:opacity-50 transition-colors flex items-center gap-2"
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
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
            <span className="text-xs uppercase font-semibold text-gray-400">Total Findings</span>
            <p className="text-3xl font-bold text-gray-800 mt-1">
              {summary.total_asset_vulnerability_links}
            </p>
            <span className="text-xs text-gray-500">CVE matches detected</span>
          </div>
          <div className="bg-white p-5 rounded-xl shadow-sm border border-indigo-100">
            <span className="text-xs uppercase font-semibold text-indigo-600">Affected Assets</span>
            <p className="text-3xl font-bold text-indigo-700 mt-1">{summary.assets_affected}</p>
            <span className="text-xs text-gray-500">Assets with known CVEs</span>
          </div>
          <div className="bg-white p-5 rounded-xl shadow-sm border border-red-100">
            <span className="text-xs uppercase font-semibold text-red-600">Critical CVEs</span>
            <p className="text-3xl font-bold text-red-700 mt-1">
              {summary.by_severity["CRITICAL"] || 0}
            </p>
            <span className="text-xs text-gray-500">CVSS 9.0 - 10.0</span>
          </div>
          <div className="bg-white p-5 rounded-xl shadow-sm border border-orange-100">
            <span className="text-xs uppercase font-semibold text-orange-600">High CVEs</span>
            <p className="text-3xl font-bold text-orange-700 mt-1">
              {summary.by_severity["HIGH"] || 0}
            </p>
            <span className="text-xs text-gray-500">CVSS 7.0 - 8.9</span>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Filter Severity:
          </span>
          <select
            value={filterSeverity}
            onChange={(e) => setFilterSeverity(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          >
            <option value="">All Severities</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </div>
        <span className="text-xs text-gray-400">
          Showing {results.length} matched finding(s)
        </span>
      </div>

      {/* Results Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-x-auto border border-gray-100">
        {loading ? (
          <div className="p-12 text-center text-gray-400">Loading findings...</div>
        ) : results.length === 0 ? (
          <div className="p-12 text-center text-gray-500 space-y-3">
            <p className="text-base font-semibold">No vulnerability matches found.</p>
            <p className="text-sm text-gray-400">
              Make sure you have seeded or synced CVEs in the &quot;CVE Database&quot; tab, then click &quot;⚡ Run Vulnerability Assessment&quot; above!
            </p>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3">Asset ID</th>
                <th className="px-4 py-3">Matched Software</th>
                <th className="px-4 py-3">CVE ID</th>
                <th className="px-4 py-3">Severity</th>
                <th className="px-4 py-3">CVSS Score</th>
                <th className="px-4 py-3">Match Method</th>
                <th className="px-4 py-3">CVE Description</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {results.map((r) => {
                const sev = r.vulnerability.severity?.toUpperCase() || "UNKNOWN";
                return (
                  <tr key={r.id} className="hover:bg-gray-50/80 transition-colors">
                    <td className="px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">
                      <Link
                        to={`/assets/${r.asset_id}`}
                        className="text-blue-600 hover:underline flex items-center gap-1"
                      >
                        <span>Asset #{r.asset_id}</span>
                        <span className="text-xs text-gray-400">↗</span>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-gray-800">
                        {r.matched_software || "System"}
                      </span>
                      {r.matched_version && (
                        <span className="text-xs text-gray-500 block">v{r.matched_version}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono font-semibold text-blue-700 whitespace-nowrap">
                      {r.vulnerability.cve_id}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs px-2.5 py-0.5 rounded-full font-bold border ${
                          SEVERITY_BADGES[sev] ?? "bg-gray-100 text-gray-700 border-gray-300"
                        }`}
                      >
                        {sev}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-gray-800">
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
                    <td className="px-4 py-3">
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-gray-100 text-gray-600 uppercase">
                        {r.match_method}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 max-w-sm line-clamp-2">
                      {r.vulnerability.description}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs">
                      {r.vulnerability.reference_url && (
                        <a
                          href={r.vulnerability.reference_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          NVD ↗
                        </a>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
