import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { getAssessmentResults, getActionPlan, quarantineAsset, resolveFinding } from "../services/api";
import type { AssetVulnerability, ActionPlanProfile } from "../types/asset";

const SEVERITY_BADGES: Record<string, { bg: string; text: string; border: string }> = {
  CRITICAL: { bg: "bg-[#800020]/10", text: "text-[#800020]", border: "border-[#800020]/30" },
  HIGH: { bg: "bg-red-50", text: "text-red-700", border: "border-red-200" },
  MEDIUM: { bg: "bg-amber-50", text: "text-amber-800", border: "border-amber-200" },
  LOW: { bg: "bg-emerald-50", text: "text-emerald-800", border: "border-emerald-200" },
};

export default function InfrastructureMap() {
  const [findings, setFindings] = useState<AssetVulnerability[]>([]);
  const [selectedFinding, setSelectedFinding] = useState<AssetVulnerability | null>(null);
  const [actionPlan, setActionPlan] = useState<ActionPlanProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingPlan, setLoadingPlan] = useState(false);

  // Table Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [severityFilter, setSeverityFilter] = useState("ALL");

  // Modal & Approach View State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeDeckMode, setActiveDeckMode] = useState<"detailed" | "impact_action">("detailed");
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [showDetailedInB, setShowDetailedInB] = useState(false);
  const [statusNotification, setStatusNotification] = useState<string | null>(null);

  // Load findings on mount
  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const results = await getAssessmentResults({ limit: 100 });
        setFindings(results);
        if (results.length > 0) {
          setSelectedFinding(results[0]);
        }
      } catch (err) {
        console.error("Failed to load assessment results", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Fetch Action Plan whenever selectedFinding changes
  useEffect(() => {
    if (!selectedFinding) return;
    async function loadPlan() {
      setLoadingPlan(true);
      try {
        const plan = await getActionPlan(
          selectedFinding!.vulnerability.cve_id,
          selectedFinding!.asset_id,
          selectedFinding!.matched_software ?? undefined
        );
        setActionPlan(plan);
      } catch (err) {
        console.error("Failed to load action plan", err);
      } finally {
        setLoadingPlan(false);
      }
    }
    loadPlan();
  }, [selectedFinding]);

  // Filtered findings list
  const filteredFindings = useMemo(() => {
    return findings.filter((f) => {
      const matchSearch =
        searchQuery === "" ||
        f.vulnerability.cve_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (f.matched_software?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false) ||
        (f.vulnerability.description?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false) ||
        String(f.asset_id).includes(searchQuery);

      const sev = f.vulnerability.severity?.toUpperCase() || "UNKNOWN";
      const matchSeverity = severityFilter === "ALL" || sev === severityFilter;

      return matchSearch && matchSeverity;
    });
  }, [findings, searchQuery, severityFilter]);

  function handleSelectFinding(finding: AssetVulnerability) {
    setSelectedFinding(finding);
    const visualElement = document.getElementById("visual-map-section");
    if (visualElement) {
      visualElement.scrollIntoView({ behavior: "smooth" });
    }
  }

  function handleOpenModal() {
    setIsModalOpen(true);
  }

  function handleCloseModal() {
    setIsModalOpen(false);
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 2500);
  }

  async function handleQuarantine(assetId: number) {
    try {
      const res = await quarantineAsset(assetId);
      setStatusNotification(res.message);
      setTimeout(() => setStatusNotification(null), 4000);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Quarantine failed");
    }
  }

  async function handleResolve(findingId: number) {
    try {
      const res = await resolveFinding(findingId);
      setStatusNotification(res.message);
      setTimeout(() => setStatusNotification(null), 4000);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Resolve failed");
    }
  }

  const assetName = actionPlan?.asset_name || `Asset #${selectedFinding?.asset_id || 1}`;
  const cveId = selectedFinding?.vulnerability.cve_id || "CVE-2022-0847";
  const severity = selectedFinding?.vulnerability.severity?.toUpperCase() || "HIGH";
  const software = selectedFinding?.matched_software || "System Component";
  const cvss = selectedFinding?.vulnerability.cvss_score;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[#fbf9f5] text-stone-900 flex flex-col relative font-sans">
      {/* ── STATUS NOTIFICATION TOAST ────────────────────────────────────────── */}
      {statusNotification && (
        <div className="fixed top-16 right-6 z-50 bg-[#800020] text-white px-4 py-2.5 rounded-xl shadow-lg text-xs font-bold flex items-center gap-2">
          <span>✓</span>
          <span>{statusNotification}</span>
        </div>
      )}

      {/* ── TOP EXECUTIVE TITLE BAR ─────────────────────────────────────────── */}
      <div className="bg-[#f5f0e6] border-b border-[#e5ded0] px-6 py-5">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="w-3 h-3 rounded-full bg-[#800020]" />
              <h1 className="text-2xl font-black tracking-tight text-[#800020]">
                Infrastructure Map &amp; Security Findings
              </h1>
              <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-white text-[#800020] border border-[#d6ccbe]">
                {findings.length} DETECTED RISKS
              </span>
            </div>
            <p className="text-xs text-stone-600 mt-1.5 max-w-2xl leading-relaxed">
              Review all identified security assessment risks in the table below. Selecting any row updates the simulated network map and reveals the What-If impact analysis and remediation actions.
            </p>
          </div>

          <div className="flex items-center gap-2 font-mono text-xs">
            <span className="text-stone-500 font-medium">Selected Asset:</span>
            <span className="text-[#800020] font-bold bg-white px-3 py-1.5 rounded-lg border border-[#e5ded0]">
              {cveId} ({software})
            </span>
          </div>
        </div>
      </div>

      <div className="p-6 max-w-7xl mx-auto w-full space-y-8">
        {/* ══════════════════════════════════════════════════════════════════════ */}
        {/* SECTION 1: DETECTED VULNERABILITY FINDINGS TABLE (PRIMARY FOCUS)       */}
        {/* ══════════════════════════════════════════════════════════════════════ */}
        <div className="bg-white rounded-2xl border border-[#e5ded0] shadow-sm overflow-hidden">
          {/* Table Header & Controls */}
          <div className="p-5 border-b border-[#e5ded0] flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#faf7f2]">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[#800020] text-sm">📋</span>
                <h2 className="text-sm font-black text-[#800020] uppercase tracking-wider font-mono">
                  1. Detected Vulnerabilities &amp; Assessment Findings
                </h2>
              </div>
              <p className="text-xs text-stone-500 mt-0.5">
                Click any row in the assessment findings below to map its perimeter position.
              </p>
            </div>

            {/* Search & Filter */}
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <div className="relative w-full sm:w-64">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-stone-400 text-xs">🔍</span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter CVE, software, asset..."
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-[#d6ccbe] rounded-lg text-stone-800 placeholder-stone-400 focus:outline-none focus:border-[#800020] font-mono"
                />
              </div>

              <div className="flex items-center gap-1 bg-[#ede5d8] p-1 rounded-lg border border-[#d6ccbe] font-mono text-xs">
                {["ALL", "CRITICAL", "HIGH", "MEDIUM", "LOW"].map((level) => (
                  <button
                    key={level}
                    onClick={() => setSeverityFilter(level)}
                    className={`px-2.5 py-1 rounded text-[11px] font-bold transition cursor-pointer ${
                      severityFilter === level
                        ? "bg-[#800020] text-white"
                        : "text-stone-700 hover:text-stone-900"
                    }`}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Table Content */}
          <div className="overflow-x-auto max-h-[380px] overflow-y-auto">
            {loading ? (
              <div className="p-12 text-center text-stone-500 font-mono text-xs">Loading detected security assessment findings...</div>
            ) : filteredFindings.length === 0 ? (
              <div className="p-12 text-center text-stone-500 font-mono text-xs">No vulnerabilities match the active filter.</div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-[#f5f0e6] text-stone-600 font-mono uppercase tracking-wider sticky top-0 z-10 border-b border-[#e5ded0]">
                  <tr>
                    <th className="py-3 px-4 w-28">Target Asset</th>
                    <th className="py-3 px-4">Component</th>
                    <th className="py-3 px-4">CVE Identifier</th>
                    <th className="py-3 px-4">Severity</th>
                    <th className="py-3 px-4">CVSS</th>
                    <th className="py-3 px-4">Technical Finding Description</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f0eae0] font-mono">
                  {filteredFindings.map((finding) => {
                    const isSelected = selectedFinding?.id === finding.id;
                    const sev = finding.vulnerability.severity?.toUpperCase() || "UNKNOWN";
                    const badge = SEVERITY_BADGES[sev] || SEVERITY_BADGES.MEDIUM;
                    return (
                      <tr
                        key={finding.id}
                        onClick={() => handleSelectFinding(finding)}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? "bg-[#f3ede2] border-l-4 border-[#800020] text-stone-900 font-semibold"
                            : "hover:bg-[#faf6f0] text-stone-700"
                        }`}
                      >
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="font-bold text-stone-900">Asset #{finding.asset_id}</div>
                          <div className="text-[10px] text-stone-500">Host Asset</div>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className="font-bold text-stone-800">{finding.matched_software || "System"}</span>
                          {finding.matched_version && (
                            <span className="text-[10px] text-stone-500 block">v{finding.matched_version}</span>
                          )}
                        </td>
                        <td className="py-3 px-4 font-bold text-[#800020] whitespace-nowrap">
                          {finding.vulnerability.cve_id}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold border ${badge.bg} ${badge.text} ${badge.border}`}>
                            {sev}
                          </span>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          {finding.vulnerability.cvss_score !== null && finding.vulnerability.cvss_score !== undefined ? (
                            <span className={finding.vulnerability.cvss_score >= 8 ? "text-[#800020] font-bold" : "text-amber-700 font-bold"}>
                              {finding.vulnerability.cvss_score.toFixed(1)}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="py-3 px-4 text-stone-600 max-w-md line-clamp-2 font-sans text-xs">
                          {finding.vulnerability.description}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          {isSelected ? (
                            <span className="px-3 py-1 rounded-lg text-xs font-bold bg-[#800020] text-white flex items-center justify-end gap-1 ml-auto w-fit">
                              <span>Visualizing</span>
                              <span>↓</span>
                            </span>
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectFinding(finding);
                              }}
                              className="px-3 py-1 rounded-lg text-xs font-bold text-[#800020] hover:bg-[#800020] hover:text-white border border-[#800020]/30 transition"
                            >
                              Visualize →
                            </button>
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

        {/* ══════════════════════════════════════════════════════════════════════ */}
        {/* SECTION 2: SIMULATED NETWORK VISUALIZATION CANVAS (WARM BEIGE PALETTE) */}
        {/* ══════════════════════════════════════════════════════════════════════ */}
        <div id="visual-map-section" className="space-y-3">
          {/* Subheader & 2-Way View Toggle */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[#e5ded0]">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[#800020] text-sm">🌐</span>
                <h2 className="text-sm font-black text-[#800020] uppercase tracking-wider font-mono">
                  2. Network Perimeter Visualization &amp; Remediation Map
                </h2>
              </div>
              <p className="text-xs text-stone-600 mt-0.5">
                Click the maroon callout card on the affected central computer to open the investigation modal.
              </p>
            </div>

            {/* Approach A / Approach B Switcher */}
            <div className="flex items-center bg-[#ede5d8] p-1 rounded-xl border border-[#d6ccbe] font-mono text-xs">
              <button
                onClick={() => setActiveDeckMode("detailed")}
                className={`px-3.5 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                  activeDeckMode === "detailed"
                    ? "bg-[#800020] text-white shadow-xs"
                    : "text-stone-700 hover:text-stone-900"
                }`}
              >
                Approach A (Side-by-Side)
              </button>
              <button
                onClick={() => setActiveDeckMode("impact_action")}
                className={`px-3.5 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                  activeDeckMode === "impact_action"
                    ? "bg-[#800020] text-white shadow-xs"
                    : "text-stone-700 hover:text-stone-900"
                }`}
              >
                Approach B (Impact → Remediation)
              </button>
            </div>
          </div>

          {/* Network Canvas (Clean Beige & Maroon Solid Design) */}
          <div className="relative rounded-2xl overflow-hidden bg-[#f4efe6] border-2 border-[#d6ccbe] shadow-sm flex items-center justify-center p-8 h-[480px]">
            {/* Subtle Grid dots */}
            <div className="absolute inset-0 bg-[radial-gradient(#d6ccbe_1.5px,transparent_1.5px)] [background-size:26px_26px] opacity-70 pointer-events-none" />

            {/* Network Canvas Elements Wrapper */}
            <div
              className={`relative w-full max-w-4xl h-full transition-all duration-500 flex items-center justify-center ${
                isModalOpen ? "scale-90 filter blur-xs opacity-30 pointer-events-none" : "scale-100"
              }`}
            >
              {/* Illustrative Connectivity Lines */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none stroke-[#c4b5a0]">
                <line x1="50%" y1="50%" x2="16%" y2="20%" strokeDasharray="4 4" strokeWidth="1.5" />
                <line x1="50%" y1="50%" x2="84%" y2="18%" strokeDasharray="4 4" strokeWidth="1.5" />
                <line x1="50%" y1="50%" x2="14%" y2="80%" strokeDasharray="4 4" strokeWidth="1.5" />
                <line x1="50%" y1="50%" x2="86%" y2="82%" strokeDasharray="4 4" strokeWidth="1.5" />
              </svg>

              {/* Background Network Elements (Solid Light Beige Surfaces) */}
              <div className="absolute top-[12%] left-[10%] flex flex-col items-center filter blur-[1px] opacity-70 select-none">
                <div className="w-12 h-12 rounded-xl bg-white border border-[#d6ccbe] flex items-center justify-center text-stone-600 shadow-xs">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                  </svg>
                </div>
                <span className="text-xs font-bold text-stone-700 mt-1 font-mono">Perimeter Gateway</span>
                <span className="text-[10px] text-stone-500 font-mono">10.0.1.1</span>
              </div>

              <div className="absolute top-[10%] right-[10%] flex flex-col items-center filter blur-[1px] opacity-70 select-none">
                <div className="w-12 h-12 rounded-xl bg-white border border-[#d6ccbe] flex items-center justify-center text-stone-600 shadow-xs">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 00-9.78 2.096A4.001 4.001 0 003 15z" />
                  </svg>
                </div>
                <span className="text-xs font-bold text-stone-700 mt-1 font-mono">Cloud Directory</span>
                <span className="text-[10px] text-stone-500 font-mono">cloud.internal</span>
              </div>

              <div className="absolute bottom-[10%] left-[8%] flex flex-col items-center filter blur-[1px] opacity-70 select-none">
                <div className="w-12 h-12 rounded-xl bg-white border border-[#d6ccbe] flex items-center justify-center text-stone-600 shadow-xs">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                  </svg>
                </div>
                <span className="text-xs font-bold text-stone-700 mt-1 font-mono">Database Node</span>
                <span className="text-[10px] text-stone-500 font-mono">10.0.2.25</span>
              </div>

              <div className="absolute bottom-[10%] right-[8%] flex flex-col items-center filter blur-[1px] opacity-70 select-none">
                <div className="w-12 h-12 rounded-xl bg-white border border-[#d6ccbe] flex items-center justify-center text-stone-600 shadow-xs">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                  </svg>
                </div>
                <span className="text-xs font-bold text-stone-700 mt-1 font-mono">Backup Vault</span>
                <span className="text-[10px] text-stone-500 font-mono">10.0.4.50</span>
              </div>

              {/* ── CENTRAL WORKSTATION (AFFECTED ASSET) ────────────────────────── */}
              <div className="relative z-10 flex flex-col items-center">
                <div className="w-72 bg-white border-2 border-[#800020] rounded-2xl p-5 shadow-lg flex flex-col items-center text-center">
                  <div className="w-14 h-14 rounded-xl bg-[#f5f0e6] border border-[#d6ccbe] flex items-center justify-center text-[#800020] mb-2.5 relative">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <span className="absolute top-1.5 right-1.5 w-3 h-3 rounded-full bg-[#800020]" />
                  </div>

                  <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#800020] bg-[#800020]/10 px-2.5 py-0.5 rounded border border-[#800020]/20 mb-1">
                    AFFECTED ASSET • COMPROMISED
                  </span>
                  <h3 className="text-base font-black text-stone-900 tracking-tight">
                    {assetName}
                  </h3>
                  <div className="text-xs text-stone-600 font-mono mt-1">
                    Component: <span className="text-[#800020] font-bold">{software}</span>
                  </div>
                </div>

                {/* ── FLOATING VULNERABILITY CALLOUT CARD ─────────────────────────── */}
                <div className="absolute -top-16 -right-24 md:-right-48 z-20">
                  <button
                    onClick={handleOpenModal}
                    className="bg-white hover:bg-[#faf7f2] border-2 border-[#800020] text-left rounded-2xl p-4 shadow-xl max-w-xs transition-all hover:scale-105 cursor-pointer group"
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[#800020] text-sm">⚠️</span>
                        <span className="text-[11px] font-mono font-bold uppercase tracking-wider px-2.5 py-0.5 rounded bg-[#800020]/10 text-[#800020] border border-[#800020]/20">
                          {severity} SEVERITY
                        </span>
                      </div>
                      <span className="text-xs font-mono text-[#800020] font-bold">
                        {cveId}
                      </span>
                    </div>

                    <h4 className="text-xs font-black text-stone-900 group-hover:text-[#800020] line-clamp-2 leading-snug">
                      {actionPlan?.remedy.title || `${software} Vulnerability`}
                    </h4>

                    <div className="mt-3 pt-2.5 border-t border-[#e5ded0] flex items-center justify-between text-xs font-mono text-[#800020] font-bold">
                      <span>Click to investigate →</span>
                      <span className="transition-transform group-hover:translate-x-1 font-bold">🔍</span>
                    </div>
                  </button>
                </div>
              </div>
            </div>

            <div className="absolute bottom-3 left-6 text-xs text-stone-500 font-mono flex items-center gap-2 pointer-events-none">
              <span className="w-2 h-2 rounded-full bg-[#800020]" />
              <span>Conceptual network perimeter. Central workstation represents the currently selected vulnerable asset.</span>
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {/* SECTION 3: DETAILED INVESTIGATION MODAL (APPROACH A & APPROACH B)         */}
      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-stone-900/60 backdrop-blur-xs">
          <div className="bg-white border-2 border-[#d6ccbe] rounded-3xl shadow-2xl max-w-6xl w-full max-h-[92vh] flex flex-col overflow-hidden text-stone-900">
            {/* ── MODAL HEADER ────────────────────────────────────────────────── */}
            <div className="p-6 border-b border-[#e5ded0] bg-[#f5f0e6] flex flex-col md:flex-row md:items-start justify-between gap-4">
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2 font-mono">
                  <span className="text-sm font-bold text-[#800020] bg-white px-3 py-1 rounded-lg border border-[#d6ccbe]">
                    {cveId}
                  </span>
                  <span
                    className={`text-xs px-3 py-1 rounded-lg font-bold border ${
                      severity === "CRITICAL"
                        ? "bg-[#800020]/10 text-[#800020] border-[#800020]/30"
                        : "bg-red-50 text-red-700 border-red-200"
                    }`}
                  >
                    {severity} (CVSS {cvss ?? "N/A"})
                  </span>
                  {actionPlan?.consequences.domain_category && (
                    <span className="text-xs font-bold text-stone-800 bg-[#ede5d8] px-3 py-1 rounded-lg">
                      {actionPlan.consequences.domain_category}
                    </span>
                  )}
                </div>

                <h2 className="text-xl md:text-2xl font-black text-stone-900 tracking-tight">
                  {actionPlan?.remedy.title || `${software} Security Advisory`}
                </h2>

                <p className="text-xs text-stone-600 font-mono flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span>Affected Host: <strong className="text-stone-900">{assetName}</strong></span>
                  <span>•</span>
                  <span>Component: <strong className="text-[#800020]">{software}</strong></span>
                </p>
              </div>

              {/* View Toggle & Close Button */}
              <div className="flex items-center gap-3 self-end md:self-start">
                <div className="bg-[#ede5d8] border border-[#d6ccbe] p-1 rounded-xl flex items-center font-mono text-xs">
                  <button
                    onClick={() => setActiveDeckMode("detailed")}
                    className={`px-3.5 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                      activeDeckMode === "detailed"
                        ? "bg-[#800020] text-white shadow-xs"
                        : "text-stone-700 hover:text-stone-900"
                    }`}
                  >
                    Approach A (Side-by-Side)
                  </button>
                  <button
                    onClick={() => setActiveDeckMode("impact_action")}
                    className={`px-3.5 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                      activeDeckMode === "impact_action"
                        ? "bg-[#800020] text-white shadow-xs"
                        : "text-stone-700 hover:text-stone-900"
                    }`}
                  >
                    Approach B (Impact → Remediation)
                  </button>
                </div>

                <button
                  onClick={handleCloseModal}
                  className="w-9 h-9 rounded-xl bg-white hover:bg-stone-100 border border-[#d6ccbe] text-stone-700 font-bold flex items-center justify-center transition cursor-pointer"
                  title="Close modal"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* ── MODAL BODY (SCROLLABLE) ──────────────────────────────────────── */}
            <div className="p-6 overflow-y-auto flex-1 space-y-6 bg-[#fbf9f5]">
              {loadingPlan || !actionPlan ? (
                <div className="p-16 text-center text-stone-500 font-mono text-sm space-y-2">
                  <div className="text-2xl">⏳</div>
                  <p>Fetching real-time What-If consequences and remediation steps...</p>
                </div>
              ) : activeDeckMode === "detailed" ? (
                /* ══════════════════════════════════════════════════════════════════ */
                /* APPROACH A: DETAILED SIDE-BY-SIDE MODAL                            */
                /* ══════════════════════════════════════════════════════════════════ */
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* LEFT COLUMN: WHAT-IF ANALYSIS (MAROON / RISK) */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 pb-2.5 border-b border-[#800020]/20">
                      <span className="text-[#800020] text-lg font-bold">⚠️</span>
                      <h3 className="text-sm font-black text-[#800020] uppercase tracking-wider font-mono">
                        What if this vulnerability is exploited?
                      </h3>
                    </div>

                    <div className="bg-white border border-[#e5ded0] rounded-xl p-4 space-y-1.5 shadow-xs">
                      <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#800020] block">
                        Technical Exploit Mechanism
                      </span>
                      <p className="text-xs md:text-sm text-stone-700 leading-relaxed">
                        {actionPlan.what_if_not_cured.exploit_mechanism}
                      </p>
                    </div>

                    <div className="bg-white border border-[#e5ded0] rounded-xl p-4 space-y-1.5 shadow-xs">
                      <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#800020] block">
                        Attacker Capabilities Once Exploited
                      </span>
                      <p className="text-xs md:text-sm text-stone-700 leading-relaxed">
                        {actionPlan.what_if_not_cured.attacker_capability}
                      </p>
                    </div>

                    <div className="bg-white border border-[#e5ded0] rounded-xl p-4 space-y-1.5 shadow-xs">
                      <span className="text-xs font-mono font-bold uppercase tracking-wider text-stone-600 block">
                        Mission &amp; Infrastructure Consequence
                      </span>
                      <p className="text-xs md:text-sm text-stone-700 leading-relaxed">
                        {actionPlan.consequences.primary_impact || actionPlan.consequences.clinical_impact}
                      </p>
                    </div>

                    <div className="bg-white border border-[#e5ded0] rounded-xl p-4 space-y-1.5 shadow-xs">
                      <span className="text-xs font-mono font-bold uppercase tracking-wider text-stone-600 block">
                        Operational Service Disruption
                      </span>
                      <p className="text-xs md:text-sm text-stone-700 leading-relaxed">
                        {actionPlan.consequences.operational_impact}
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="bg-white border border-[#e5ded0] rounded-xl p-4 space-y-1 shadow-xs">
                        <span className="text-xs font-mono text-stone-500 block">
                          Legal &amp; Regulatory
                        </span>
                        <p className="text-xs text-stone-700">
                          {actionPlan.consequences.legal_regulatory}
                        </p>
                      </div>

                      <div className="bg-white border border-[#e5ded0] rounded-xl p-4 space-y-1 shadow-xs">
                        <span className="text-xs font-mono text-[#800020] block font-bold">
                          Financial Blast Radius
                        </span>
                        <p className="text-sm font-mono font-black text-[#800020]">
                          {actionPlan.consequences.financial_cost}
                        </p>
                      </div>
                    </div>

                    <div className="bg-white border border-[#e5ded0] rounded-xl p-4 flex items-center justify-between text-xs font-mono shadow-xs">
                      <div>
                        <span className="text-stone-500 block text-[11px]">EPSS Exploit Likelihood:</span>
                        <span className="text-[#800020] font-black text-sm">
                          {actionPlan.what_if_not_cured.epss_probability}
                        </span>
                      </div>
                      <span className="text-xs font-bold px-3 py-1 rounded-md bg-[#800020]/10 text-[#800020] border border-[#800020]/20">
                        {actionPlan.what_if_not_cured.weaponized_status}
                      </span>
                    </div>
                  </div>

                  {/* RIGHT COLUMN: REMEDIATION INSTRUCTIONS (ACTION / FOREST GREEN) */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 pb-2.5 border-b border-emerald-700/20">
                      <span className="text-emerald-700 text-lg font-bold">🛡️</span>
                      <h3 className="text-sm font-black text-emerald-800 uppercase tracking-wider font-mono">
                        How to remediate
                      </h3>
                    </div>

                    <div className="space-y-3">
                      <div className="bg-white border border-[#e5ded0] rounded-xl p-4 shadow-xs">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-mono font-bold text-emerald-800 uppercase">
                            01 — Official Mandate &amp; Advisory
                          </span>
                          {actionPlan.remedy.due_date && (
                            <span className="text-xs font-mono bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-0.5 rounded">
                              Due: {actionPlan.remedy.due_date}
                            </span>
                          )}
                        </div>
                        <p className="text-xs md:text-sm text-stone-700">
                          {actionPlan.remedy.cisa_mandate || "Apply vendor security updates immediately."}
                        </p>
                      </div>

                      {/* Terminal Code Box in Warm Tone */}
                      <div className="bg-[#292524] text-white border border-stone-700 rounded-xl p-4 space-y-2 shadow-xs">
                        <div className="flex items-center justify-between text-xs font-mono text-stone-400">
                          <span className="text-emerald-400 font-bold">02 — Terminal Patch Command</span>
                          <button
                            onClick={() => copyToClipboard(actionPlan.remedy.patch_command)}
                            className="text-xs bg-[#44403c] hover:bg-[#57534e] text-white px-3 py-1 rounded transition cursor-pointer font-bold"
                          >
                            {copiedCmd ? "✓ Copied!" : "📋 Copy Command"}
                          </button>
                        </div>
                        <pre className="font-mono text-xs text-emerald-300 overflow-x-auto whitespace-pre-wrap bg-black/40 p-3 rounded-lg border border-stone-800">
                          {actionPlan.remedy.patch_command}
                        </pre>
                      </div>

                      <div className="bg-white border border-[#e5ded0] rounded-xl p-4 space-y-1 shadow-xs">
                        <span className="text-xs font-mono font-bold text-stone-600 uppercase block">
                          03 — Hardening Workaround
                        </span>
                        <p className="text-xs md:text-sm text-stone-700">
                          {actionPlan.remedy.workaround}
                        </p>
                      </div>

                      <div className="bg-white border border-[#e5ded0] rounded-xl p-4 space-y-1 shadow-xs">
                        <span className="text-xs font-mono font-bold text-stone-600 uppercase block">
                          04 — Firewall Isolation Rule
                        </span>
                        <code className="block font-mono text-xs text-stone-800 bg-[#f5f0e6] p-2.5 rounded border border-[#d6ccbe] overflow-x-auto">
                          {actionPlan.remedy.firewall_rule}
                        </code>
                      </div>

                      <div className="bg-white border border-[#e5ded0] rounded-xl p-4 space-y-1 shadow-xs">
                        <span className="text-xs font-mono font-bold text-stone-600 uppercase block">
                          05 — Post-Patch Validation
                        </span>
                        <p className="text-xs md:text-sm text-stone-700 font-mono">
                          {actionPlan.remedy.verification_step}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* ══════════════════════════════════════════════════════════════════ */
                /* APPROACH B: IMPACT → REMEDIATION ARROW FLOW                        */
                /* ══════════════════════════════════════════════════════════════════ */
                <div className="space-y-4">
                  <p className="text-xs md:text-sm text-stone-600 border-b border-[#e5ded0] pb-3">
                    Understand the potential impact and the actions that can help prevent or resolve it.
                  </p>

                  <div className="space-y-3">
                    {/* Row 1 */}
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-center gap-4 bg-white border border-[#e5ded0] p-5 rounded-xl shadow-xs">
                      <div className="bg-[#800020]/5 border border-[#800020]/20 rounded-xl p-4 space-y-1.5">
                        <div className="flex items-center gap-2 text-[#800020]">
                          <span>⚠️</span>
                          <span className="text-xs font-mono font-bold uppercase">
                            Potential Impact: Service Instability &amp; Crash
                          </span>
                        </div>
                        <p className="text-xs text-stone-700 leading-relaxed">
                          Attacker exploits component vulnerability to crash active services or execute unauthorized commands.
                        </p>
                      </div>

                      <div className="flex items-center justify-center text-[#800020] text-xl font-bold px-2">
                        <span className="hidden md:inline">→</span>
                        <span className="md:hidden text-xs text-stone-500 font-mono">↓ REMEDIATION:</span>
                      </div>

                      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-1.5">
                        <div className="flex items-center gap-2 text-emerald-800">
                          <span>🛡️</span>
                          <span className="text-xs font-mono font-bold uppercase">
                            Remediation Action: Apply Package Security Patch
                          </span>
                        </div>
                        <p className="text-xs text-stone-700 leading-relaxed">
                          Upgrade {software} to the patched vendor security release to close the exploit vector.
                        </p>
                      </div>
                    </div>

                    {/* Row 2 */}
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-center gap-4 bg-white border border-[#e5ded0] p-5 rounded-xl shadow-xs">
                      <div className="bg-[#800020]/5 border border-[#800020]/20 rounded-xl p-4 space-y-1.5">
                        <div className="flex items-center gap-2 text-[#800020]">
                          <span>⚠️</span>
                          <span className="text-xs font-mono font-bold uppercase">
                            Potential Impact: Privilege Escalation &amp; Takeover
                          </span>
                        </div>
                        <p className="text-xs text-stone-700 leading-relaxed">
                          Unprivileged processes gain elevated administrative rights across the target host.
                        </p>
                      </div>

                      <div className="flex items-center justify-center text-[#800020] text-xl font-bold px-2">
                        <span className="hidden md:inline">→</span>
                        <span className="md:hidden text-xs text-stone-500 font-mono">↓ REMEDIATION:</span>
                      </div>

                      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-1.5">
                        <div className="flex items-center gap-2 text-emerald-800">
                          <span>🛡️</span>
                          <span className="text-xs font-mono font-bold uppercase">
                            Remediation Action: Deploy Hardening Workaround
                          </span>
                        </div>
                        <p className="text-xs text-stone-700 leading-relaxed">
                          Restrict process capabilities and disable exposed feature flags in service configuration.
                        </p>
                      </div>
                    </div>

                    {/* Row 3 */}
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-center gap-4 bg-white border border-[#e5ded0] p-5 rounded-xl shadow-xs">
                      <div className="bg-[#800020]/5 border border-[#800020]/20 rounded-xl p-4 space-y-1.5">
                        <div className="flex items-center gap-2 text-[#800020]">
                          <span>⚠️</span>
                          <span className="text-xs font-mono font-bold uppercase">
                            Potential Impact: Lateral Movement Across Network
                          </span>
                        </div>
                        <p className="text-xs text-stone-700 leading-relaxed">
                          Compromised asset acts as pivot point to access internal connected subnets.
                        </p>
                      </div>

                      <div className="flex items-center justify-center text-[#800020] text-xl font-bold px-2">
                        <span className="hidden md:inline">→</span>
                        <span className="md:hidden text-xs text-stone-500 font-mono">↓ REMEDIATION:</span>
                      </div>

                      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-1.5">
                        <div className="flex items-center gap-2 text-emerald-800">
                          <span>🛡️</span>
                          <span className="text-xs font-mono font-bold uppercase">
                            Remediation Action: Enforce Firewall Isolation
                          </span>
                        </div>
                        <p className="text-xs text-stone-700 leading-relaxed">
                          Block untrusted incoming traffic and isolate the host to designated management subnets.
                        </p>
                      </div>
                    </div>

                    {/* Row 4 */}
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-center gap-4 bg-white border border-[#e5ded0] p-5 rounded-xl shadow-xs">
                      <div className="bg-[#800020]/5 border border-[#800020]/20 rounded-xl p-4 space-y-1.5">
                        <div className="flex items-center gap-2 text-[#800020]">
                          <span>⚠️</span>
                          <span className="text-xs font-mono font-bold uppercase">
                            Potential Impact: Statutory Liabilities &amp; Interruption
                          </span>
                        </div>
                        <p className="text-xs text-stone-700 leading-relaxed">
                          Failure to remediate causes compliance breach penalties ({actionPlan.consequences.domain_category || "Standard"}).
                        </p>
                      </div>

                      <div className="flex items-center justify-center text-[#800020] text-xl font-bold px-2">
                        <span className="hidden md:inline">→</span>
                        <span className="md:hidden text-xs text-stone-500 font-mono">↓ REMEDIATION:</span>
                      </div>

                      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-1.5">
                        <div className="flex items-center gap-2 text-emerald-800">
                          <span>🛡️</span>
                          <span className="text-xs font-mono font-bold uppercase">
                            Remediation Action: Validate Patch &amp; Rescan
                          </span>
                        </div>
                        <p className="text-xs text-stone-700 leading-relaxed">
                          Run CLI verification check and rescan the asset to ensure zero residual exploit vectors.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Expandable Technical Details in B */}
                  <div className="border border-[#e5ded0] bg-white rounded-xl overflow-hidden shadow-xs">
                    <button
                      onClick={() => setShowDetailedInB(!showDetailedInB)}
                      className="w-full px-5 py-3.5 flex items-center justify-between text-xs font-mono font-bold text-[#800020] hover:bg-[#faf7f2] transition cursor-pointer"
                    >
                      <span>{showDetailedInB ? "Hide technical analysis" : "View technical analysis & CLI commands"}</span>
                      <span className="text-sm">{showDetailedInB ? "▲" : "▼"}</span>
                    </button>

                    {showDetailedInB && (
                      <div className="p-5 border-t border-[#e5ded0] space-y-4 text-xs bg-[#fbf9f5]">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <span className="font-mono text-[#800020] uppercase text-xs font-bold block">
                              Technical Threat Mechanism:
                            </span>
                            <p className="text-stone-700 leading-relaxed bg-white p-3.5 rounded-xl border border-[#e5ded0]">
                              {actionPlan.what_if_not_cured.exploit_mechanism}
                            </p>
                          </div>
                          <div className="space-y-1.5">
                            <span className="font-mono text-emerald-800 uppercase text-xs font-bold block">
                              Terminal Patch Command:
                            </span>
                            <pre className="font-mono text-emerald-300 bg-[#292524] p-3.5 rounded-xl border border-stone-700 overflow-x-auto whitespace-pre-wrap">
                              {actionPlan.remedy.patch_command}
                            </pre>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 font-mono">
                          <div className="bg-white p-3 rounded-xl border border-[#e5ded0]">
                            <span className="text-stone-500 uppercase text-[10px] block">Operational Impact</span>
                            <span className="text-stone-900 text-xs font-semibold">{actionPlan.consequences.operational_impact}</span>
                          </div>
                          <div className="bg-white p-3 rounded-xl border border-[#e5ded0]">
                            <span className="text-stone-500 uppercase text-[10px] block">Legal &amp; Compliance</span>
                            <span className="text-stone-900 text-xs font-semibold">{actionPlan.consequences.legal_regulatory}</span>
                          </div>
                          <div className="bg-white p-3 rounded-xl border border-[#e5ded0]">
                            <span className="text-stone-500 uppercase text-[10px] block">Estimated Cost</span>
                            <span className="text-[#800020] text-xs font-bold">{actionPlan.consequences.financial_cost}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* ── MODAL FOOTER ────────────────────────────────────────────────── */}
            <div className="p-4 border-t border-[#e5ded0] bg-[#f5f0e6] flex flex-wrap items-center justify-between gap-3 text-xs text-stone-600 font-mono">
              <div className="flex items-center gap-2">
                <span>View Mode:</span>
                <span className="text-[#800020] font-bold">
                  {activeDeckMode === "detailed"
                    ? "Approach A (Side-by-Side)"
                    : "Approach B (Impact → Remediation)"}
                </span>
                {actionPlan?.reference_url && (
                  <a
                    href={actionPlan.reference_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[#800020] hover:underline ml-2"
                  >
                    Official Advisory ↗
                  </a>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleQuarantine(selectedFinding?.asset_id || 1)}
                  className="bg-white hover:bg-stone-50 text-[#800020] border border-[#800020]/40 px-3 py-1.5 rounded-lg transition cursor-pointer font-bold"
                >
                  Quarantine Asset
                </button>
                <button
                  onClick={() => handleResolve(selectedFinding?.id || 1)}
                  className="bg-[#800020] hover:bg-[#66001a] text-white px-3 py-1.5 rounded-lg transition cursor-pointer font-bold"
                >
                  Mark Remediated
                </button>
                <button
                  onClick={handleCloseModal}
                  className="bg-white hover:bg-stone-100 text-stone-800 border border-[#d6ccbe] font-bold px-4 py-1.5 rounded-lg transition cursor-pointer"
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
