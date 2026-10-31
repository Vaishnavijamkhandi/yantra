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
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50 text-slate-900 flex flex-col relative font-sans">
      {/* ── STATUS NOTIFICATION TOAST ────────────────────────────────────────── */}
      {statusNotification && (
        <div className="fixed top-16 right-6 z-50 bg-emerald-600 text-white px-4 py-2.5 rounded-xl shadow-xl text-xs font-semibold flex items-center gap-2 animate-bounce">
          <span>✓</span>
          <span>{statusNotification}</span>
        </div>
      )}

      {/* ── TOP EXECUTIVE CONTROLS BAR ───────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-200/90 px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 z-20 shadow-2xs">
        <div>
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 animate-pulse ring-4 ring-indigo-500/20" />
            <h1 className="text-xl font-extrabold tracking-tight text-slate-900">
              Infrastructure Map
            </h1>
            <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
              Perimeter Simulation View
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Visual representation of detected security risks, illustrative perimeter depth, and vulnerability blast radius.
          </p>
        </div>

        {/* Threat Finding Selector & Mode Switcher */}
        <div className="flex flex-wrap items-center gap-3">
          {findings.length > 0 && (
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 shadow-2xs">
              <span className="text-xs text-slate-500 font-semibold">Target Asset:</span>
              <select
                value={selectedFinding?.id ?? ""}
                onChange={(e) => {
                  const match = findings.find((f) => f.id === Number(e.target.value));
                  if (match) setSelectedFinding(match);
                }}
                className="bg-transparent text-xs text-indigo-700 font-bold focus:outline-none cursor-pointer"
              >
                {findings.map((f) => (
                  <option key={f.id} value={f.id} className="text-slate-800">
                    {f.vulnerability.cve_id} — Asset #{f.asset_id} ({f.matched_software || "System"})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* 3-Way Deck Mode Switcher */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/80">
            <button
              onClick={() => setActiveDeckMode("bento")}
              className={`text-xs px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                activeDeckMode === "bento"
                  ? "bg-white text-indigo-700 shadow-sm border border-slate-200/60"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Bento Clarity Deck
            </button>
            <button
              onClick={() => setActiveDeckMode("detailed")}
              className={`text-xs px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                activeDeckMode === "detailed"
                  ? "bg-white text-indigo-700 shadow-sm border border-slate-200/60"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Detailed View (A)
            </button>
            <button
              onClick={() => setActiveDeckMode("impact_action")}
              className={`text-xs px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                activeDeckMode === "impact_action"
                  ? "bg-white text-indigo-700 shadow-sm border border-slate-200/60"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Impact → Action (B)
            </button>
          </div>
        </div>
      </div>

      {/* ── SIMULATED NETWORK VISUALIZATION CANVAS (CYBER COMMAND BLUEPRINT) ─── */}
      <div className="p-6 max-w-7xl mx-auto w-full">
        <div className="relative rounded-3xl overflow-hidden bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 border border-slate-800 shadow-xl flex items-center justify-center p-8 h-[480px]">
          {/* Subtle grid pattern */}
          <div className="absolute inset-0 bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:24px_24px] opacity-40 pointer-events-none" />

          {/* Network Canvas Elements Wrapper */}
          <div
            className={`relative w-full max-w-4xl h-full transition-all duration-700 flex items-center justify-center ${
              isModalOpen ? "scale-90 filter blur-md brightness-50 pointer-events-none" : "scale-100"
            }`}
          >
            {/* ── BACKGROUND LAYER: ILLUSTRATIVE CONNECTIVITY LINES ──────────── */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none stroke-slate-700/60">
              <line x1="50%" y1="50%" x2="18%" y2="22%" strokeDasharray="4 4" strokeWidth="1.5" />
              <line x1="50%" y1="50%" x2="82%" y2="20%" strokeDasharray="4 4" strokeWidth="1.5" />
              <line x1="50%" y1="50%" x2="16%" y2="78%" strokeDasharray="4 4" strokeWidth="1.5" />
              <line x1="50%" y1="50%" x2="84%" y2="80%" strokeDasharray="4 4" strokeWidth="1.5" />
              <line x1="50%" y1="50%" x2="8%" y2="50%" strokeDasharray="3 3" strokeWidth="1" />
              <line x1="18%" y1="22%" x2="82%" y2="20%" strokeDasharray="6 6" strokeWidth="1" />
              <line x1="16%" y1="78%" x2="84%" y2="80%" strokeDasharray="6 6" strokeWidth="1" />
            </svg>

            {/* ── BACKGROUND NETWORK NODES (Depth blur) ──────────────────────── */}
            {/* Node 1: Edge Router / Gateway */}
            <div className="absolute top-[14%] left-[12%] flex flex-col items-center filter blur-[1px] opacity-50 select-none">
              <div className="w-11 h-11 rounded-xl bg-slate-800/90 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shadow-md">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                </svg>
              </div>
              <span className="text-[10px] font-semibold text-slate-300 mt-1">Perimeter Gateway</span>
              <span className="text-[9px] text-slate-500 font-mono">10.0.1.1</span>
            </div>

            {/* Node 2: Cloud IAM / Auth Service */}
            <div className="absolute top-[12%] right-[12%] flex flex-col items-center filter blur-[1px] opacity-50 select-none">
              <div className="w-11 h-11 rounded-xl bg-slate-800/90 border border-indigo-500/40 flex items-center justify-center text-indigo-400 shadow-md">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 00-9.78 2.096A4.001 4.001 0 003 15z" />
                </svg>
              </div>
              <span className="text-[10px] font-semibold text-slate-300 mt-1">Cloud IAM / IdP</span>
              <span className="text-[9px] text-slate-500 font-mono">auth.internal</span>
            </div>

            {/* Node 3: Core Database Replica */}
            <div className="absolute bottom-[12%] left-[10%] flex flex-col items-center filter blur-[1px] opacity-50 select-none">
              <div className="w-11 h-11 rounded-xl bg-slate-800/90 border border-slate-700 flex items-center justify-center text-slate-300 shadow-md">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                </svg>
              </div>
              <span className="text-[10px] font-semibold text-slate-300 mt-1">Database Cluster</span>
              <span className="text-[9px] text-slate-500 font-mono">10.0.2.25</span>
            </div>

            {/* Node 4: Storage & Backup Vault */}
            <div className="absolute bottom-[12%] right-[10%] flex flex-col items-center filter blur-[1px] opacity-50 select-none">
              <div className="w-11 h-11 rounded-xl bg-slate-800/90 border border-slate-700 flex items-center justify-center text-slate-300 shadow-md">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                </svg>
              </div>
              <span className="text-[10px] font-semibold text-slate-300 mt-1">Backup Vault</span>
              <span className="text-[9px] text-slate-500 font-mono">10.0.4.50</span>
            </div>

            {/* ── CENTRAL COMPUTER (SHARP, PROMINENT, FOCAL POINT) ───────────── */}
            <div className="relative z-10 flex flex-col items-center group">
              <div className="absolute -inset-10 rounded-full border border-rose-500/20 animate-ping opacity-40 pointer-events-none" />
              <div className="absolute -inset-5 rounded-full border border-rose-500/30 pointer-events-none" />

              {/* Central Computer Device Card */}
              <div className="w-64 bg-slate-900 border-2 border-rose-500 rounded-2xl p-5 shadow-[0_0_50px_rgba(244,63,94,0.3)] backdrop-blur-md flex flex-col items-center text-center transition-transform hover:scale-105 duration-300">
                <div className="w-14 h-14 rounded-xl bg-gradient-to-b from-slate-800 to-slate-900 border border-slate-700 flex items-center justify-center text-rose-400 mb-2 shadow-inner relative">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse ring-2 ring-rose-400/40" />
                </div>

                <span className="text-[10px] font-extrabold uppercase tracking-wider text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20 mb-1">
                  AFFECTED HOST • ACTIVE RISK
                </span>
                <h2 className="text-base font-extrabold text-white tracking-tight">
                  {assetName}
                </h2>
                <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                  IP: <span className="text-slate-200">10.0.1.15</span> • OS: <span className="text-slate-200">Linux</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Component: <span className="text-cyan-300 font-semibold">{software}</span>
                </div>
              </div>

              {/* ── FLOATING VULNERABILITY CALLOUT CARD (CRISP HIGH-CONTRAST) ── */}
              <div className="absolute -top-16 -right-24 md:-right-44 z-20">
                <svg className="absolute -bottom-8 -left-12 w-14 h-14 pointer-events-none stroke-rose-500">
                  <path d="M50,4 C20,10 10,40 4,50" fill="none" strokeWidth="2" strokeDasharray="3 3" />
                </svg>

                <button
                  onClick={handleOpenModal}
                  className="bg-white hover:bg-slate-50 border-2 border-rose-500 text-left rounded-2xl p-4 shadow-2xl max-w-xs transition-all duration-300 hover:scale-105 group/card cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-amber-500 font-bold">⚠️</span>
                      <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200">
                        {severity} SEVERITY
                      </span>
                    </div>
                    <span className="text-[11px] font-mono text-indigo-700 font-bold">
                      {cveId}
                    </span>
                  </div>

                  <h3 className="text-xs font-extrabold text-slate-900 group-hover/card:text-indigo-600 line-clamp-2 leading-snug">
                    {actionPlan?.remedy.title || `${software} Vulnerability`}
                  </h3>

                  <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] font-bold text-indigo-600 group-hover/card:text-indigo-800">
                    <span>Click to investigate</span>
                    <span className="transition-transform group-hover/card:translate-x-1 font-bold">→</span>
                  </div>
                </button>
              </div>
            </div>
          </div>

          <div className="absolute bottom-3 left-6 text-[11px] text-slate-400 flex items-center gap-2 pointer-events-none">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
            <span>Conceptual perimeter topology. Depth perspective illustrative of asset network posture.</span>
          </div>
        </div>
      </div>

      {/* ── THE BENTO CLARITY DECK (LUMINOUS INLINE INTEGRATED VIEW) ─────────── */}
      <div className="p-6 max-w-7xl mx-auto w-full space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-600" />
              <h2 className="text-lg font-extrabold tracking-tight text-slate-900 uppercase">
                The Bento Clarity Deck
              </h2>
              <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                Modular Threat Intelligence
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Instant visual clarity on exploit mechanism, attack probability, financial fallout, and terminal remediation steps.
            </p>
          </div>

          <button
            onClick={handleOpenModal}
            className="self-start sm:self-auto bg-white hover:bg-slate-50 text-indigo-700 border border-slate-200 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs hover:shadow-sm"
          >
            <span>Open Deck Modal</span>
            <span>↗</span>
          </button>
        </div>

        {loadingPlan || !actionPlan ? (
          <div className="p-16 text-center text-slate-400 space-y-2 bg-white rounded-3xl border border-slate-200 shadow-sm">
            <div className="animate-spin text-2xl text-indigo-600 inline-block">⟳</div>
            <p className="text-xs font-medium">Loading live threat intelligence &amp; Bento Deck...</p>
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
      {/* INVESTIGATION MODAL OVERLAY (LUMINOUS HIGH-IMPACT DESIGN)                  */}
      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl max-w-6xl w-full max-h-[90vh] flex flex-col overflow-hidden text-slate-900">
            {/* ── MODAL HEADER ────────────────────────────────────────────────── */}
            <div className="p-6 border-b border-slate-200 bg-slate-50/80 flex flex-col md:flex-row md:items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-base font-extrabold text-slate-900 bg-white px-2.5 py-0.5 rounded-lg border border-slate-200">
                    {cveId}
                  </span>
                  <span
                    className={`text-xs px-2.5 py-0.5 rounded-full font-bold border ${
                      severity === "CRITICAL"
                        ? "bg-rose-50 text-rose-700 border-rose-200"
                        : "bg-amber-50 text-amber-800 border-amber-200"
                    }`}
                  >
                    {severity} (CVSS {cvss ?? "N/A"})
                  </span>
                  {actionPlan?.consequences.domain_category && (
                    <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-200">
                      {actionPlan.consequences.domain_category}
                    </span>
                  )}
                </div>

                <h2 className="text-lg md:text-xl font-extrabold text-slate-900 tracking-tight">
                  {actionPlan?.remedy.title || `${software} Security Advisory`}
                </h2>

                <p className="text-xs text-slate-500 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span>Target Host: <strong className="text-slate-800">{assetName}</strong></span>
                  <span>•</span>
                  <span>Component: <strong className="text-indigo-600">{software}</strong></span>
                </p>
              </div>

              {/* Mode Switcher & Close Button */}
              <div className="flex items-center gap-3 self-end md:self-start">
                <div className="bg-slate-100 border border-slate-200 p-1 rounded-xl flex items-center text-xs font-bold">
                  <button
                    onClick={() => setActiveDeckMode("bento")}
                    className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                      activeDeckMode === "bento"
                        ? "bg-white text-indigo-700 shadow-xs border border-slate-200/80"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Bento Clarity Deck
                  </button>
                  <button
                    onClick={() => setActiveDeckMode("detailed")}
                    className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                      activeDeckMode === "detailed"
                        ? "bg-white text-indigo-700 shadow-xs border border-slate-200/80"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Detailed View (A)
                  </button>
                  <button
                    onClick={() => setActiveDeckMode("impact_action")}
                    className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                      activeDeckMode === "impact_action"
                        ? "bg-white text-indigo-700 shadow-xs border border-slate-200/80"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Impact → Action (B)
                  </button>
                </div>

                <button
                  onClick={handleCloseModal}
                  className="w-9 h-9 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors cursor-pointer shadow-2xs font-bold"
                  title="Close modal"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* ── MODAL BODY (SCROLLABLE) ──────────────────────────────────────── */}
            <div className="p-6 overflow-y-auto flex-1 space-y-6 bg-slate-50/50">
              {loadingPlan || !actionPlan ? (
                <div className="p-16 text-center text-slate-400 space-y-2">
                  <div className="animate-spin text-2xl text-indigo-600 inline-block">⟳</div>
                  <p className="text-sm font-medium">Fetching real-time threat telemetry and remediation data...</p>
                </div>
              ) : activeDeckMode === "bento" ? (
                <BentoClarityDeck
                  actionPlan={actionPlan}
                  selectedFinding={selectedFinding}
                  onQuarantine={handleQuarantine}
                  onResolve={handleResolve}
                />
              ) : activeDeckMode === "detailed" ? (
                /* ══════════════════════════════════════════════════════════════════ */
                /* MODE: APPROACH A (LUMINOUS DETAILED SIDE-BY-SIDE MODAL)            */
                /* ══════════════════════════════════════════════════════════════════ */
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* LEFT COLUMN: WHAT-IF ANALYSIS */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 pb-2 border-b border-rose-200">
                      <span className="w-7 h-7 rounded-lg bg-rose-50 text-rose-600 border border-rose-200 flex items-center justify-center font-bold text-xs">
                        ⚠️
                      </span>
                      <h3 className="text-base font-extrabold text-slate-900 tracking-tight">
                        What if this vulnerability is exploited?
                      </h3>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-1.5 shadow-xs">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-rose-700 block">
                        Technical Exploit Mechanism
                      </span>
                      <p className="text-xs md:text-sm text-slate-700 leading-relaxed font-normal">
                        {actionPlan.what_if_not_cured.exploit_mechanism}
                      </p>
                    </div>

                    <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-4 space-y-1.5">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-amber-900 block">
                        Attacker Capabilities Once Exploited
                      </span>
                      <p className="text-xs md:text-sm text-amber-950 leading-relaxed font-medium">
                        {actionPlan.what_if_not_cured.attacker_capability}
                      </p>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-1.5 shadow-xs">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                        Mission &amp; Core Business Consequence
                      </span>
                      <p className="text-xs md:text-sm text-slate-700 leading-relaxed">
                        {actionPlan.consequences.primary_impact || actionPlan.consequences.clinical_impact}
                      </p>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-1.5 shadow-xs">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                        Operational Service Disruption
                      </span>
                      <p className="text-xs md:text-sm text-slate-700 leading-relaxed">
                        {actionPlan.consequences.operational_impact}
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-1 shadow-xs">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                          Legal &amp; Regulatory
                        </span>
                        <p className="text-xs text-slate-700 leading-relaxed">
                          {actionPlan.consequences.legal_regulatory}
                        </p>
                      </div>

                      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-1 shadow-xs">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-rose-600 block">
                          Estimated Financial Cost
                        </span>
                        <p className="text-sm font-extrabold text-rose-600">
                          {actionPlan.consequences.financial_cost}
                        </p>
                      </div>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between text-xs shadow-xs">
                      <div>
                        <span className="text-slate-500 block text-[11px]">Live Exploit Telemetry (EPSS):</span>
                        <span className="text-amber-600 font-extrabold text-sm">
                          {actionPlan.what_if_not_cured.epss_probability}
                        </span>
                      </div>
                      <span className="text-[11px] font-extrabold px-3 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                        {actionPlan.what_if_not_cured.weaponized_status}
                      </span>
                    </div>
                  </div>

                  {/* RIGHT COLUMN: REMEDIATION INSTRUCTIONS */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 pb-2 border-b border-emerald-200">
                      <span className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center font-bold text-xs">
                        🛡️
                      </span>
                      <h3 className="text-base font-extrabold text-slate-900 tracking-tight">
                        How to remediate
                      </h3>
                    </div>

                    <div className="space-y-3">
                      <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-4">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-extrabold text-emerald-800 uppercase tracking-wide">
                            01 — Official Mandate &amp; Advisory
                          </span>
                          {actionPlan.remedy.due_date && (
                            <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full border border-emerald-300">
                              Due: {actionPlan.remedy.due_date}
                            </span>
                          )}
                        </div>
                        <p className="text-xs md:text-sm text-slate-800 font-medium">
                          {actionPlan.remedy.cisa_mandate || "Apply vendor security updates immediately."}
                        </p>
                      </div>

                      {/* Terminal Code Box inside card */}
                      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2 shadow-inner">
                        <div className="flex items-center justify-between text-[10px] text-slate-400 font-bold uppercase tracking-wider font-sans">
                          <span>02 — Apply Recommended Security Patch</span>
                          <button
                            onClick={() => copyToClipboard(actionPlan.remedy.patch_command)}
                            className="text-xs bg-slate-800 hover:bg-slate-700 text-white px-2.5 py-1 rounded-lg border border-slate-700 transition-colors cursor-pointer"
                          >
                            {copiedCmd ? "✓ Copied!" : "📋 Copy Command"}
                          </button>
                        </div>
                        <pre className="font-mono text-xs text-emerald-400 overflow-x-auto whitespace-pre-wrap leading-relaxed">
                          {actionPlan.remedy.patch_command}
                        </pre>
                      </div>

                      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-1 shadow-xs">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wide block">
                          03 — Configuration Hardening &amp; Workaround
                        </span>
                        <p className="text-xs md:text-sm text-slate-700">
                          {actionPlan.remedy.workaround}
                        </p>
                      </div>

                      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-1 shadow-xs">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wide block">
                          04 — Network Firewall Containment Rule
                        </span>
                        <code className="block font-mono text-xs text-slate-800 bg-slate-50 p-2.5 rounded-lg border border-slate-200 overflow-x-auto">
                          {actionPlan.remedy.firewall_rule}
                        </code>
                      </div>

                      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-1 shadow-xs">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wide block">
                          05 — Post-Patch Validation &amp; Verification
                        </span>
                        <p className="text-xs md:text-sm text-slate-700 font-mono">
                          {actionPlan.remedy.verification_step}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* ══════════════════════════════════════════════════════════════════ */
                /* MODE: APPROACH B (LUMINOUS IMPACT → ACTION FLOW)                   */
                /* ══════════════════════════════════════════════════════════════════ */
                <div className="space-y-4">
                  <p className="text-xs md:text-sm text-slate-500 border-b border-slate-200 pb-3">
                    Understand the potential impact and the actions that can help prevent or resolve it.
                  </p>

                  <div className="space-y-3">
                    {/* Row 1 */}
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-center gap-4 bg-white border border-slate-200 p-5 rounded-2xl shadow-xs hover:shadow-md transition-shadow">
                      <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 space-y-1">
                        <div className="flex items-center gap-2 text-rose-700">
                          <span>⚠️</span>
                          <span className="text-xs font-extrabold uppercase tracking-wide">
                            Potential Impact: System Crash &amp; Execution
                          </span>
                        </div>
                        <p className="text-xs text-slate-700 leading-relaxed">
                          Attacker exploits component mechanism to exhaust memory or execute unauthorized commands.
                        </p>
                      </div>

                      <div className="flex items-center justify-center text-indigo-600 text-xl font-bold px-2">
                        <span className="hidden md:inline">→</span>
                        <span className="md:hidden text-xs text-slate-400">↓ REMEDIATION:</span>
                      </div>

                      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-1">
                        <div className="flex items-center gap-2 text-emerald-800">
                          <span>🛡️</span>
                          <span className="text-xs font-extrabold uppercase tracking-wide">
                            Remediation Action: Apply Package Security Patch
                          </span>
                        </div>
                        <p className="text-xs text-slate-700 leading-relaxed">
                          Upgrade {software} to the patched vendor security release to close the vulnerability.
                        </p>
                      </div>
                    </div>

                    {/* Row 2 */}
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-center gap-4 bg-white border border-slate-200 p-5 rounded-2xl shadow-xs hover:shadow-md transition-shadow">
                      <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 space-y-1">
                        <div className="flex items-center gap-2 text-rose-700">
                          <span>⚠️</span>
                          <span className="text-xs font-extrabold uppercase tracking-wide">
                            Potential Impact: Privilege Escalation &amp; Root Takeover
                          </span>
                        </div>
                        <p className="text-xs text-slate-700 leading-relaxed">
                          Flaw allows unprivileged processes to gain administrative tier rights across the asset.
                        </p>
                      </div>

                      <div className="flex items-center justify-center text-indigo-600 text-xl font-bold px-2">
                        <span className="hidden md:inline">→</span>
                        <span className="md:hidden text-xs text-slate-400">↓ REMEDIATION:</span>
                      </div>

                      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-1">
                        <div className="flex items-center gap-2 text-emerald-800">
                          <span>🛡️</span>
                          <span className="text-xs font-extrabold uppercase tracking-wide">
                            Remediation Action: Deploy Hardening Workaround
                          </span>
                        </div>
                        <p className="text-xs text-slate-700 leading-relaxed">
                          Restrict permissions and disable vulnerable feature flags in daemon configuration.
                        </p>
                      </div>
                    </div>

                    {/* Row 3 */}
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-center gap-4 bg-white border border-slate-200 p-5 rounded-2xl shadow-xs hover:shadow-md transition-shadow">
                      <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 space-y-1">
                        <div className="flex items-center gap-2 text-rose-700">
                          <span>⚠️</span>
                          <span className="text-xs font-extrabold uppercase tracking-wide">
                            Potential Impact: Lateral Movement Across Perimeter
                          </span>
                        </div>
                        <p className="text-xs text-slate-700 leading-relaxed">
                          Exposed network port enables attackers to pivot from compromised asset to internal servers.
                        </p>
                      </div>

                      <div className="flex items-center justify-center text-indigo-600 text-xl font-bold px-2">
                        <span className="hidden md:inline">→</span>
                        <span className="md:hidden text-xs text-slate-400">↓ REMEDIATION:</span>
                      </div>

                      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-1">
                        <div className="flex items-center gap-2 text-emerald-800">
                          <span>🛡️</span>
                          <span className="text-xs font-extrabold uppercase tracking-wide">
                            Remediation Action: Enforce Firewall ACL Containment
                          </span>
                        </div>
                        <p className="text-xs text-slate-700 leading-relaxed">
                          Block untrusted incoming subnet traffic and isolate port to authorized IT jump hosts.
                        </p>
                      </div>
                    </div>

                    {/* Row 4 */}
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-center gap-4 bg-white border border-slate-200 p-5 rounded-2xl shadow-xs hover:shadow-md transition-shadow">
                      <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 space-y-1">
                        <div className="flex items-center gap-2 text-rose-700">
                          <span>⚠️</span>
                          <span className="text-xs font-extrabold uppercase tracking-wide">
                            Potential Impact: Regulatory Liabilities &amp; Fines
                          </span>
                        </div>
                        <p className="text-xs text-slate-700 leading-relaxed">
                          Statutory non-compliance penalties ({actionPlan.consequences.domain_category || "Enterprise"}) and business disruption.
                        </p>
                      </div>

                      <div className="flex items-center justify-center text-indigo-600 text-xl font-bold px-2">
                        <span className="hidden md:inline">→</span>
                        <span className="md:hidden text-xs text-slate-400">↓ REMEDIATION:</span>
                      </div>

                      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-1">
                        <div className="flex items-center gap-2 text-emerald-800">
                          <span>🛡️</span>
                          <span className="text-xs font-extrabold uppercase tracking-wide">
                            Remediation Action: Validate Service Patch &amp; Rescan
                          </span>
                        </div>
                        <p className="text-xs text-slate-700 leading-relaxed">
                          Execute CLI verification command and rescan asset to ensure zero residual exploit traces.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Expandable Section */}
                  <div className="border border-slate-200 bg-white rounded-2xl overflow-hidden shadow-xs">
                    <button
                      onClick={() => setShowDetailedInB(!showDetailedInB)}
                      className="w-full px-5 py-3.5 flex items-center justify-between text-xs font-bold text-indigo-600 hover:text-indigo-800 hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      <span>{showDetailedInB ? "Hide detailed analysis" : "View detailed analysis"}</span>
                      <span className="text-sm">{showDetailedInB ? "▲" : "▼"}</span>
                    </button>

                    {showDetailedInB && (
                      <div className="p-5 border-t border-slate-200 space-y-4 text-xs animate-fadeIn bg-slate-50">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <span className="font-bold text-rose-700 uppercase tracking-wide block">
                              Complete Technical Threat Mechanism:
                            </span>
                            <p className="text-slate-700 leading-relaxed bg-white p-3.5 rounded-xl border border-slate-200">
                              {actionPlan.what_if_not_cured.exploit_mechanism}
                            </p>
                          </div>
                          <div className="space-y-2">
                            <span className="font-bold text-emerald-800 uppercase tracking-wide block">
                              Terminal Patch Command:
                            </span>
                            <pre className="font-mono text-emerald-400 bg-slate-900 p-3.5 rounded-xl border border-slate-800 overflow-x-auto whitespace-pre-wrap">
                              {actionPlan.remedy.patch_command}
                            </pre>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                          <div className="bg-white p-3 rounded-xl border border-slate-200">
                            <span className="text-slate-400 uppercase text-[10px] font-bold block">Operational Impact</span>
                            <span className="text-slate-800 font-semibold">{actionPlan.consequences.operational_impact}</span>
                          </div>
                          <div className="bg-white p-3 rounded-xl border border-slate-200">
                            <span className="text-slate-400 uppercase text-[10px] font-bold block">Legal &amp; Compliance</span>
                            <span className="text-slate-800 font-semibold">{actionPlan.consequences.legal_regulatory}</span>
                          </div>
                          <div className="bg-white p-3 rounded-xl border border-slate-200">
                            <span className="text-slate-400 uppercase text-[10px] font-bold block">Estimated Cost</span>
                            <span className="text-rose-600 font-bold">{actionPlan.consequences.financial_cost}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* ── MODAL FOOTER ────────────────────────────────────────────────── */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
              <div className="flex items-center gap-2">
                <span>Active Perspective:</span>
                <span className="text-indigo-700 font-bold">
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
                    className="text-indigo-600 hover:text-indigo-800 hover:underline ml-2 font-semibold"
                  >
                    Official NIST Advisory ↗
                  </a>
                )}
              </div>

              <button
                onClick={handleCloseModal}
                className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold px-4 py-2 rounded-xl transition-colors cursor-pointer"
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
