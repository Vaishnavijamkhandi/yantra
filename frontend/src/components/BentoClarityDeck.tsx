import { useState } from "react";
import type { ActionPlanProfile, AssetVulnerability } from "../types/asset";

interface Props {
  actionPlan: ActionPlanProfile;
  selectedFinding?: AssetVulnerability | null;
  onQuarantine?: (assetId: number) => void;
  onResolve?: (findingId: number) => void;
}

export default function BentoClarityDeck({
  actionPlan,
  selectedFinding,
  onQuarantine,
  onResolve,
}: Props) {
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [copiedRule, setCopiedRule] = useState(false);
  const [resolved, setResolved] = useState(false);

  function copyText(text: string, isRule = false) {
    navigator.clipboard.writeText(text);
    if (isRule) {
      setCopiedRule(true);
      setTimeout(() => setCopiedRule(false), 2000);
    } else {
      setCopiedCmd(true);
      setTimeout(() => setCopiedCmd(false), 2000);
    }
  }

  const cvss = actionPlan.cvss_score ?? selectedFinding?.vulnerability.cvss_score ?? 7.5;
  const severity =
    selectedFinding?.vulnerability.severity?.toUpperCase() ||
    (cvss >= 9 ? "CRITICAL" : cvss >= 7 ? "HIGH" : "MEDIUM");
  
  // Extract EPSS float percentage for progress bar
  const epssRaw = actionPlan.what_if_not_cured.epss_probability || "";
  const epssMatch = epssRaw.match(/([\d.]+)%/);
  const epssNum = epssMatch ? Math.min(100, Math.max(0, parseFloat(epssMatch[1]))) : 85;

  return (
    <div className="w-full space-y-4 font-sans text-slate-100">
      {/* ── BENTO GRID LAYOUT ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-4">
        
        {/* ── TILE 1: CORE THREAT IDENTITY (Lg: 5 cols) ─────────────────────── */}
        <div className="lg:col-span-5 bg-gradient-to-br from-slate-900/90 via-slate-900/80 to-slate-950/90 border border-slate-800 hover:border-slate-700/80 rounded-2xl p-5 shadow-lg backdrop-blur-md flex flex-col justify-between transition-all duration-300">
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
                <span className="text-xs font-mono font-bold text-cyan-400">
                  {actionPlan.cve_id}
                </span>
              </div>
              <span
                className={`text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${
                  severity === "CRITICAL"
                    ? "bg-rose-950/80 text-rose-300 border-rose-800/80"
                    : "bg-amber-950/80 text-amber-300 border-amber-800/80"
                }`}
              >
                {severity} (CVSS {cvss.toFixed(1)})
              </span>
            </div>

            <h3 className="text-base font-bold text-white tracking-tight line-clamp-2 leading-snug">
              {actionPlan.remedy.title}
            </h3>

            <div className="mt-4 pt-3 border-t border-slate-800/80 grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-semibold">Target Asset</span>
                <span className="text-slate-200 font-semibold">{actionPlan.asset_name}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-semibold">Component</span>
                <span className="text-cyan-300 font-medium font-mono">{actionPlan.software}</span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
            <span>Threat Status: <strong className="text-rose-400">Unpatched Finding</strong></span>
            {actionPlan.reference_url && (
              <a
                href={actionPlan.reference_url}
                target="_blank"
                rel="noreferrer"
                className="text-cyan-400 hover:text-cyan-300 hover:underline flex items-center gap-1"
              >
                <span>NVD Advisory</span>
                <span>↗</span>
              </a>
            )}
          </div>
        </div>

        {/* ── TILE 2: LIVE WEAPONIZATION & EPSS METER (Lg: 4 cols) ───────────── */}
        <div className="lg:col-span-4 bg-gradient-to-br from-slate-900/90 to-slate-950/90 border border-slate-800 hover:border-slate-700/80 rounded-2xl p-5 shadow-lg backdrop-blur-md flex flex-col justify-between transition-all duration-300">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Live Exploit Telemetry
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                FIRST.org API
              </span>
            </div>

            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-3xl font-extrabold text-amber-400 tracking-tight font-mono">
                {epssNum.toFixed(1)}%
              </span>
              <span className="text-xs text-slate-400">active exploitation likelihood</span>
            </div>

            {/* Glowing progress bar */}
            <div className="w-full bg-slate-800/80 rounded-full h-2 mt-3 overflow-hidden border border-slate-700/50">
              <div
                className={`h-full rounded-full transition-all duration-1000 ${
                  epssNum > 75
                    ? "bg-gradient-to-r from-amber-500 to-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.5)]"
                    : "bg-gradient-to-r from-cyan-500 to-blue-500"
                }`}
                style={{ width: `${Math.max(5, epssNum)}%` }}
              />
            </div>

            {actionPlan.what_if_not_cured.epss_percentile && (
              <p className="text-[11px] text-slate-400 mt-2">
                Higher threat than <strong className="text-slate-200">{actionPlan.what_if_not_cured.epss_percentile}%</strong> of all known catalogued CVEs.
              </p>
            )}
          </div>

          <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between">
            <span className="text-[10px] text-slate-500 uppercase font-semibold">CISA KEV Status:</span>
            <span className="text-[11px] font-bold text-rose-300 bg-rose-950/60 px-2 py-0.5 rounded border border-rose-900/60">
              {actionPlan.what_if_not_cured.weaponized_status}
            </span>
          </div>
        </div>

        {/* ── TILE 3: BUSINESS & FINANCIAL EXPOSURE (Lg: 3 cols) ──────────────── */}
        <div className="lg:col-span-3 bg-gradient-to-br from-slate-900/90 to-slate-950/90 border border-slate-800 hover:border-slate-700/80 rounded-2xl p-5 shadow-lg backdrop-blur-md flex flex-col justify-between transition-all duration-300">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Financial Exposure
              </span>
              {actionPlan.consequences.domain_category && (
                <span className="text-[10px] font-bold text-cyan-300 bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-800/40">
                  {actionPlan.consequences.domain_category.split(" ")[0]}
                </span>
              )}
            </div>

            <div className="mt-2 text-2xl font-black text-rose-400 tracking-tight">
              {actionPlan.consequences.financial_cost.split(" ")[1] || actionPlan.consequences.financial_cost}
            </div>
            <span className="text-[11px] text-slate-400 block mt-0.5">estimated downtime &amp; fallout</span>

            <p className="text-xs text-slate-300 mt-3 line-clamp-3 leading-relaxed">
              {actionPlan.consequences.operational_impact}
            </p>
          </div>

          <div className="mt-3 pt-3 border-t border-slate-800/80 text-[11px] text-slate-400 flex items-center justify-between">
            <span>Regulatory SLA:</span>
            <span className="text-amber-300 font-semibold">Mandatory Review</span>
          </div>
        </div>

        {/* ── TILE 4: TECHNICAL EXPLOIT MECHANISM (WHAT IF EXPLOITED) (Lg: 6 cols) ── */}
        <div className="lg:col-span-6 bg-slate-900/80 border border-slate-800 hover:border-slate-700/80 rounded-2xl p-5 shadow-lg backdrop-blur-md space-y-3 transition-all duration-300">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
            <div className="flex items-center gap-2">
              <span className="text-rose-400 font-bold">⚠️</span>
              <h4 className="text-xs font-bold uppercase tracking-wider text-rose-300">
                What-If Analysis: Technical Exploit Mechanism
              </h4>
            </div>
            <span className="text-[10px] text-slate-500 font-mono">Attack Vector</span>
          </div>

          <p className="text-xs md:text-sm text-slate-300 leading-relaxed">
            {actionPlan.what_if_not_cured.exploit_mechanism}
          </p>

          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 space-y-1">
            <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wide block">
              Attacker Capabilities Once Exploited:
            </span>
            <p className="text-xs text-slate-300 font-medium">
              {actionPlan.what_if_not_cured.attacker_capability}
            </p>
          </div>

          <div className="text-xs text-slate-400 pt-1">
            <strong className="text-slate-300">Mission &amp; Core Business Fallout:</strong>{" "}
            {actionPlan.consequences.primary_impact || actionPlan.consequences.clinical_impact}
          </div>
        </div>

        {/* ── TILE 5: TERMINAL REMEDIATION DECK (Lg: 6 cols) ─────────────────── */}
        <div className="lg:col-span-6 bg-slate-900/80 border border-slate-800 hover:border-slate-700/80 rounded-2xl p-5 shadow-lg backdrop-blur-md space-y-3 transition-all duration-300">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
            <div className="flex items-center gap-2">
              <span className="text-emerald-400 font-bold">🛡️</span>
              <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-300">
                Remediation Deck: Terminal Security Patch
              </h4>
            </div>
            {actionPlan.remedy.due_date && (
              <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-800/50">
                CISA Due: {actionPlan.remedy.due_date}
              </span>
            )}
          </div>

          {actionPlan.remedy.cisa_mandate && (
            <p className="text-xs text-slate-300 font-medium leading-relaxed">
              {actionPlan.remedy.cisa_mandate}
            </p>
          )}

          {/* Terminal Command Box */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-xs space-y-2">
            <div className="flex items-center justify-between text-[10px] text-slate-500 uppercase tracking-wider">
              <span>TERMINAL PATCH COMMAND</span>
              <button
                onClick={() => copyText(actionPlan.remedy.patch_command, false)}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-2 py-0.5 rounded text-[10px] font-semibold transition-colors cursor-pointer"
              >
                {copiedCmd ? "✓ Copied!" : "📋 Copy"}
              </button>
            </div>
            <pre className="text-emerald-300 overflow-x-auto whitespace-pre-wrap">
              {actionPlan.remedy.patch_command}
            </pre>
          </div>

          {/* Verification Step */}
          <div className="flex items-start gap-2 bg-slate-950/50 p-2.5 rounded-lg border border-slate-800/80 text-xs text-slate-300">
            <span className="text-cyan-400 font-bold">Verify:</span>
            <code className="font-mono text-cyan-300 flex-1">{actionPlan.remedy.verification_step}</code>
          </div>
        </div>

        {/* ── TILE 6: FIREWALL CONTAINMENT & WORKAROUND (Lg: 7 cols) ─────────── */}
        <div className="lg:col-span-7 bg-slate-900/80 border border-slate-800 hover:border-slate-700/80 rounded-2xl p-5 shadow-lg backdrop-blur-md space-y-3 transition-all duration-300">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <span>🔒 Network Isolation &amp; Emergency Workaround</span>
            </h4>
            <span className="text-[10px] text-slate-500">Perimeter Containment</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="bg-slate-950/70 border border-slate-800 p-3 rounded-xl space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">
                Hardening Workaround:
              </span>
              <p className="text-slate-300 text-xs leading-relaxed">
                {actionPlan.remedy.workaround}
              </p>
            </div>

            <div className="bg-slate-950/70 border border-slate-800 p-3 rounded-xl space-y-1">
              <div className="flex items-center justify-between text-[10px] text-slate-400 uppercase tracking-wide">
                <span>Firewall Isolation Rule:</span>
                <button
                  onClick={() => copyText(actionPlan.remedy.firewall_rule, true)}
                  className="text-cyan-400 hover:text-cyan-300 cursor-pointer"
                >
                  {copiedRule ? "✓ Copied" : "Copy"}
                </button>
              </div>
              <code className="font-mono text-[11px] text-cyan-300 block bg-slate-900 p-2 rounded border border-slate-800 overflow-x-auto">
                {actionPlan.remedy.firewall_rule}
              </code>
            </div>
          </div>
        </div>

        {/* ── TILE 7: REGULATORY COMPLIANCE & ACTION CONTROLS (Lg: 5 cols) ────── */}
        <div className="lg:col-span-5 bg-slate-900/80 border border-slate-800 hover:border-slate-700/80 rounded-2xl p-5 shadow-lg backdrop-blur-md flex flex-col justify-between space-y-3 transition-all duration-300">
          <div>
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2 mb-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <span>⚖️ Legal &amp; Compliance Liabilities</span>
              </h4>
              <span className="text-[10px] text-slate-500 font-mono">Statutory Audit</span>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              {actionPlan.consequences.legal_regulatory}
            </p>
          </div>

          <div className="pt-3 border-t border-slate-800/80 flex items-center gap-2">
            {selectedFinding && onQuarantine && (
              <button
                onClick={() => onQuarantine(selectedFinding.asset_id)}
                className="flex-1 bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-800/60 hover:border-rose-700 font-semibold py-2 px-3 rounded-lg text-xs transition-colors cursor-pointer text-center"
              >
                Isolate Host Subnet
              </button>
            )}
            {selectedFinding && onResolve && (
              <button
                onClick={() => {
                  onResolve(selectedFinding.id);
                  setResolved(true);
                }}
                disabled={resolved}
                className="flex-1 bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-800/60 hover:border-emerald-700 font-semibold py-2 px-3 rounded-lg text-xs transition-colors cursor-pointer text-center disabled:opacity-50"
              >
                {resolved ? "✓ Remediated" : "Mark as Resolved"}
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
