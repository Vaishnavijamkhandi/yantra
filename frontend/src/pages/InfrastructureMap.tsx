import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getAssessmentResults, getActionPlan, quarantineAsset, resolveFinding } from "../services/api";
import type { AssetVulnerability, ActionPlanProfile } from "../types/asset";
import BentoClarityDeck from "../components/BentoClarityDeck";

export default function InfrastructureMap() {
  const [findings, setFindings] = useState<AssetVulnerability[]>([]);
  const [selectedFinding, setSelectedFinding] = useState<AssetVulnerability | null>(null);
  const [actionPlan, setActionPlan] = useState<ActionPlanProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingPlan, setLoadingPlan] = useState(false);

  // View & Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeDeckMode, setActiveDeckMode] = useState<"bento" | "detailed" | "impact_action">("bento");
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [showDetailedInB, setShowDetailedInB] = useState(false);
  const [statusNotification, setStatusNotification] = useState<string | null>(null);

  // Load findings on mount
  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const results = await getAssessmentResults({ limit: 50 });
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
    <div className="min-h-[calc(100vh-4rem)] bg-slate-950 text-slate-100 flex flex-col relative overflow-hidden font-sans select-none">
      {/* ── STATUS NOTIFICATION TOAST ────────────────────────────────────────── */}
      {statusNotification && (
        <div className="fixed top-16 right-6 z-50 bg-emerald-950/90 border border-emerald-500/80 text-emerald-200 px-4 py-2.5 rounded-xl shadow-2xl backdrop-blur-md text-xs font-semibold flex items-center gap-2 animate-bounce">
          <span>✓</span>
          <span>{statusNotification}</span>
        </div>
      )}

      {/* ── TOP COMMAND CENTRE HEADER BAR ────────────────────────────────────── */}
      <div className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 z-20">
        <div>
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse ring-4 ring-cyan-500/20" />
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              Infrastructure Map
            </h1>
            <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-slate-800 text-cyan-300 border border-slate-700">
              Perimeter Simulation View
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Visual representation of detected security risks, illustrative network perimeter depth, and vulnerability blast radius.
          </p>
        </div>

        {/* Threat Finding Selector & Deck Mode Switcher */}
        <div className="flex flex-wrap items-center gap-3">
          {findings.length > 0 && (
            <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1">
              <span className="text-xs text-slate-400 font-medium">Target Host:</span>
              <select
                value={selectedFinding?.id ?? ""}
                onChange={(e) => {
                  const match = findings.find((f) => f.id === Number(e.target.value));
                  if (match) setSelectedFinding(match);
                }}
                className="bg-transparent text-xs text-cyan-300 font-semibold focus:outline-none cursor-pointer"
              >
                {findings.map((f) => (
                  <option key={f.id} value={f.id} className="bg-slate-900 text-slate-100">
                    {f.vulnerability.cve_id} — Asset #{f.asset_id} ({f.matched_software || "System"})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* 3-Way Deck Mode Switcher */}
          <div className="flex items-center bg-slate-900 border border-slate-700 rounded-lg p-0.5">
            <button
              onClick={() => setActiveDeckMode("bento")}
              className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                activeDeckMode === "bento"
                  ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-xs"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Bento Clarity Deck
            </button>
            <button
              onClick={() => setActiveDeckMode("detailed")}
              className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                activeDeckMode === "detailed"
                  ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-xs"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Detailed View (A)
            </button>
            <button
              onClick={() => setActiveDeckMode("impact_action")}
              className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                activeDeckMode === "impact_action"
                  ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-xs"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Impact → Action (B)
            </button>
          </div>
        </div>
      </div>

      {/* ── SIMULATED NETWORK VISUALIZATION CANVAS ───────────────────────────── */}
      <div className="relative flex items-center justify-center p-6 md:p-10 overflow-hidden bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:28px_28px] border-b border-slate-800/80">
        {/* Subtle vignette radial mask */}
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,transparent_20%,#020617_90%)]" />

        {/* Network Canvas Elements Wrapper */}
        <div
          className={`relative w-full max-w-5xl h-[460px] transition-all duration-700 flex items-center justify-center ${
            isModalOpen ? "scale-90 filter blur-md brightness-40 pointer-events-none" : "scale-100"
          }`}
        >
          {/* ── BACKGROUND LAYER: ILLUSTRATIVE CONNECTIVITY LINES ────────────── */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none stroke-slate-800/80">
            <line x1="50%" y1="50%" x2="18%" y2="22%" strokeDasharray="4 4" strokeWidth="1.5" />
            <line x1="50%" y1="50%" x2="82%" y2="20%" strokeDasharray="4 4" strokeWidth="1.5" />
            <line x1="50%" y1="50%" x2="16%" y2="78%" strokeDasharray="4 4" strokeWidth="1.5" />
            <line x1="50%" y1="50%" x2="84%" y2="80%" strokeDasharray="4 4" strokeWidth="1.5" />
            <line x1="50%" y1="50%" x2="8%" y2="50%" strokeDasharray="3 3" strokeWidth="1" />
            <line x1="18%" y1="22%" x2="82%" y2="20%" strokeDasharray="6 6" strokeWidth="1" />
            <line x1="16%" y1="78%" x2="84%" y2="80%" strokeDasharray="6 6" strokeWidth="1" />
          </svg>

          {/* ── BACKGROUND NETWORK NODES (Depth blur) ────────────────────────── */}
          {/* Node 1: Edge Router / Gateway */}
          <div className="absolute top-[16%] left-[12%] md:left-[16%] flex flex-col items-center filter blur-[1px] opacity-45 select-none">
            <div className="w-12 h-12 rounded-xl bg-slate-900 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-md">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
              </svg>
            </div>
            <span className="text-[11px] font-semibold text-slate-400 mt-1">Perimeter Gateway</span>
            <span className="text-[9px] text-slate-500 font-mono">10.0.1.1</span>
          </div>

          {/* Node 2: Cloud IAM / Auth Service */}
          <div className="absolute top-[14%] right-[12%] md:right-[16%] flex flex-col items-center filter blur-[1px] opacity-45 select-none">
            <div className="w-12 h-12 rounded-xl bg-slate-900 border border-slate-700 flex items-center justify-center text-indigo-400 shadow-md">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 00-9.78 2.096A4.001 4.001 0 003 15z" />
              </svg>
            </div>
            <span className="text-[11px] font-semibold text-slate-400 mt-1">Cloud IAM / IdP</span>
            <span className="text-[9px] text-slate-500 font-mono">auth.internal</span>
          </div>

          {/* Node 3: Core Database Replica */}
          <div className="absolute bottom-[14%] left-[10%] md:left-[14%] flex flex-col items-center filter blur-[1px] opacity-45 select-none">
            <div className="w-12 h-12 rounded-xl bg-slate-900 border border-slate-700 flex items-center justify-center text-slate-300 shadow-md">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
              </svg>
            </div>
            <span className="text-[11px] font-semibold text-slate-400 mt-1">Database Cluster</span>
            <span className="text-[9px] text-slate-500 font-mono">10.0.2.25</span>
          </div>

          {/* Node 4: Storage & Backup Vault */}
          <div className="absolute bottom-[14%] right-[10%] md:right-[14%] flex flex-col items-center filter blur-[1px] opacity-45 select-none">
            <div className="w-12 h-12 rounded-xl bg-slate-900 border border-slate-700 flex items-center justify-center text-slate-300 shadow-md">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
              </svg>
            </div>
            <span className="text-[11px] font-semibold text-slate-400 mt-1">Backup Storage Vault</span>
            <span className="text-[9px] text-slate-500 font-mono">10.0.4.50</span>
          </div>

          {/* ── CENTRAL COMPUTER (SHARP, PROMINENT, FOCAL POINT) ─────────────── */}
          <div className="relative z-10 flex flex-col items-center group">
            {/* Concentric subtle radar pulse ring */}
            <div className="absolute -inset-10 rounded-full border border-rose-500/20 animate-ping opacity-30 pointer-events-none" />
            <div className="absolute -inset-6 rounded-full border border-rose-500/30 pointer-events-none" />

            {/* Central Computer Device Card */}
            <div className="w-64 bg-slate-900/90 border-2 border-rose-500/70 rounded-2xl p-5 shadow-[0_0_40px_rgba(244,63,94,0.22)] backdrop-blur-md flex flex-col items-center text-center transition-transform hover:scale-105 duration-300">
              <div className="w-16 h-16 rounded-xl bg-gradient-to-b from-slate-800 to-slate-900 border border-slate-700 flex items-center justify-center text-rose-400 mb-3 shadow-inner relative">
                <svg className="w-9 h-9" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse ring-2 ring-rose-400/40" />
              </div>

              <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20 mb-1">
                AFFECTED HOST • RISK ACTIVE
              </span>
              <h2 className="text-base font-bold text-white tracking-tight">
                {assetName}
              </h2>
              <div className="text-[11px] text-slate-400 font-mono mt-1">
                IP: <span className="text-slate-200">10.0.1.15</span> • OS: <span className="text-slate-200">Linux</span>
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Target Component: <span className="text-cyan-300 font-semibold">{software}</span>
              </div>
            </div>

            {/* ── FLOATING VULNERABILITY CALLOUT CARD ──────────────────────────── */}
            <div className="absolute -top-16 -right-24 md:-right-44 z-20">
              <svg className="absolute -bottom-8 -left-12 w-14 h-14 pointer-events-none stroke-rose-500/60">
                <path d="M50,4 C20,10 10,40 4,50" fill="none" strokeWidth="1.5" strokeDasharray="3 3" />
              </svg>

              <button
                onClick={handleOpenModal}
                className="bg-slate-900/95 hover:bg-slate-900 border-2 border-rose-500 text-left rounded-xl p-3.5 shadow-[0_0_25px_rgba(244,63,94,0.35)] backdrop-blur-md max-w-xs transition-all duration-300 hover:scale-105 hover:border-cyan-400 group/card cursor-pointer"
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-amber-400">⚠️</span>
                    <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800">
                      {severity} SEVERITY
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-cyan-400 font-semibold">
                    {cveId}
                  </span>
                </div>

                <h3 className="text-xs font-bold text-slate-100 group-hover/card:text-white line-clamp-2">
                  {actionPlan?.remedy.title || `${software} Vulnerability`}
                </h3>

                <div className="mt-2.5 pt-2 border-t border-slate-800 flex items-center justify-between text-[11px] font-semibold text-cyan-400 group-hover/card:text-cyan-300">
                  <span>Click to investigate</span>
                  <span className="transition-transform group-hover/card:translate-x-1">→</span>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Conceptual Topology Disclaimer Tag */}
        <div className="absolute bottom-3 left-6 text-[11px] text-slate-500 flex items-center gap-2 pointer-events-none">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-600" />
          <span>Conceptual topology simulation. Depth perspective illustrative of asset perimeter.</span>
        </div>
      </div>

      {/* ── THE BENTO CLARITY DECK (INLINE INTEGRATED VIEW) ───────────────────── */}
      <div className="p-6 md:p-8 max-w-7xl mx-auto w-full space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400" />
              <h2 className="text-base font-bold tracking-tight text-white uppercase">
                The Bento Clarity Deck
              </h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 text-cyan-300 border border-slate-700">
                Modular Threat Intelligence
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Instant visual clarity on exploit mechanism, attack probability, financial fallout, and terminal remediation steps.
            </p>
          </div>

          <button
            onClick={handleOpenModal}
            className="self-start sm:self-auto bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-slate-700 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <span>Open Expanded Deck Modal</span>
            <span>↗</span>
          </button>
        </div>

        {loadingPlan || !actionPlan ? (
          <div className="p-12 text-center text-slate-500 space-y-2 bg-slate-900/40 rounded-2xl border border-slate-800">
            <div className="animate-spin text-2xl text-cyan-400 inline-block">⟳</div>
            <p className="text-xs">Loading live threat intelligence &amp; Bento Deck...</p>
          </div>
        ) : (
          <BentoClarityDeck
            actionPlan={actionPlan}
            selectedFinding={selectedFinding}
            onQuarantine={handleQuarantine}
            onResolve={handleResolve}
          />
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {/* DETAILED MODAL OVERLAY (BENTO DECK | APPROACH A | APPROACH B)            */}
      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/85 backdrop-blur-md animate-fadeIn">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl max-w-6xl w-full max-h-[88vh] flex flex-col overflow-hidden text-slate-100">
            {/* ── MODAL HEADER ────────────────────────────────────────────────── */}
            <div className="p-6 border-b border-slate-800 bg-slate-900/95 flex flex-col md:flex-row md:items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-base font-bold text-cyan-400">
                    {cveId}
                  </span>
                  <span
                    className={`text-xs px-2.5 py-0.5 rounded-full font-bold border ${
                      severity === "CRITICAL"
                        ? "bg-rose-950 text-rose-300 border-rose-800"
                        : "bg-amber-950 text-amber-300 border-amber-800"
                    }`}
                  >
                    {severity} (CVSS {cvss ?? "N/A"})
                  </span>
                  {actionPlan?.consequences.domain_category && (
                    <span className="text-[11px] font-semibold text-slate-300 bg-slate-800 px-2.5 py-0.5 rounded border border-slate-700">
                      {actionPlan.consequences.domain_category}
                    </span>
                  )}
                </div>

                <h2 className="text-lg md:text-xl font-bold text-white tracking-tight">
                  {actionPlan?.remedy.title || `${software} Security Advisory`}
                </h2>

                <p className="text-xs text-slate-400 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span>Affected Asset: <strong className="text-slate-200">{assetName}</strong></span>
                  <span>•</span>
                  <span>Component: <strong className="text-cyan-300">{software}</strong></span>
                </p>
              </div>

              {/* Approach Selector Switch & Close Button */}
              <div className="flex items-center gap-3 self-end md:self-start">
                <div className="bg-slate-950 border border-slate-700 p-1 rounded-lg flex items-center text-xs font-semibold">
                  <button
                    onClick={() => setActiveDeckMode("bento")}
                    className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
                      activeDeckMode === "bento"
                        ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-xs"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Bento Clarity Deck
                  </button>
                  <button
                    onClick={() => setActiveDeckMode("detailed")}
                    className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
                      activeDeckMode === "detailed"
                        ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-xs"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Detailed View (A)
                  </button>
                  <button
                    onClick={() => setActiveDeckMode("impact_action")}
                    className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
                      activeDeckMode === "impact_action"
                        ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-xs"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Impact → Action (B)
                  </button>
                </div>

                <button
                  onClick={handleCloseModal}
                  className="w-9 h-9 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                  title="Close modal"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* ── MODAL BODY (SCROLLABLE) ──────────────────────────────────────── */}
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              {loadingPlan || !actionPlan ? (
                <div className="p-16 text-center text-slate-400 space-y-2">
                  <div className="animate-spin text-2xl text-cyan-400 inline-block">⟳</div>
                  <p className="text-sm">Fetching real-time threat telemetry and remediation data...</p>
                </div>
              ) : activeDeckMode === "bento" ? (
                /* ══════════════════════════════════════════════════════════════════ */
                /* MODE: THE BENTO CLARITY DECK                                       */
                /* ══════════════════════════════════════════════════════════════════ */
                <BentoClarityDeck
                  actionPlan={actionPlan}
                  selectedFinding={selectedFinding}
                  onQuarantine={handleQuarantine}
                  onResolve={handleResolve}
                />
              ) : activeDeckMode === "detailed" ? (
                /* ══════════════════════════════════════════════════════════════════ */
                /* MODE: APPROACH A (DETAILED SIDE-BY-SIDE MODAL)                     */
                /* ══════════════════════════════════════════════════════════════════ */
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* LEFT COLUMN: WHAT-IF ANALYSIS */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 pb-2 border-b border-rose-500/30">
                      <span className="text-rose-400 text-lg">⚠️</span>
                      <h3 className="text-base font-bold text-rose-400 tracking-tight">
                        What if this vulnerability is exploited?
                      </h3>
                    </div>

                    <div className="bg-rose-950/20 border border-rose-900/50 rounded-xl p-4 space-y-1.5">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-rose-400 block">
                        Technical Exploit Mechanism
                      </span>
                      <p className="text-xs md:text-sm text-slate-200 leading-relaxed">
                        {actionPlan.what_if_not_cured.exploit_mechanism}
                      </p>
                    </div>

                    <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-1.5">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400 block">
                        Attacker Capabilities Once Exploited
                      </span>
                      <p className="text-xs md:text-sm text-slate-300 leading-relaxed font-medium">
                        {actionPlan.what_if_not_cured.attacker_capability}
                      </p>
                    </div>

                    <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-1.5">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                        Mission &amp; Core Business Consequence
                      </span>
                      <p className="text-xs md:text-sm text-slate-300 leading-relaxed">
                        {actionPlan.consequences.primary_impact || actionPlan.consequences.clinical_impact}
                      </p>
                    </div>

                    <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-1.5">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                        Operational Service Disruption
                      </span>
                      <p className="text-xs md:text-sm text-slate-300 leading-relaxed">
                        {actionPlan.consequences.operational_impact}
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3.5 space-y-1">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                          Legal &amp; Regulatory
                        </span>
                        <p className="text-xs text-slate-300 leading-relaxed">
                          {actionPlan.consequences.legal_regulatory}
                        </p>
                      </div>

                      <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3.5 space-y-1">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-rose-400 block">
                          Estimated Financial Cost
                        </span>
                        <p className="text-sm font-bold text-rose-300">
                          {actionPlan.consequences.financial_cost}
                        </p>
                      </div>
                    </div>

                    <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between text-xs">
                      <div>
                        <span className="text-slate-400 block">Live Exploit Telemetry (EPSS):</span>
                        <span className="text-amber-400 font-bold text-sm">
                          {actionPlan.what_if_not_cured.epss_probability}
                        </span>
                      </div>
                      <span className="text-[11px] font-bold px-2.5 py-1 rounded bg-slate-800 text-slate-300 border border-slate-700">
                        {actionPlan.what_if_not_cured.weaponized_status}
                      </span>
                    </div>
                  </div>

                  {/* RIGHT COLUMN: REMEDIATION INSTRUCTIONS */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 pb-2 border-b border-emerald-500/30">
                      <span className="text-emerald-400 text-lg">🛡️</span>
                      <h3 className="text-base font-bold text-emerald-400 tracking-tight">
                        How to remediate
                      </h3>
                    </div>

                    <div className="space-y-3">
                      <div className="bg-emerald-950/20 border border-emerald-900/50 rounded-xl p-4">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold text-emerald-400 uppercase tracking-wide">
                            01 — Official Mandate &amp; Advisory
                          </span>
                          {actionPlan.remedy.due_date && (
                            <span className="text-[10px] font-semibold bg-emerald-900/50 text-emerald-300 px-2 py-0.5 rounded border border-emerald-700/50">
                              Due: {actionPlan.remedy.due_date}
                            </span>
                          )}
                        </div>
                        <p className="text-xs md:text-sm text-slate-200 font-medium">
                          {actionPlan.remedy.cisa_mandate || "Apply vendor security updates immediately."}
                        </p>
                      </div>

                      <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-bold text-emerald-400 uppercase tracking-wide">
                            02 — Apply Recommended Security Patch
                          </span>
                          <button
                            onClick={() => copyToClipboard(actionPlan.remedy.patch_command)}
                            className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-2 py-0.5 rounded border border-slate-700 transition-colors cursor-pointer"
                          >
                            {copiedCmd ? "✓ Copied!" : "📋 Copy Command"}
                          </button>
                        </div>
                        <pre className="font-mono text-xs text-emerald-300 bg-slate-900/90 p-2.5 rounded border border-slate-800 overflow-x-auto whitespace-pre-wrap">
                          {actionPlan.remedy.patch_command}
                        </pre>
                      </div>

                      <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-1">
                        <span className="text-xs font-bold text-slate-300 uppercase tracking-wide block">
                          03 — Configuration Hardening &amp; Workaround
                        </span>
                        <p className="text-xs md:text-sm text-slate-300">
                          {actionPlan.remedy.workaround}
                        </p>
                      </div>

                      <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-1">
                        <span className="text-xs font-bold text-slate-300 uppercase tracking-wide block">
                          04 — Network Firewall Containment Rule
                        </span>
                        <code className="block font-mono text-xs text-cyan-300 bg-slate-900/90 p-2 rounded border border-slate-800">
                          {actionPlan.remedy.firewall_rule}
                        </code>
                      </div>

                      <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-1">
                        <span className="text-xs font-bold text-slate-300 uppercase tracking-wide block">
                          05 — Post-Patch Validation &amp; Service Verification
                        </span>
                        <p className="text-xs md:text-sm text-slate-300 font-mono">
                          {actionPlan.remedy.verification_step}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* ══════════════════════════════════════════════════════════════════ */
                /* MODE: APPROACH B (IMPACT → REMEDIATION ARROW UI)                   */
                /* ══════════════════════════════════════════════════════════════════ */
                <div className="space-y-6">
                  <p className="text-xs md:text-sm text-slate-400 border-b border-slate-800 pb-3">
                    Understand the potential impact and the actions that can help prevent or resolve it.
                  </p>

                  <div className="space-y-4">
                    {/* Row 1 */}
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-center gap-3 bg-slate-950/50 border border-slate-800 p-4 rounded-xl hover:border-slate-700 transition-colors">
                      <div className="bg-rose-950/20 border border-rose-900/40 rounded-lg p-3.5 space-y-1">
                        <div className="flex items-center gap-2 text-rose-400">
                          <span>⚠️</span>
                          <span className="text-xs font-bold uppercase tracking-wide">
                            Potential Impact: System Crash &amp; Execution
                          </span>
                        </div>
                        <p className="text-xs text-slate-200">
                          Attacker exploits component mechanism to exhaust memory or execute unauthorized commands.
                        </p>
                      </div>

                      <div className="flex items-center justify-center text-cyan-400 text-lg px-2">
                        <span className="hidden md:inline">→</span>
                        <span className="md:hidden text-xs text-slate-500">↓ ACTION:</span>
                      </div>

                      <div className="bg-emerald-950/20 border border-emerald-900/40 rounded-lg p-3.5 space-y-1">
                        <div className="flex items-center gap-2 text-emerald-400">
                          <span>🛡️</span>
                          <span className="text-xs font-bold uppercase tracking-wide">
                            Remediation Action: Apply Package Security Patch
                          </span>
                        </div>
                        <p className="text-xs text-slate-200">
                          Upgrade {software} to the patched vendor security release to close the vulnerability.
                        </p>
                      </div>
                    </div>

                    {/* Row 2 */}
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-center gap-3 bg-slate-950/50 border border-slate-800 p-4 rounded-xl hover:border-slate-700 transition-colors">
                      <div className="bg-rose-950/20 border border-rose-900/40 rounded-lg p-3.5 space-y-1">
                        <div className="flex items-center gap-2 text-rose-400">
                          <span>⚠️</span>
                          <span className="text-xs font-bold uppercase tracking-wide">
                            Potential Impact: Privilege Escalation &amp; Root Takeover
                          </span>
                        </div>
                        <p className="text-xs text-slate-200">
                          Flaw allows unprivileged processes to gain administrative tier rights across the asset.
                        </p>
                      </div>

                      <div className="flex items-center justify-center text-cyan-400 text-lg px-2">
                        <span className="hidden md:inline">→</span>
                        <span className="md:hidden text-xs text-slate-500">↓ ACTION:</span>
                      </div>

                      <div className="bg-emerald-950/20 border border-emerald-900/40 rounded-lg p-3.5 space-y-1">
                        <div className="flex items-center gap-2 text-emerald-400">
                          <span>🛡️</span>
                          <span className="text-xs font-bold uppercase tracking-wide">
                            Remediation Action: Deploy Hardening Workaround
                          </span>
                        </div>
                        <p className="text-xs text-slate-200">
                          Restrict permissions and disable vulnerable feature flags in daemon configuration.
                        </p>
                      </div>
                    </div>

                    {/* Row 3 */}
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-center gap-3 bg-slate-950/50 border border-slate-800 p-4 rounded-xl hover:border-slate-700 transition-colors">
                      <div className="bg-rose-950/20 border border-rose-900/40 rounded-lg p-3.5 space-y-1">
                        <div className="flex items-center gap-2 text-rose-400">
                          <span>⚠️</span>
                          <span className="text-xs font-bold uppercase tracking-wide">
                            Potential Impact: Lateral Movement Across Perimeter
                          </span>
                        </div>
                        <p className="text-xs text-slate-200">
                          Exposed network port enables attackers to pivot from compromised asset to internal servers.
                        </p>
                      </div>

                      <div className="flex items-center justify-center text-cyan-400 text-lg px-2">
                        <span className="hidden md:inline">→</span>
                        <span className="md:hidden text-xs text-slate-500">↓ ACTION:</span>
                      </div>

                      <div className="bg-emerald-950/20 border border-emerald-900/40 rounded-lg p-3.5 space-y-1">
                        <div className="flex items-center gap-2 text-emerald-400">
                          <span>🛡️</span>
                          <span className="text-xs font-bold uppercase tracking-wide">
                            Remediation Action: Enforce Firewall ACL Containment
                          </span>
                        </div>
                        <p className="text-xs text-slate-200">
                          Block untrusted incoming subnet traffic and isolate port to authorized IT jump hosts.
                        </p>
                      </div>
                    </div>

                    {/* Row 4 */}
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-center gap-3 bg-slate-950/50 border border-slate-800 p-4 rounded-xl hover:border-slate-700 transition-colors">
                      <div className="bg-rose-950/20 border border-rose-900/40 rounded-lg p-3.5 space-y-1">
                        <div className="flex items-center gap-2 text-rose-400">
                          <span>⚠️</span>
                          <span className="text-xs font-bold uppercase tracking-wide">
                            Potential Impact: Regulatory Liabilities &amp; Fines
                          </span>
                        </div>
                        <p className="text-xs text-slate-200">
                          Statutory non-compliance penalties ({actionPlan.consequences.domain_category || "Enterprise"}) and business disruption.
                        </p>
                      </div>

                      <div className="flex items-center justify-center text-cyan-400 text-lg px-2">
                        <span className="hidden md:inline">→</span>
                        <span className="md:hidden text-xs text-slate-500">↓ ACTION:</span>
                      </div>

                      <div className="bg-emerald-950/20 border border-emerald-900/40 rounded-lg p-3.5 space-y-1">
                        <div className="flex items-center gap-2 text-emerald-400">
                          <span>🛡️</span>
                          <span className="text-xs font-bold uppercase tracking-wide">
                            Remediation Action: Validate Service Patch &amp; Rescan
                          </span>
                        </div>
                        <p className="text-xs text-slate-200">
                          Execute CLI verification command and rescan asset to ensure zero residual exploit traces.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Expandable Section */}
                  <div className="border border-slate-800 bg-slate-950/60 rounded-xl overflow-hidden">
                    <button
                      onClick={() => setShowDetailedInB(!showDetailedInB)}
                      className="w-full px-5 py-3.5 flex items-center justify-between text-xs font-bold text-cyan-400 hover:text-cyan-300 hover:bg-slate-900/80 transition-colors cursor-pointer"
                    >
                      <span>{showDetailedInB ? "Hide detailed analysis" : "View detailed analysis"}</span>
                      <span className="text-sm">{showDetailedInB ? "▲" : "▼"}</span>
                    </button>

                    {showDetailedInB && (
                      <div className="p-5 border-t border-slate-800 space-y-4 text-xs animate-fadeIn">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <span className="font-bold text-rose-400 uppercase tracking-wide block">
                              Complete Technical Threat Mechanism:
                            </span>
                            <p className="text-slate-300 leading-relaxed bg-slate-900 p-3 rounded-lg border border-slate-800">
                              {actionPlan.what_if_not_cured.exploit_mechanism}
                            </p>
                          </div>
                          <div className="space-y-2">
                            <span className="font-bold text-emerald-400 uppercase tracking-wide block">
                              Terminal Patch Command:
                            </span>
                            <pre className="font-mono text-emerald-300 bg-slate-900 p-3 rounded-lg border border-slate-800 overflow-x-auto whitespace-pre-wrap">
                              {actionPlan.remedy.patch_command}
                            </pre>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                          <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                            <span className="text-slate-500 uppercase text-[10px] block">Operational Impact</span>
                            <span className="text-slate-200 font-medium">{actionPlan.consequences.operational_impact}</span>
                          </div>
                          <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                            <span className="text-slate-500 uppercase text-[10px] block">Legal &amp; Compliance</span>
                            <span className="text-slate-200 font-medium">{actionPlan.consequences.legal_regulatory}</span>
                          </div>
                          <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                            <span className="text-slate-500 uppercase text-[10px] block">Estimated Cost</span>
                            <span className="text-rose-400 font-bold">{actionPlan.consequences.financial_cost}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* ── MODAL FOOTER ────────────────────────────────────────────────── */}
            <div className="p-4 border-t border-slate-800 bg-slate-950 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
              <div className="flex items-center gap-2">
                <span>Active Perspective:</span>
                <span className="text-cyan-300 font-semibold">
                  {activeDeckMode === "bento"
                    ? "The Bento Clarity Deck"
                    : activeDeckMode === "detailed"
                    ? "Approach A (Detailed Investigation)"
                    : "Approach B (Impact → Action Flow)"}
                </span>
                {actionPlan?.reference_url && (
                  <a
                    href={actionPlan.reference_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-400 hover:text-blue-300 hover:underline ml-2"
                  >
                    Official NIST Advisory ↗
                  </a>
                )}
              </div>

              <button
                onClick={handleCloseModal}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold px-4 py-2 rounded-lg transition-colors cursor-pointer"
              >
                Close View
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
