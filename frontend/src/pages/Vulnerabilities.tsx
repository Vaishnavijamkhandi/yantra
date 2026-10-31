import { useEffect, useState } from "react";
import {
  getVulnerabilities,
  getVulnerabilityStats,
  seedVulnerabilities,
  syncNvdVulnerabilities,
} from "../services/api";
import type { Vulnerability, VulnerabilityStats } from "../types/asset";

const SEVERITY_BADGES: Record<string, string> = {
  CRITICAL: "bg-[#800020]/10 text-[#800020] border-[#800020]/30",
  HIGH: "bg-red-50 text-red-700 border-red-200",
  MEDIUM: "bg-amber-50 text-amber-800 border-amber-200",
  LOW: "bg-emerald-50 text-emerald-800 border-emerald-200",
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
      setStatusMessage("Querying NIST NVD API v2.0 for live updates...");
      const res = await syncNvdVulnerabilities(["nginx", "postgresql", "ubuntu", "cisco", "modbus"], 50);
      setStatusMessage(`✅ NVD Sync complete! Inserted: ${res.inserted}, Updated: ${res.updated}`);
      await loadData();
    } catch (err: unknown) {
      setStatusMessage(`❌ ${err instanceof Error ? err.message : "NVD Sync failed"}`);
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 text-stone-900">
      {/* Header and Action Buttons */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[#e5ded0]">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black text-[#800020] tracking-tight">
              NIST NVD &amp; Threat Intelligence
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold uppercase bg-[#800020]/10 text-[#800020] border border-[#800020]/20">
              NVD v2.0 · CISA KEV
            </span>
          </div>
          <p className="text-stone-600 text-xs mt-1">
            Global CVE repository synchronized with NIST NVD v2.0 feeds and CISA weaponization catalog.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleSeed}
            disabled={actionLoading}
            className="bg-white hover:bg-[#faf7f2] text-stone-700 border border-[#d6ccbe] text-xs font-mono font-semibold px-4 py-2 rounded-xl disabled:opacity-50 transition shadow-2xs"
          >
            Seed Curated CVEs
          </button>
          <button
            onClick={handleNvdSync}
            disabled={actionLoading}
            className="bg-[#800020] hover:bg-[#66001a] text-white text-xs font-mono font-bold px-4 py-2 rounded-xl disabled:opacity-50 transition cursor-pointer uppercase shadow-xs"
          >
            🔄 Sync Live NVD Feed
          </button>
        </div>
      </div>

      {/* Status banner */}
      {statusMessage && (
        <div
          className={`p-3.5 rounded-xl text-xs font-mono border font-medium ${
            statusMessage.startsWith("✅")
              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
              : statusMessage.startsWith("❌")
              ? "bg-red-50 text-red-800 border-red-200"
              : "bg-white text-stone-800 border-[#e5ded0]"
          }`}
        >
          {statusMessage}
        </div>
      )}

      {/* Stats bar */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="bg-white p-4 rounded-xl border border-[#e5ded0] shadow-xs">
            <span className="text-[11px] font-mono text-stone-500 uppercase">Total CVEs</span>
            <p className="text-2xl font-black text-stone-900 mt-1 font-mono">{stats.total}</p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-[#e5ded0] shadow-xs">
            <span className="text-[11px] font-mono text-[#800020] uppercase font-bold">Critical (9.0+)</span>
            <p className="text-2xl font-black text-[#800020] mt-1 font-mono">{stats.by_severity["CRITICAL"] || 0}</p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-[#e5ded0] shadow-xs">
            <span className="text-[11px] font-mono text-red-700 uppercase">High (7.0-8.9)</span>
            <p className="text-2xl font-black text-stone-800 mt-1 font-mono">{stats.by_severity["HIGH"] || 0}</p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-[#e5ded0] shadow-xs">
            <span className="text-[11px] font-mono text-amber-800 uppercase">Medium</span>
            <p className="text-2xl font-black text-amber-800 mt-1 font-mono">{stats.by_severity["MEDIUM"] || 0}</p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-[#e5ded0] shadow-xs">
            <span className="text-[11px] font-mono text-emerald-800 uppercase">Low</span>
            <p className="text-2xl font-black text-emerald-800 mt-1 font-mono">{stats.by_severity["LOW"] || 0}</p>
          </div>
        </div>
      )}

      {/* Search and Filters */}
      <div className="bg-white p-4 rounded-xl border border-[#e5ded0] shadow-xs grid grid-cols-1 sm:grid-cols-3 gap-3">
        <input
          type="text"
          placeholder="🔍 Search CVE ID, technical description, vendor..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-[#faf7f2] border border-[#d6ccbe] rounded-lg px-3.5 py-2 text-xs font-mono text-stone-800 focus:outline-none focus:border-[#800020] placeholder-stone-400"
        />
        <select
          value={severity}
          onChange={(e) => setSeverity(e.target.value)}
          className="bg-[#faf7f2] border border-[#d6ccbe] rounded-lg px-3.5 py-2 text-xs font-mono text-stone-800 focus:outline-none focus:border-[#800020]"
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
          className="bg-[#faf7f2] border border-[#d6ccbe] rounded-lg px-3.5 py-2 text-xs font-mono text-stone-800 focus:outline-none focus:border-[#800020]"
        >
          <option value="">Any CVSS Threshold</option>
          <option value="9.0">Score ≥ 9.0</option>
          <option value="7.0">Score ≥ 7.0</option>
          <option value="5.0">Score ≥ 5.0</option>
        </select>
      </div>

      {/* CVE Table */}
      <div className="bg-white rounded-2xl overflow-x-auto border border-[#e5ded0] shadow-xs">
        {loading ? (
          <div className="p-12 text-center text-stone-500 font-mono text-xs">Querying repository...</div>
        ) : vulns.length === 0 ? (
          <div className="p-12 text-center text-stone-500 space-y-2 font-mono text-xs">
            <p className="text-sm font-semibold">No vulnerabilities found.</p>
            <p className="text-stone-400">
              Click &quot;Seed Curated CVEs&quot; above to load sample vulnerability records.
            </p>
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="bg-[#f5f0e6] text-stone-600 font-mono uppercase tracking-wider border-b border-[#e5ded0]">
              <tr>
                <th className="px-4 py-3">CVE ID</th>
                <th className="px-4 py-3">Severity</th>
                <th className="px-4 py-3">CVSS Score</th>
                <th className="px-4 py-3">Technical Description</th>
                <th className="px-4 py-3">Affected Components</th>
                <th className="px-4 py-3 text-right">Reference</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0eae0] font-mono">
              {vulns.map((v) => {
                const sev = v.severity?.toUpperCase() || "UNKNOWN";
                return (
                  <tr key={v.id} className="hover:bg-[#faf6f0] transition-colors border-b border-[#f0eae0]">
                    <td className="px-4 py-3 font-bold text-[#800020] whitespace-nowrap">
                      {v.cve_id}
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
                      {v.cvss_score !== null && v.cvss_score !== undefined ? (
                        <span className={v.cvss_score >= 8 ? "text-[#800020]" : "text-amber-800"}>
                          {v.cvss_score.toFixed(1)}
                        </span>
                      ) : (
                        <span className="text-stone-400">N/A</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-stone-600 max-w-md line-clamp-2 font-sans text-xs">
                      {v.description}
                    </td>
                    <td className="px-4 py-3 text-xs text-stone-500 max-w-xs truncate">
                      {v.affected_products || "—"}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-right">
                      {v.reference_url ? (
                        <a
                          href={v.reference_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[#800020] hover:underline font-bold"
                        >
                          NVD ↗
                        </a>
                      ) : (
                        <span className="text-stone-400">—</span>
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
