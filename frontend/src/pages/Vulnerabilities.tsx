import { useEffect, useState } from "react";
import {
  getVulnerabilities,
  getVulnerabilityStats,
  seedVulnerabilities,
  syncNvdVulnerabilities,
} from "../services/api";
import type { Vulnerability, VulnerabilityStats } from "../types/asset";

const SEVERITY_BADGES: Record<string, string> = {
  CRITICAL: "bg-red-100 text-red-800 border-red-300",
  HIGH: "bg-orange-100 text-orange-800 border-orange-300",
  MEDIUM: "bg-yellow-100 text-yellow-800 border-yellow-300",
  LOW: "bg-green-100 text-green-800 border-green-300",
};

export default function Vulnerabilities() {
  const [vulns, setVulns] = useState<Vulnerability[]>([]);
  const [stats, setStats] = useState<VulnerabilityStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  // Filters
  const [search, setSearch] = useState("");
  const [severity, setSeverity] = useState("");
  const [minScore, setMinScore] = useState<number | undefined>(undefined);

  async function loadData() {
    try {
      setLoading(true);
      const [list, statsData] = await Promise.all([
        getVulnerabilities({
          search: search || undefined,
          severity: severity || undefined,
          min_score: minScore,
          limit: 100,
        }),
        getVulnerabilityStats(),
      ]);
      setVulns(list);
      setStats(statsData);
    } catch (err: unknown) {
      setStatusMessage(err instanceof Error ? err.message : "Failed to load vulnerabilities");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [search, severity, minScore]);

  async function handleSeed() {
    try {
      setActionLoading(true);
      setStatusMessage("Seeding curated enterprise CVEs into database...");
      const res = await seedVulnerabilities();
      setStatusMessage(`✅ Seeded ${res.inserted} new CVEs (${res.updated} updated). Total: ${res.total}`);
      await loadData();
    } catch (err: unknown) {
      setStatusMessage(`❌ ${err instanceof Error ? err.message : "Failed to seed CVEs"}`);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleNvdSync() {
    try {
      setActionLoading(true);
      setStatusMessage("Querying NIST NVD API v2.0 (this may take 15-30 seconds due to rate limits)...");
      const res = await syncNvdVulnerabilities(["nginx", "postgresql", "ubuntu"], 50);
      setStatusMessage(`✅ NVD Sync complete! Inserted: ${res.inserted}, Updated: ${res.updated}`);
      await loadData();
    } catch (err: unknown) {
      setStatusMessage(`❌ ${err instanceof Error ? err.message : "NVD Sync failed"}`);
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header and Action Buttons */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">NVD Vulnerability Database</h1>
          <p className="text-slate-400 text-sm">
            Phase 2: National Vulnerability Database (NVD) v2.0 sync &amp; CVE repository
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleSeed}
            disabled={actionLoading}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-4 py-2 rounded-lg shadow-sm disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            Seed Curated CVEs
          </button>
          <button
            onClick={handleNvdSync}
            disabled={actionLoading}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg shadow-sm disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            🔄 Sync from NVD API
          </button>
        </div>
      </div>

      {/* Status banner */}
      {statusMessage && (
        <div
          className={`p-3 rounded-lg text-sm border font-medium ${
            statusMessage.startsWith("✅")
              ? "bg-green-50 text-green-800 border-green-200"
              : statusMessage.startsWith("❌")
              ? "bg-red-50 text-red-800 border-red-200"
              : "bg-blue-50 text-blue-800 border-blue-200"
          }`}
        >
          {statusMessage}
        </div>
      )}

      {/* Stats bar */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="bg-slate-900 p-4 rounded-xl shadow-lg border border-slate-800">
            <span className="text-xs uppercase font-semibold text-slate-500">Total CVEs</span>
            <p className="text-2xl font-bold text-slate-100 mt-1">{stats.total}</p>
          </div>
          <div className="bg-slate-900 p-4 rounded-xl shadow-lg border border-slate-800">
            <span className="text-xs uppercase font-semibold text-red-600">Critical</span>
            <p className="text-2xl font-bold text-red-700 mt-1">{stats.by_severity["CRITICAL"] || 0}</p>
          </div>
          <div className="bg-slate-900 p-4 rounded-xl shadow-lg border border-slate-800">
            <span className="text-xs uppercase font-semibold text-orange-600">High</span>
            <p className="text-2xl font-bold text-orange-700 mt-1">{stats.by_severity["HIGH"] || 0}</p>
          </div>
          <div className="bg-slate-900 p-4 rounded-xl shadow-lg border border-slate-800">
            <span className="text-xs uppercase font-semibold text-yellow-600">Medium</span>
            <p className="text-2xl font-bold text-yellow-700 mt-1">{stats.by_severity["MEDIUM"] || 0}</p>
          </div>
          <div className="bg-slate-900 p-4 rounded-xl shadow-lg border border-slate-800">
            <span className="text-xs uppercase font-semibold text-green-600">Low</span>
            <p className="text-2xl font-bold text-green-700 mt-1">{stats.by_severity["LOW"] || 0}</p>
          </div>
        </div>
      )}

      {/* Search and Filters */}
      <div className="bg-slate-900 p-4 rounded-xl shadow-lg border border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <input
          type="text"
          placeholder="🔍 Search CVE ID, description, product..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
        />
        <select
          value={severity}
          onChange={(e) => setSeverity(e.target.value)}
          className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
        >
          <option value="">All Severities</option>
          <option value="CRITICAL">Critical (CVSS 9.0 - 10.0)</option>
          <option value="HIGH">High (CVSS 7.0 - 8.9)</option>
          <option value="MEDIUM">Medium (CVSS 4.0 - 6.9)</option>
          <option value="LOW">Low (CVSS 0.1 - 3.9)</option>
        </select>
        <select
          value={minScore ?? ""}
          onChange={(e) => setMinScore(e.target.value ? parseFloat(e.target.value) : undefined)}
          className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
        >
          <option value="">Any CVSS Score</option>
          <option value="9.0">Score &gt;= 9.0</option>
          <option value="7.0">Score &gt;= 7.0</option>
          <option value="5.0">Score &gt;= 5.0</option>
        </select>
      </div>

      {/* CVE Table */}
      <div className="bg-slate-900 rounded-xl shadow-lg overflow-x-auto border border-slate-800">
        {loading ? (
          <div className="p-12 text-center text-slate-500">Loading vulnerabilities...</div>
        ) : vulns.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-3">
            <p className="text-base font-semibold">No vulnerabilities found in database.</p>
            <p className="text-sm text-slate-500">
              Click &quot;Seed Curated CVEs&quot; above to load sample hospital vulnerability records, or &quot;🔄 Sync from NVD API&quot;.
            </p>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-950 text-slate-400 text-xs uppercase tracking-wider border-b border-slate-800">
              <tr>
                <th className="px-4 py-3">CVE ID</th>
                <th className="px-4 py-3">Severity</th>
                <th className="px-4 py-3">CVSS Score</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Affected Products</th>
                <th className="px-4 py-3">Reference</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {vulns.map((v) => {
                const sev = v.severity?.toUpperCase() || "UNKNOWN";
                return (
                  <tr key={v.id} className="hover:bg-slate-800/50 transition-colors">
                    <td className="px-4 py-3 font-mono font-semibold text-blue-700 whitespace-nowrap">
                      {v.cve_id}
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
                      {v.cvss_score !== null && v.cvss_score !== undefined ? (
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`w-2.5 h-2.5 rounded-full ${
                              v.cvss_score >= 9
                                ? "bg-red-600"
                                : v.cvss_score >= 7
                                ? "bg-orange-500"
                                : v.cvss_score >= 4
                                ? "bg-yellow-500"
                                : "bg-green-500"
                            }`}
                          />
                          <span>{v.cvss_score.toFixed(1)}</span>
                          {v.cvss_version && (
                            <span className="text-[10px] text-slate-500">v{v.cvss_version}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-500 italic">N/A</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-700 max-w-md line-clamp-2">
                      {v.description}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400 max-w-xs truncate">
                      {v.affected_products || "—"}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs">
                      {v.reference_url ? (
                        <a
                          href={v.reference_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-cyan-400 hover:text-cyan-300 hover:underline font-semibold"
                        >
                          NVD Details ↗
                        </a>
                      ) : (
                        <span className="text-slate-500">—</span>
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

