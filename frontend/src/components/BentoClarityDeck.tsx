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

  // Extract EPSS percentage for meter
  const epssRaw = actionPlan.what_if_not_cured.epss_probability || "";
  const epssMatch = epssRaw.match(/([\d.]+)%/);
  const epssNum = epssMatch ? Math.min(100, Math.max(0, parseFloat(epssMatch[1]))) : 88.5;

  return (
    <div className="w-full space-y-4 font-sans text-slate-800">
      {/* ── BENTO GRID ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-4">
        
        {/* ── TILE 1: THREAT IDENTITY & TARGET HOST (Lg: 5 cols) ─────────────── */}
        <div className="lg:col-span-5 bg-white border border-slate-200/90 hover:border-slate-300 rounded-3xl p-6 shadow-[0_4px_20px_rgb(0,0,0,0.03)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] flex flex-col justify-between transition-all duration-300 relative overflow-hidden group">
          {/* Top subtle color strip */}
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-rose-500 via-amber-500 to-indigo-500" />

          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
                <span className="font-mono text-xs font-bold text-slate-800 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                  {actionPlan.cve_id}
                </span>
              </div>
              <span
                className={`text-[11px] font-extrabold uppercase tracking-wider px-3 py-1 rounded-full border shadow-2xs ${
                  severity === "CRITICAL"
                    ? "bg-rose-50 text-rose-700 border-rose-200"
                    : "bg-amber-50 text-amber-800 border-amber-200"
                }`}
              >
                {severity} • CVSS {cvss.toFixed(1)}
              </span>
            </div>

            <h3 className="text-base font-extrabold text-slate-900 tracking-tight leading-snug line-clamp-2">
              {actionPlan.remedy.title}
            </h3>

            <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-2 gap-3 text-xs">
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Target Host</span>
                <span className="text-slate-800 font-bold mt-0.5 block">{actionPlan.asset_name}</span>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Component</span>
                <span className="text-indigo-600 font-semibold font-mono mt-0.5 block truncate">{actionPlan.software}</span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Threat Status: <strong className="text-rose-600 font-semibold">Active Unpatched Flaw</strong></span>
            {actionPlan.reference_url && (
              <a
                href={actionPlan.reference_url}
                target="_blank"
                rel="noreferrer"
                className="text-indigo-600 hover:text-indigo-800 hover:underline font-semibold flex items-center gap-1"
              >
                <span>NVD Advisory</span>
                <span>↗</span>
              </a>
            )}
          </div>
        </div>

        {/* ── TILE 2: LIVE WEAPONIZATION & EPSS METER (Lg: 4 cols) ───────────── */}
        <div className="lg:col-span-4 bg-white border border-slate-200/90 hover:border-slate-300 rounded-3xl p-6 shadow-[0_4px_20px_rgb(0,0,0,0.03)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] flex flex-col justify-between transition-all duration-300 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-amber-500 to-rose-500" />

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Live Exploit Likelihood
              </span>
              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                FIRST.org API
              </span>
            </div>

            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-4xl font-black text-amber-500 tracking-tight font-mono">
                {epssNum.toFixed(1)}%
              </span>
              <span className="text-xs font-medium text-slate-500">probability in the wild</span>
            </div>

            {/* Vibrant progress meter */}
            <div className="w-full bg-slate-100 rounded-full h-3 mt-3 overflow-hidden border border-slate-200 p-0.5 shadow-inner">
              <div
                className={`h-full rounded-full transition-all duration-1000 ${
                  epssNum > 75
                    ? "bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500 shadow-xs"
                    : "bg-gradient-to-r from-cyan-400 to-indigo-500"
                }`}
                style={{ width: `${Math.max(6, epssNum)}%` }}
              />
            </div>

            {actionPlan.what_if_not_cured.epss_percentile && (
              <p className="text-xs text-slate-500 mt-2.5">
                Higher threat than <strong className="text-slate-800 font-bold">{actionPlan.what_if_not_cured.epss_percentile}%</strong> of all catalogued CVEs.
              </p>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
            <span className="text-[10px] text-slate-400 uppercase font-bold">CISA KEV Status:</span>
            <span className="text-xs font-extrabold text-rose-700 bg-rose-50 px-2.5 py-0.5 rounded-full border border-rose-200 shadow-2xs">
              {actionPlan.what_if_not_cured.weaponized_status}
            </span>
          </div>
        </div>

        {/* ── TILE 3: BUSINESS & FINANCIAL EXPOSURE (Lg: 3 cols) ──────────────── */}
        <div className="lg:col-span-3 bg-white border border-slate-200/90 hover:border-slate-300 rounded-3xl p-6 shadow-[0_4px_20px_rgb(0,0,0,0.03)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] flex flex-col justify-between transition-all duration-300 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-indigo-500 to-cyan-500" />

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Financial Exposure
              </span>
              {actionPlan.consequences.domain_category && (
                <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-200">
                  {actionPlan.consequences.domain_category.split(" ")[0]}
                </span>
              )}
            </div>

            <div className="mt-2 text-2xl font-black text-rose-600 tracking-tight font-mono">
              {actionPlan.consequences.financial_cost.split(" ")[1] || actionPlan.consequences.financial_cost}
            </div>
            <span className="text-[11px] text-slate-400 font-medium block mt-0.5">estimated operational fallout</span>

            <p className="text-xs text-slate-600 mt-3 line-clamp-3 leading-relaxed">
              {actionPlan.consequences.operational_impact}
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500 flex items-center justify-between">
            <span>Regulatory Impact:</span>
            <span className="text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded border border-amber-200">High Penalty</span>
          </div>
        </div>

        {/* ── TILE 4: TECHNICAL EXPLOIT MECHANISM (WHAT-IF) (Lg: 6 cols) ──────── */}
        <div className="lg:col-span-6 bg-white border border-slate-200/90 hover:border-slate-300 rounded-3xl p-6 shadow-[0_4px_20px_rgb(0,0,0,0.03)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] space-y-3.5 transition-all duration-300">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-rose-50 text-rose-600 border border-rose-200 flex items-center justify-center font-bold text-xs">
                ⚠️
              </span>
              <h4 className="text-sm font-extrabold text-slate-900 tracking-tight">
                What Happens If Exploited? (Attack Vector)
              </h4>
            </div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">What-If Analysis</span>
          </div>

          <p className="text-xs md:text-sm text-slate-700 leading-relaxed font-normal">
            {actionPlan.what_if_not_cured.exploit_mechanism}
          </p>

          <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-4 space-y-1">
            <span className="text-[11px] font-bold text-amber-900 uppercase tracking-wide block">
              Attacker Capabilities Once Inside:
            </span>
            <p className="text-xs text-amber-950 font-medium leading-relaxed">
              {actionPlan.what_if_not_cured.attacker_capability}
            </p>
          </div>

          <div className="text-xs text-slate-600 pt-1">
            <strong className="text-slate-800">Mission &amp; Core Business Fallout:</strong>{" "}
            {actionPlan.consequences.primary_impact || actionPlan.consequences.clinical_impact}
          </div>
        </div>

        {/* ── TILE 5: TERMINAL REMEDIATION DECK (Lg: 6 cols) ─────────────────── */}
        <div className="lg:col-span-6 bg-white border border-slate-200/90 hover:border-slate-300 rounded-3xl p-6 shadow-[0_4px_20px_rgb(0,0,0,0.03)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] space-y-3.5 transition-all duration-300">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center font-bold text-xs">
                🛡️
              </span>
              <h4 className="text-sm font-extrabold text-slate-900 tracking-tight">
                Remediation Action: Terminal Patch Command
              </h4>
            </div>
            {actionPlan.remedy.due_date && (
              <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                Due: {actionPlan.remedy.due_date}
              </span>
            )}
          </div>

          {actionPlan.remedy.cisa_mandate && (
            <p className="text-xs text-slate-700 font-medium leading-relaxed">
              {actionPlan.remedy.cisa_mandate}
            </p>
          )}

          {/* High-Contrast Modern Dark Terminal Code Box inside the clean card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 font-mono text-xs space-y-2 shadow-inner">
            <div className="flex items-center justify-between text-[10px] text-slate-400 uppercase tracking-wider font-sans">
              <span className="flex items-center gap-1.5 font-bold">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                TERMINAL PATCH COMMAND
              </span>
              <button
                onClick={() => copyText(actionPlan.remedy.patch_command, false)}
                className="bg-slate-800 hover:bg-slate-700 text-white px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-colors cursor-pointer border border-slate-700 flex items-center gap-1"
              >
                <span>{copiedCmd ? "✓ Copied!" : "📋 Copy"}</span>
              </button>
            </div>
            <pre className="text-emerald-400 overflow-x-auto whitespace-pre-wrap leading-relaxed">
              {actionPlan.remedy.patch_command}
            </pre>
          </div>

          {/* Verification Step */}
          <div className="flex items-start gap-2 bg-sky-50/80 p-3 rounded-xl border border-sky-200/80 text-xs text-sky-950 font-medium">
            <span className="text-indigo-600 font-bold">Verify Fix:</span>
            <code className="font-mono text-sky-900 flex-1 truncate">{actionPlan.remedy.verification_step}</code>
          </div>
        </div>

        {/* ── TILE 6: NETWORK CONTAINMENT & WORKAROUND (Lg: 7 cols) ──────────── */}
        <div className="lg:col-span-7 bg-white border border-slate-200/90 hover:border-slate-300 rounded-3xl p-6 shadow-[0_4px_20px_rgb(0,0,0,0.03)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] space-y-3 transition-all duration-300">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-200 flex items-center justify-center font-bold text-xs">
                🔒
              </span>
              <h4 className="text-sm font-extrabold text-slate-900 tracking-tight">
                Network Containment &amp; Hardening Workaround
              </h4>
            </div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Perimeter Control</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="bg-slate-50 border border-slate-200/80 p-3.5 rounded-2xl space-y-1">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                Configuration Workaround:
              </span>
              <p className="text-slate-700 text-xs leading-relaxed">
                {actionPlan.remedy.workaround}
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200/80 p-3.5 rounded-2xl space-y-1">
              <div className="flex items-center justify-between text-[10px] text-slate-500 uppercase tracking-wider font-bold">
                <span>Firewall Isolation Rule:</span>
                <button
                  onClick={() => copyText(actionPlan.remedy.firewall_rule, true)}
                  className="text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer"
                >
                  {copiedRule ? "✓ Copied" : "Copy"}
                </button>
              </div>
              <code className="font-mono text-[11px] text-slate-800 block bg-white p-2 rounded-lg border border-slate-200 overflow-x-auto">
                {actionPlan.remedy.firewall_rule}
              </code>
            </div>
          </div>
        </div>

        {/* ── TILE 7: LEGAL COMPLIANCE & ACTION CONTROLS (Lg: 5 cols) ─────────── */}
        <div className="lg:col-span-5 bg-white border border-slate-200/90 hover:border-slate-300 rounded-3xl p-6 shadow-[0_4px_20px_rgb(0,0,0,0.03)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] flex flex-col justify-between space-y-3 transition-all duration-300">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-2">
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg bg-purple-50 text-purple-600 border border-purple-200 flex items-center justify-center font-bold text-xs">
                  ⚖️
                </span>
                <h4 className="text-sm font-extrabold text-slate-900 tracking-tight">
                  Legal &amp; Compliance Liabilities
                </h4>
              </div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">Statutory Audit</span>
            </div>

            <p className="text-xs text-slate-700 leading-relaxed">
              {actionPlan.consequences.legal_regulatory}
            </p>
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center gap-2.5">
            {selectedFinding && onQuarantine && (
              <button
                onClick={() => onQuarantine(selectedFinding.asset_id)}
                className="flex-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold py-2.5 px-3 rounded-xl text-xs transition-colors cursor-pointer text-center shadow-xs"
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
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-3 rounded-xl text-xs transition-colors cursor-pointer text-center shadow-sm disabled:opacity-50"
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
