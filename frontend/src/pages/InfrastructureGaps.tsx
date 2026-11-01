import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  runGapAnalysis,
  getGaps,
  getGapSummary,
  updateGapStatus,
} from "../services/api";
import type { InfrastructureGap, GapSummary } from "../types/asset";

const SEVERITY_BADGES: Record<string, { bg: string; text: string; border: string; label: string }> = {
  HIGH: { bg: "bg-red-50", text: "text-red-800", border: "border-red-200", label: "HIGH SEVERITY" },
  MEDIUM: { bg: "bg-amber-50", text: "text-amber-800", border: "border-amber-200", label: "MEDIUM SEVERITY" },
  LOW: { bg: "bg-stone-100", text: "text-stone-700", border: "border-stone-300", label: "LOW SEVERITY" },
};

const STATUS_BADGES: Record<string, { bg: string; text: string; dot: string }> = {
  Open: { bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500" },
  "In Review": { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" },
  Resolved: { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  Accepted: { bg: "bg-stone-100", text: "text-stone-700", dot: "bg-stone-500" },
};

export default function InfrastructureGaps() {
  const [gaps, setGaps] = useState<InfrastructureGap[]>([]);
  const [summary, setSummary] = useState<GapSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [analyzing, setAnalyzing] = useState<boolean>(false);
  const [toast, setToast] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState<string>("");
  const [severityFilter, setSeverityFilter] = useState<string>("ALL");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Selected gap for detail modal
  const [selectedGap, setSelectedGap] = useState<InfrastructureGap | null>(null);
  const [statusUpdating, setStatusUpdating] = useState<boolean>(false);

  async function loadData() {
    try {
      setLoading(true);
      const [gapList, sum] = await Promise.all([
        getGaps(),
        getGapSummary().catch(() => null),
      ]);
      setGaps(gapList);
      setSummary(sum);
    } catch (err: any) {
      setToast(`Failed to load gap data: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleRunAnalysis() {
    try {
      setAnalyzing(true);
      setToast(null);
      const report = await runGapAnalysis();
      setToast(
        `Analysis complete! Detected ${report.total_gaps_detected} gaps across ${report.assets_analyzed} assets (${report.new_gaps_created} new findings).`
      );
      await loadData();
    } catch (err: any) {
      setToast(`Analysis error: ${err.message}`);
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleStatusChange(gapId: number, newStatus: "Open" | "In Review" | "Resolved" | "Accepted") {
    try {
      setStatusUpdating(true);
      const updated = await updateGapStatus(gapId, newStatus);
      setGaps((prev) => prev.map((g) => (g.id === gapId ? updated : g)));
      if (selectedGap && selectedGap.id === gapId) {
        setSelectedGap(updated);
      }
      setToast(`Gap status updated to "${newStatus}"`);
      // Refresh summary
      getGapSummary().then(setSummary).catch(() => {});
    } catch (err: any) {
      setToast(`Failed to update status: ${err.message}`);
    } finally {
      setStatusUpdating(false);
    }
  }

  // Filtered gaps list
  const filteredGaps = useMemo(() => {
    return gaps.filter((g) => {
      if (severityFilter !== "ALL" && g.severity !== severityFilter) return false;
      if (categoryFilter !== "ALL" && g.category !== categoryFilter) return false;
      if (statusFilter !== "ALL" && g.status !== statusFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchTitle = g.gap_title.toLowerCase().includes(q);
        const matchAsset = g.asset_name.toLowerCase().includes(q);
        const matchReason = g.reason.toLowerCase().includes(q);
        const matchRec = g.recommendation.toLowerCase().includes(q);
        if (!matchTitle && !matchAsset && !matchReason && !matchRec) return false;
      }
      return true;
    });
  }, [gaps, severityFilter, categoryFilter, statusFilter, search]);

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
      {/* ── HEADER ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-[#e5ded0]">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase bg-[#800020]/10 text-[#800020] border border-[#800020]/20">
              Pre-Assessment Hygiene
            </span>
            <span className="text-stone-400 text-xs">/</span>
            <span className="text-xs font-semibold text-stone-600">Inventory Verification</span>
          </div>
          <h1 className="text-2xl font-black text-stone-900 tracking-tight flex items-center gap-2">
            Infrastructure Gap Analysis
          </h1>
          <p className="text-xs text-stone-600 mt-1 max-w-2xl">
            Identifies missing, incomplete, unknown, or unsupported inventory information, security coverage blind spots,
            ICS/OT omissions, and unmapped dependencies. An infrastructure gap represents missing evidence, not a confirmed vulnerability.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleRunAnalysis}
            disabled={analyzing}
            className={`px-4 py-2 rounded-lg text-xs font-bold text-white shadow-xs transition-all flex items-center gap-2 ${
              analyzing
                ? "bg-stone-400 cursor-not-allowed"
                : "bg-[#800020] hover:bg-[#66001a] active:scale-[0.98]"
            }`}
          >
            {analyzing ? (
              <>
                <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <span>Analyzing Fleet Gaps...</span>
              </>
            ) : (
              <>
                <span>⚡ Run Gap Analysis</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── TOAST NOTIFICATION ── */}
      {toast && (
        <div className="bg-white border border-[#e5ded0] shadow-sm rounded-lg p-3 text-xs flex items-center justify-between text-stone-800">
          <div className="flex items-center gap-2">
            <span className="text-[#800020] font-bold">ℹ</span>
            <span>{toast}</span>
          </div>
          <button
            onClick={() => setToast(null)}
            className="text-stone-400 hover:text-stone-700 font-bold ml-4"
          >
            ×
          </button>
        </div>
      )}

      {/* ── KPI METRICS SUMMARY ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Total Gaps */}
        <div className="bg-[#f5f0e6] border border-[#e5ded0] rounded-xl p-4">
          <span className="text-[10px] font-bold text-stone-500 uppercase tracking-wider block">
            Total Gaps
          </span>
          <span className="text-2xl font-black text-stone-900 mt-1 block">
            {summary?.total_gaps ?? gaps.length}
          </span>
          <span className="text-[11px] text-stone-500 mt-0.5 block">
            Across {summary?.affected_assets_count ?? 0} affected assets
          </span>
        </div>

        {/* High Severity */}
        <div className="bg-red-50/60 border border-red-200/80 rounded-xl p-4">
          <span className="text-[10px] font-bold text-red-700 uppercase tracking-wider block">
            High Severity
          </span>
          <span className="text-2xl font-black text-red-800 mt-1 block">
            {summary?.high_severity ?? gaps.filter((g) => g.severity === "HIGH").length}
          </span>
          <span className="text-[11px] text-red-600 mt-0.5 block">Blocks critical assessment</span>
        </div>

        {/* Medium Severity */}
        <div className="bg-amber-50/60 border border-amber-200/80 rounded-xl p-4">
          <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider block">
            Medium Severity
          </span>
          <span className="text-2xl font-black text-amber-800 mt-1 block">
            {summary?.medium_severity ?? gaps.filter((g) => g.severity === "MEDIUM").length}
          </span>
          <span className="text-[11px] text-amber-600 mt-0.5 block">Limits visibility</span>
        </div>

        {/* Low Severity */}
        <div className="bg-stone-50 border border-stone-200 rounded-xl p-4">
          <span className="text-[10px] font-bold text-stone-600 uppercase tracking-wider block">
            Low Severity
          </span>
          <span className="text-2xl font-black text-stone-800 mt-1 block">
            {summary?.low_severity ?? gaps.filter((g) => g.severity === "LOW").length}
          </span>
          <span className="text-[11px] text-stone-500 mt-0.5 block">Minor metadata gap</span>
        </div>

        {/* Resolved Gaps */}
        <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-xl p-4">
          <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">
            Resolved / Addressed
          </span>
          <span className="text-2xl font-black text-emerald-800 mt-1 block">
            {summary?.resolved_gaps ?? gaps.filter((g) => g.status === "Resolved").length}
          </span>
          <span className="text-[11px] text-emerald-600 mt-0.5 block">Remediated gaps</span>
        </div>

        {/* Inventory Coverage Rate */}
        <div className="bg-white border border-[#e5ded0] rounded-xl p-4">
          <span className="text-[10px] font-bold text-[#800020] uppercase tracking-wider block">
            Clean Fleet Rate
          </span>
          <span className="text-2xl font-black text-stone-900 mt-1 block">
            {summary?.coverage_rate ?? 0}%
          </span>
          <span className="text-[11px] text-stone-500 mt-0.5 block">Zero active gaps</span>
        </div>
      </div>

      {/* ── CATEGORY DISTRIBUTION CHIPS ── */}
      <div className="flex flex-wrap items-center gap-2 pt-2">
        <span className="text-xs font-bold text-stone-700 mr-1">Categories:</span>
        {[
          { key: "ALL", label: "All Categories", count: gaps.length },
          { key: "Asset Information", label: "Asset Information", count: summary?.by_category?.["Asset Information"] ?? 0 },
          { key: "Security Coverage", label: "Security Coverage", count: summary?.by_category?.["Security Coverage"] ?? 0 },
          { key: "ICS/OT Coverage", label: "ICS/OT Coverage", count: summary?.by_category?.["ICS/OT Coverage"] ?? 0 },
          { key: "Dependency Gaps", label: "Dependency Gaps", count: summary?.by_category?.["Dependency Gaps"] ?? 0 },
        ].map((cat) => (
          <button
            key={cat.key}
            onClick={() => setCategoryFilter(cat.key)}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              categoryFilter === cat.key
                ? "bg-[#800020] text-white shadow-xs"
                : "bg-white border border-[#e5ded0] text-stone-700 hover:bg-[#ede5d8]"
            }`}
          >
            <span>{cat.label}</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                categoryFilter === cat.key ? "bg-white/20 text-white" : "bg-stone-100 text-stone-600"
              }`}
            >
              {cat.count}
            </span>
          </button>
        ))}
      </div>

      {/* ── FILTER & SEARCH BAR ── */}
      <div className="bg-white border border-[#e5ded0] rounded-xl p-4 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="Search by gap title, affected asset, reason, or action..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[#fbf9f5] border border-[#e5ded0] rounded-lg px-3.5 py-2 text-xs text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-1 focus:ring-[#800020] focus:border-[#800020]"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-2.5 text-stone-400 hover:text-stone-700 text-xs font-bold"
            >
              ×
            </button>
          )}
        </div>

        {/* Severity Filter */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold text-stone-600">Severity:</span>
          {["ALL", "HIGH", "MEDIUM", "LOW"].map((sev) => (
            <button
              key={sev}
              onClick={() => setSeverityFilter(sev)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                severityFilter === sev
                  ? "bg-[#800020] text-white"
                  : "bg-[#fbf9f5] border border-[#e5ded0] text-stone-700 hover:bg-[#ede5d8]"
              }`}
            >
              {sev}
            </button>
          ))}
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold text-stone-600">Status:</span>
          {["ALL", "Open", "In Review", "Resolved", "Accepted"].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                statusFilter === st
                  ? "bg-[#800020] text-white"
                  : "bg-[#fbf9f5] border border-[#e5ded0] text-stone-700 hover:bg-[#ede5d8]"
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* ── GAP TABLE ── */}
      <div className="bg-white border border-[#e5ded0] rounded-xl shadow-xs overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#e5ded0] bg-[#f5f0e6] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-black text-stone-900 uppercase tracking-wide">
              Detected Infrastructure Gaps
            </span>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-white border border-[#e5ded0] text-stone-600 font-semibold">
              {filteredGaps.length} results
            </span>
          </div>

          <span className="text-[11px] text-stone-500">
            Click any row or &quot;Investigate&quot; to review corrective action
          </span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-stone-500 text-xs">
            <div className="inline-block animate-spin h-6 w-6 border-2 border-[#800020] border-t-transparent rounded-full mb-3" />
            <p>Loading infrastructure gap findings...</p>
          </div>
        ) : filteredGaps.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-[#f5f0e6] text-[#800020] flex items-center justify-center mx-auto text-xl font-bold">
              ✓
            </div>
            <h3 className="text-sm font-bold text-stone-800">No Infrastructure Gaps Match Criteria</h3>
            <p className="text-xs text-stone-500 max-w-md mx-auto">
              {gaps.length === 0
                ? "No infrastructure gaps have been detected yet. Click 'Run Gap Analysis' above to inspect your asset fleet."
                : "No gaps match your active search and filter selections. Try clearing your filters."}
            </p>
            {gaps.length === 0 && (
              <button
                onClick={handleRunAnalysis}
                className="px-4 py-2 bg-[#800020] text-white rounded-lg text-xs font-bold hover:bg-[#66001a]"
              >
                Run Initial Gap Analysis
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#e5ded0] bg-[#faf7f2] text-stone-500 uppercase tracking-wider text-[10px] font-bold">
                  <th className="py-3 px-4">Severity</th>
                  <th className="py-3 px-4">Gap Title &amp; Category</th>
                  <th className="py-3 px-4">Affected Asset</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Recommended Corrective Action</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ede5d8]">
                {filteredGaps.map((gap) => {
                  const sevBadge = SEVERITY_BADGES[gap.severity] || SEVERITY_BADGES.LOW;
                  const stBadge = STATUS_BADGES[gap.status] || STATUS_BADGES.Open;

                  return (
                    <tr
                      key={gap.id}
                      onClick={() => setSelectedGap(gap)}
                      className="hover:bg-[#fbf9f5] cursor-pointer transition-colors"
                    >
                      {/* Severity */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border ${sevBadge.bg} ${sevBadge.text} ${sevBadge.border}`}
                        >
                          {gap.severity}
                        </span>
                      </td>

                      {/* Title & Category */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-stone-900">{gap.gap_title}</div>
                        <div className="text-[11px] text-stone-500 mt-0.5 flex items-center gap-1.5">
                          <span className="font-medium text-stone-700">{gap.category}</span>
                          <span>•</span>
                          <span className="font-mono text-[10px] text-stone-400">{gap.gap_type}</span>
                        </div>
                      </td>

                      {/* Affected Asset */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="font-bold text-stone-900">{gap.asset_name}</div>
                        <div className="flex items-center gap-1.5 mt-0.5 text-[10px]">
                          <span className="px-1.5 py-0.2 rounded bg-stone-100 text-stone-600 font-medium">
                            {gap.asset_type}
                          </span>
                          <span
                            className={`px-1.5 py-0.2 rounded font-semibold ${
                              gap.criticality === "Critical"
                                ? "bg-red-100 text-red-800"
                                : gap.criticality === "High"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-stone-100 text-stone-600"
                            }`}
                          >
                            {gap.criticality}
                          </span>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${stBadge.bg} ${stBadge.text}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${stBadge.dot}`} />
                          {gap.status}
                        </span>
                      </td>

                      {/* Recommended Action preview */}
                      <td className="py-3.5 px-4 max-w-xs truncate text-stone-600">
                        {gap.recommendation}
                      </td>

                      {/* Action */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedGap(gap);
                          }}
                          className="px-2.5 py-1 rounded text-xs font-bold text-[#800020] bg-[#800020]/10 hover:bg-[#800020] hover:text-white transition-all"
                        >
                          Investigate →
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

      {/* ── DETAIL INVESTIGATION MODAL ── */}
      {selectedGap && (
        <div className="fixed inset-0 z-50 bg-stone-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#fbf9f5] border border-[#e5ded0] rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col">
            {/* Header */}
            <div className="p-5 border-b border-[#e5ded0] bg-[#f5f0e6] flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border ${
                      SEVERITY_BADGES[selectedGap.severity]?.bg
                    } ${SEVERITY_BADGES[selectedGap.severity]?.text} ${
                      SEVERITY_BADGES[selectedGap.severity]?.border
                    }`}
                  >
                    {selectedGap.severity} SEVERITY
                  </span>
                  <span className="text-stone-400 text-xs">/</span>
                  <span className="text-xs font-semibold text-stone-600">{selectedGap.category}</span>
                </div>
                <h3 className="text-base font-black text-stone-900">{selectedGap.gap_title}</h3>
                <div className="text-xs text-stone-500 mt-1 flex items-center gap-2">
                  <span>Target Asset:</span>
                  <Link
                    to={`/assets/${selectedGap.asset_id}`}
                    className="font-bold text-[#800020] hover:underline"
                  >
                    {selectedGap.asset_name}
                  </Link>
                  <span>({selectedGap.asset_type})</span>
                </div>
              </div>

              <button
                onClick={() => setSelectedGap(null)}
                className="text-stone-400 hover:text-stone-800 text-lg font-black p-1"
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-5 text-xs text-stone-800">
              {/* Asset Snapshot Card */}
              <div className="bg-white border border-[#e5ded0] rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-[10px] text-stone-400 uppercase font-bold block">Asset Criticality</span>
                  <span className="font-bold text-stone-800">{selectedGap.criticality}</span>
                </div>
                <div>
                  <span className="text-[10px] text-stone-400 uppercase font-bold block">Boundary Exposure</span>
                  <span className="font-bold text-stone-800">{selectedGap.exposure}</span>
                </div>
                <div>
                  <span className="text-[10px] text-stone-400 uppercase font-bold block">Gap Identifier</span>
                  <span className="font-mono text-[10px] text-stone-600">{selectedGap.gap_type}</span>
                </div>
                <Link
                  to={`/assets/${selectedGap.asset_id}`}
                  className="px-2.5 py-1 rounded bg-[#f5f0e6] border border-[#e5ded0] text-[11px] font-bold text-stone-700 hover:text-[#800020]"
                >
                  View Asset →
                </Link>
              </div>

              {/* Section 1: Why This Gap Matters */}
              <div className="bg-red-50/50 border border-red-200/70 rounded-xl p-4 space-y-1.5">
                <div className="flex items-center gap-2 text-red-800 font-bold">
                  <span>⚠️</span>
                  <span>Why This Gap Matters (Operational &amp; Assessment Risk)</span>
                </div>
                <p className="text-stone-700 leading-relaxed">{selectedGap.reason}</p>
                <div className="text-[11px] text-stone-500 pt-1 border-t border-red-100">
                  Note: An infrastructure gap represents missing or unverified evidence. It is not an active exploit or confirmed vulnerability.
                </div>
              </div>

              {/* Section 2: Recommended Action */}
              <div className="bg-emerald-50/50 border border-emerald-200/70 rounded-xl p-4 space-y-1.5">
                <div className="flex items-center gap-2 text-emerald-800 font-bold">
                  <span>🛠</span>
                  <span>Recommended Corrective Action</span>
                </div>
                <p className="text-stone-800 leading-relaxed font-medium">{selectedGap.recommendation}</p>
              </div>

              {/* Section 3: Status & Lifecycle Transition */}
              <div className="bg-white border border-[#e5ded0] rounded-xl p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-stone-900">Current Lifecycle Status</span>
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                      STATUS_BADGES[selectedGap.status]?.bg
                    } ${STATUS_BADGES[selectedGap.status]?.text}`}
                  >
                    <span className={`w-2 h-2 rounded-full ${STATUS_BADGES[selectedGap.status]?.dot}`} />
                    {selectedGap.status}
                  </span>
                </div>

                <div className="pt-2 border-t border-[#ede5d8]">
                  <span className="text-[11px] text-stone-500 block mb-2">
                    Update status based on inventory audit or operational review:
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {(["Open", "In Review", "Resolved", "Accepted"] as const).map((st) => (
                      <button
                        key={st}
                        disabled={statusUpdating || selectedGap.status === st}
                        onClick={() => handleStatusChange(selectedGap.id, st)}
                        className={`py-1.5 px-2.5 rounded-lg text-xs font-bold transition-all border ${
                          selectedGap.status === st
                            ? "bg-[#800020] text-white border-[#800020]"
                            : "bg-[#fbf9f5] border-[#e5ded0] text-stone-700 hover:bg-[#ede5d8]"
                        } ${statusUpdating ? "opacity-50 cursor-not-allowed" : ""}`}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-[#e5ded0] bg-[#f5f0e6] flex items-center justify-between text-xs text-stone-500">
              <span className="font-mono text-[10px]">FP: {selectedGap.fingerprint}</span>
              <button
                onClick={() => setSelectedGap(null)}
                className="px-4 py-1.5 bg-stone-200 hover:bg-stone-300 text-stone-800 rounded-lg font-bold"
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
