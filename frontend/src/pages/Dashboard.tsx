import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  getAssets,
  getRiskSummary,
  getLatestRisks,
  getDepartmentRisks,
  assessAllRisks,
  assessAssetRisk,
  seedVulnerabilities,
  getGapSummary,
} from "../services/api";
import type {
  Asset,
  RiskSummary,
  RiskAssessment,
  DepartmentRisk,
  GapSummary,
} from "../types/asset";

const RISK_BADGE: Record<string, { bg: string; text: string; border: string }> = {
  Critical: { bg: "bg-[#800020]/10", text: "text-[#800020]", border: "border-[#800020]/30" },
  High: { bg: "bg-red-50", text: "text-red-700", border: "border-red-200" },
  Medium: { bg: "bg-amber-50", text: "text-amber-800", border: "border-amber-200" },
  Low: { bg: "bg-emerald-50", text: "text-emerald-800", border: "border-emerald-200" },
};

export default function Dashboard() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [summary, setSummary] = useState<RiskSummary | null>(null);
  const [gapSummary, setGapSummary] = useState<GapSummary | null>(null);
  const [risks, setRisks] = useState<RiskAssessment[]>([]);
  const [departments, setDepartments] = useState<DepartmentRisk[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [riskFilter, setRiskFilter] = useState<string>("ALL");
  const [deptFilter, setDeptFilter] = useState<string>("ALL");

  // Selected Asset for Slide-over Drawer
  const [selectedRisk, setSelectedRisk] = useState<RiskAssessment | null>(null);
  const [simPatch, setSimPatch] = useState<boolean>(false);
  const [simIsolate, setSimIsolate] = useState<boolean>(false);

  // Computed What-If Simulated Factor Scores
  const simMetrics = useMemo(() => {
    if (!selectedRisk) return null;
    const isSimulating = simPatch || simIsolate;
    if (!isSimulating) {
      return {
        active: false,
        severity: selectedRisk.severity_score,
        exploitability: selectedRisk.exploitability_score,
        exposure: selectedRisk.exposure_score,
        criticality: selectedRisk.criticality_score,
        score: selectedRisk.risk_score,
        tier: selectedRisk.risk_level,
        delta: 0,
        pctReduction: 0,
      };
    }

    // 1. Severity: when patched, all active CVEs are resolved -> drops to 0
    const severity = simPatch ? 0 : selectedRisk.severity_score;

    // 2. Exploitability: when patched, active threat vectors are closed -> baseline residual 15;
    //    if not patched but network isolated -> drops by 35%
    let exploitability = selectedRisk.exploitability_score;
    if (simPatch) {
      exploitability = 15;
    } else if (simIsolate) {
      exploitability = Math.max(20, Math.round(selectedRisk.exploitability_score * 0.65));
    }

    // 3. Exposure: if microsegmented / isolated -> drops to 10 (airgap/isolated segment)
    const exposure = simIsolate ? 10 : selectedRisk.exposure_score;

    // 4. Criticality: intrinsic to asset mission value -> preserved
    const criticality = selectedRisk.criticality_score;

    // Weighted risk score calculation (40% Sev, 20% Exploit, 20% Exp, 20% Crit)
    const rawScore =
      0.40 * severity +
      0.20 * exploitability +
      0.20 * exposure +
      0.20 * criticality;
    const score = Math.min(100, Math.max(5, Math.round(rawScore)));

    let tier = "Low";
    if (score >= 80) tier = "Critical";
    else if (score >= 60) tier = "High";
    else if (score >= 30) tier = "Medium";

    const delta = selectedRisk.risk_score - score;
    const pctReduction =
      selectedRisk.risk_score > 0
        ? Math.round((delta / selectedRisk.risk_score) * 100)
        : 0;

    return {
      active: true,
      severity,
      exploitability,
      exposure,
      criticality,
      score,
      tier,
      delta,
      pctReduction,
    };
  }, [selectedRisk, simPatch, simIsolate]);

  async function loadData() {
    try {
      setLoading(true);
      const [assetsData, summaryData, risksData, deptData, gapsData] = await Promise.all([
        getAssets().catch(() => []),
        getRiskSummary().catch(() => null),
        getLatestRisks().catch(() => []),
        getDepartmentRisks().catch(() => []),
        getGapSummary().catch(() => null),
      ]);
      setAssets(assetsData);
      setSummary(summaryData);
      setRisks(risksData);
      setDepartments(deptData);
      setGapSummary(gapsData);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleAssessAll() {
    setActionBusy(true);
    try {
      const report = await assessAllRisks();
      setToastMessage(
        `Fleet assessment complete! Assessed ${report.assessed} assets. Fleet average risk: ${report.average_score}/100.`
      );
      await loadData();
    } catch (e: any) {
      setToastMessage(`Assessment error: ${e.message}`);
    } finally {
      setActionBusy(false);
    }
  }

  async function handleSeedData() {
    setActionBusy(true);
    try {
      await seedVulnerabilities();
      setToastMessage("Seeded curated enterprise CVEs successfully!");
      await loadData();
    } catch (e: any) {
      setToastMessage(`Seed error: ${e.message}`);
    } finally {
      setActionBusy(false);
    }
  }

  async function handleReassessSingle(assetId: number) {
    setActionBusy(true);
    try {
      const updated = await assessAssetRisk(assetId);
      setSelectedRisk(updated);
      setToastMessage(`Re-assessed ${updated.asset_name || "asset"} (Score: ${updated.risk_score})`);
      await loadData();
    } catch (e: any) {
      setToastMessage(`Error: ${e.message}`);
    } finally {
      setActionBusy(false);
    }
  }

  const filteredRisks = useMemo(() => {
    return risks.filter((r) => {
      const matchSearch =
        searchQuery === "" ||
        (r.asset_name?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false) ||
        (r.department?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false) ||
        (r.asset_type?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);

      const matchRisk =
        riskFilter === "ALL" || r.risk_level.toUpperCase() === riskFilter.toUpperCase();

      const matchDept =
        deptFilter === "ALL" || r.department === deptFilter;

      return matchSearch && matchRisk && matchDept;
    });
  }, [risks, searchQuery, riskFilter, deptFilter]);

  const uniqueDepartments = useMemo(() => {
    const set = new Set<string>();
    risks.forEach((r) => {
      if (r.department) set.add(r.department);
    });
    return Array.from(set);
  }, [risks]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 text-stone-900">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="flex items-center justify-between p-4 bg-white border-2 border-[#800020] text-stone-900 rounded-xl shadow-md">
          <div className="flex items-center gap-3">
            <span className="text-[#800020] font-bold text-lg">🛡️</span>
            <span className="text-xs font-semibold">{toastMessage}</span>
          </div>
          <button
            onClick={() => setToastMessage(null)}
            className="text-xs bg-[#f5f0e6] hover:bg-[#ede5d8] text-stone-700 px-3 py-1 rounded-lg font-bold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Top Header & Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[#e5ded0]">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black tracking-tight text-[#800020]">
              Cyber-Risk Operations Center
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold uppercase bg-[#800020]/10 text-[#800020] border border-[#800020]/20">
              CyberSaathi Active
            </span>
          </div>
          <p className="text-stone-600 text-xs mt-1">
            Proactive critical infrastructure risk prediction, multi-vector exposure scoring, and remediation triage.
          </p>
        </div>

        <div className="flex items-center gap-3 font-mono text-xs">
          <button
            onClick={handleSeedData}
            disabled={actionBusy}
            className="px-4 py-2 font-semibold text-stone-700 bg-white border border-[#d6ccbe] hover:bg-[#faf7f2] rounded-xl transition shadow-2xs"
          >
            📥 Seed Curated CVEs
          </button>
          <button
            onClick={handleAssessAll}
            disabled={actionBusy || assets.length === 0}
            className="px-4 py-2 font-bold text-white bg-[#800020] hover:bg-[#66001a] rounded-xl transition shadow-xs uppercase tracking-wide cursor-pointer"
          >
            {actionBusy ? "Calculating..." : "⚡ Assess Fleet Risk"}
          </button>
        </div>
      </div>

      {/* CISA KEV Alert Banner */}
      {summary && summary.cisa_kev_alert_count > 0 && (
        <div className="p-4 bg-white border-l-4 border-[#800020] rounded-r-xl shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-y border-r border-[#e5ded0]">
          <div className="flex items-center gap-3">
            <span className="text-[#800020] text-xl">⚠️</span>
            <div>
              <p className="text-xs font-mono font-bold text-[#800020]">
                ACTIVE EXPLOITATION WARNING: {summary.cisa_kev_alert_count} ASSET(S) IN CISA KEV CATALOG
              </p>
              <p className="text-xs text-stone-600 mt-0.5">
                These vulnerabilities are actively targeted by ransomware campaigns. Remediation is critical within 24 hours.
              </p>
            </div>
          </div>
          <button
            onClick={() => setRiskFilter("CRITICAL")}
            className="text-xs font-bold bg-[#800020] hover:bg-[#66001a] text-white px-3.5 py-1.5 rounded-lg transition shrink-0 font-mono"
          >
            Filter Critical Threats →
          </button>
        </div>
      )}

      {/* Infrastructure Gap Analysis Telemetry */}
      {gapSummary && gapSummary.total_gaps > 0 && (
        <div className="p-4 bg-[#f5f0e6] border border-[#e5ded0] rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-lg bg-[#800020]/10 text-[#800020] border border-[#800020]/20 flex items-center justify-center font-bold text-sm">
              🔍
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-stone-900">
                  {gapSummary.total_gaps} Infrastructure Gaps Detected
                </span>
                {gapSummary.high_severity > 0 && (
                  <span className="px-2 py-0.2 rounded text-[10px] font-bold bg-red-100 text-red-800">
                    {gapSummary.high_severity} HIGH SEVERITY
                  </span>
                )}
              </div>
              <p className="text-xs text-stone-600 mt-0.5">
                Missing vendor details, unverified exposure, or unmapped dependencies affecting {gapSummary.affected_assets_count} asset(s). Clean fleet rate: {gapSummary.coverage_rate}%.
              </p>
            </div>
          </div>
          <Link
            to="/gaps"
            className="text-xs font-bold bg-white border border-[#e5ded0] hover:border-[#800020] text-[#800020] px-3.5 py-1.5 rounded-lg transition shrink-0"
          >
            Review Gaps Console →
          </Link>
        </div>
      )}

      {/* KPI Metric Grid (Beige & Maroon Palette) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-[#e5ded0] shadow-xs">
          <span className="text-[11px] font-mono font-semibold text-stone-500 uppercase">Total Assets</span>
          <div className="text-3xl font-black text-stone-900 mt-1">{summary?.total_assets ?? 0}</div>
          <p className="text-xs text-stone-500 mt-1">{summary?.assessed_assets ?? 0} assessed for risk</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-[#e5ded0] shadow-xs">
          <span className="text-[11px] font-mono font-semibold text-[#800020] uppercase">Vulnerable Assets</span>
          <div className="text-3xl font-black text-[#800020] mt-1 font-mono">
            {summary?.assets_with_confirmed_matches ?? 0}
          </div>
          <p className="text-xs text-stone-500 mt-1">Confirmed CVE matches</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-[#e5ded0] shadow-xs">
          <span className="text-[11px] font-mono font-semibold text-red-700 uppercase">Critical Risks</span>
          <div className="text-3xl font-black text-red-700 mt-1 font-mono">
            {summary?.critical_risk_count ?? 0}
          </div>
          <p className="text-xs text-stone-500 mt-1">Score ≥ 80.0 (Immediate SLA)</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-[#e5ded0] shadow-xs">
          <span className="text-[11px] font-mono font-semibold text-stone-500 uppercase">Fleet Average Risk</span>
          <div className="text-3xl font-black text-stone-900 mt-1 font-mono">
            {summary?.average_risk_score ?? 0}
            <span className="text-xs font-normal text-stone-400 ml-1">/100</span>
          </div>
          <p className="text-xs text-stone-500 mt-1">Across monitored assets</p>
        </div>
      </div>

      {/* Visualizations Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Risk Tier Distribution */}
        <div className="bg-white p-5 rounded-2xl border border-[#e5ded0] shadow-xs lg:col-span-1">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-bold text-stone-800 uppercase tracking-wider font-mono">
              Risk Tier Distribution
            </h3>
            <span className="text-[11px] text-stone-400 font-mono">Latest Assessment</span>
          </div>

          <div className="space-y-3">
            {[
              { label: "Critical (80–100)", count: summary?.critical_risk_count ?? 0, color: "bg-[#800020]", text: "text-[#800020]" },
              { label: "High (60–79)", count: summary?.high_risk_count ?? 0, color: "bg-red-600", text: "text-red-700" },
              { label: "Medium (30–59)", count: summary?.medium_risk_count ?? 0, color: "bg-amber-600", text: "text-amber-800" },
              { label: "Low (0–29)", count: summary?.low_risk_count ?? 0, color: "bg-emerald-600", text: "text-emerald-800" },
            ].map((tier) => {
              const totalAssessed = summary?.assessed_assets || 1;
              const pct = Math.round((tier.count / totalAssessed) * 100);
              return (
                <div key={tier.label}>
                  <div className="flex justify-between text-xs font-medium mb-1">
                    <span className="text-stone-700">{tier.label}</span>
                    <span className={`${tier.text} font-mono font-bold`}>{tier.count} ({pct}%)</span>
                  </div>
                  <div className="w-full bg-[#f4efe6] h-2.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${tier.color} transition-all duration-500`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-5 pt-3 border-t border-[#e5ded0] text-[11px] text-stone-500 font-mono leading-relaxed">
            Formula: 40% Severity + 20% Exploitability + 20% Exposure + 20% Criticality.
          </div>
        </div>

        {/* Sector Heatmap */}
        <div className="bg-white p-5 rounded-2xl border border-[#e5ded0] shadow-xs lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-xs font-bold text-stone-800 uppercase tracking-wider font-mono">
                Sector Cyber-Risk Posture
              </h3>
              <p className="text-[11px] text-stone-500 mt-0.5">
                Aggregated posture across critical infrastructure and enterprise business units.
              </p>
            </div>
            <span className="text-[11px] text-[#800020] font-mono font-bold">CERT-In Aligned</span>
          </div>

          {departments.length === 0 ? (
            <div className="py-12 text-center text-stone-400 text-xs font-mono">
              Run risk assessments to populate sector analytics.
            </div>
          ) : (
            <div className="space-y-3">
              {departments.map((dept) => (
                <div key={dept.department} className="flex items-center gap-4">
                  <div className="w-40 text-xs font-semibold text-stone-800 truncate">
                    {dept.department}
                  </div>
                  <div className="flex-1 bg-[#f4efe6] h-3 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ${
                        dept.average_risk >= 70
                          ? "bg-[#800020]"
                          : dept.average_risk >= 50
                          ? "bg-amber-600"
                          : "bg-emerald-600"
                      }`}
                      style={{ width: `${Math.min(100, dept.average_risk)}%` }}
                    />
                  </div>
                  <div className="w-16 text-right font-mono text-xs text-stone-900 font-bold">
                    {dept.average_risk}<span className="text-stone-400 font-normal">/100</span>
                  </div>
                  <div className="w-24 text-right">
                    {dept.critical_count > 0 ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#800020]/10 text-[#800020] border border-[#800020]/20">
                        {dept.critical_count} Critical
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono text-emerald-800 font-medium">
                        Normal
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Asset Prioritization Queue Table */}
      <div className="bg-white rounded-2xl border border-[#e5ded0] shadow-xs overflow-hidden">
        <div className="p-5 border-b border-[#e5ded0] space-y-4 bg-[#faf7f2]">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-bold text-[#800020] uppercase tracking-wider font-mono">
                Asset Prioritization Queue
              </h2>
              <p className="text-xs text-stone-500 mt-0.5">
                Assets ranked dynamically by risk score. Focus remediation on top items first.
              </p>
            </div>

            {/* Filter Pills */}
            <div className="flex flex-wrap items-center gap-1.5 font-mono text-xs">
              <span className="text-stone-500 mr-1">FILTER:</span>
              {["ALL", "CRITICAL", "HIGH", "MEDIUM", "LOW"].map((level) => (
                <button
                  key={level}
                  onClick={() => setRiskFilter(level)}
                  className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer ${
                    riskFilter === level
                      ? "bg-[#800020] text-white shadow-2xs"
                      : "bg-[#ede5d8] text-stone-700 hover:text-stone-900"
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3">
            <div className="relative flex-1 w-full">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-stone-400 text-xs">
                🔍
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by asset name, sector, or hardware architecture..."
                className="w-full pl-9 pr-4 py-2 text-xs border border-[#d6ccbe] rounded-lg bg-white text-stone-800 placeholder-stone-400 focus:outline-none focus:border-[#800020] font-mono"
              />
            </div>

            <select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              className="px-3 py-2 text-xs border border-[#d6ccbe] rounded-lg bg-white text-stone-700 focus:outline-none focus:border-[#800020] font-mono"
            >
              <option value="ALL">All Sectors</option>
              {uniqueDepartments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Priority Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#f5f0e6] text-stone-600 font-mono uppercase tracking-wider border-b border-[#e5ded0]">
              <tr>
                <th className="py-3 px-4 w-14">Rank</th>
                <th className="py-3 px-4">Asset Name</th>
                <th className="py-3 px-4">Sector / Dept</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Exposure</th>
                <th className="py-3 px-4 text-center">Matched CVEs</th>
                <th className="py-3 px-4">Risk Score</th>
                <th className="py-3 px-4">Risk Tier</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0eae0] font-mono">
              {filteredRisks.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-stone-500 font-mono">
                    {loading ? "Loading priority queue..." : "No risk records match criteria."}
                  </td>
                </tr>
              ) : (
                filteredRisks.map((risk, index) => {
                  const badge = RISK_BADGE[risk.risk_level] || RISK_BADGE.Medium;
                  const cveCount = risk.factors?.matched_cve_count ?? 0;
                  return (
                    <tr
                      key={risk.id}
                      onClick={() => {
                        setSelectedRisk(risk);
                        setSimPatch(false);
                        setSimIsolate(false);
                      }}
                      className="hover:bg-[#faf6f0] cursor-pointer transition border-b border-[#f0eae0]"
                    >
                      <td className="py-3.5 px-4 text-stone-400 font-bold">
                        #{String(index + 1).padStart(2, "0")}
                      </td>
                      <td className="py-3.5 px-4 font-sans">
                        <div className="font-bold text-stone-900 hover:text-[#800020] transition">{risk.asset_name}</div>
                        <div className="text-[11px] text-stone-500 font-mono">ID: {risk.asset_id}</div>
                      </td>
                      <td className="py-3.5 px-4 text-stone-700 font-sans">
                        {risk.department || "Unassigned"}
                      </td>
                      <td className="py-3.5 px-4 text-stone-600">{risk.asset_type}</td>
                      <td className="py-3.5 px-4">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                          risk.factors?.exposure === 100
                            ? "bg-red-50 text-red-700 border border-red-200"
                            : "bg-[#ede5d8] text-stone-700"
                        }`}>
                          {risk.factors?.exposure === 100 ? "External" : "Internal"}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`font-bold px-2 py-0.5 rounded-full text-xs ${
                            cveCount > 0
                              ? "bg-[#800020]/10 text-[#800020] border border-[#800020]/20"
                              : "bg-[#f5f0e6] text-stone-400"
                          }`}
                        >
                          {cveCount}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-bold text-stone-900">
                        <div className="flex items-center gap-2">
                          <span>{risk.risk_score}</span>
                          <div className="w-16 bg-[#f4efe6] h-2 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${
                                risk.risk_score >= 80
                                  ? "bg-[#800020]"
                                  : risk.risk_score >= 60
                                  ? "bg-red-600"
                                  : risk.risk_score >= 30
                                  ? "bg-amber-600"
                                  : "bg-emerald-600"
                              }`}
                              style={{ width: `${risk.risk_score}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2.5 py-1 rounded-md text-xs font-bold border ${badge.bg} ${badge.text} ${badge.border}`}
                        >
                          {risk.risk_level}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedRisk(risk);
                            setSimPatch(false);
                            setSimIsolate(false);
                          }}
                          className="px-3 py-1 text-xs font-bold text-[#800020] hover:bg-[#800020] hover:text-white border border-[#800020]/30 rounded-lg transition"
                        >
                          Investigate →
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Slide-over Asset Detail & What-If Remediation Drawer */}
      {selectedRisk && (
        <div
          className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex justify-end transition-opacity"
          onClick={() => setSelectedRisk(null)}
        >
          <div
            className="w-full max-w-lg bg-white border-l-2 border-[#d6ccbe] h-full p-6 overflow-y-auto space-y-6 text-stone-900 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div className="flex items-center justify-between pb-4 border-b border-[#e5ded0]">
              <div>
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#800020]">
                  Risk Factor Breakdown &amp; Remediation
                </span>
                <h3 className="text-xl font-bold text-stone-900 mt-0.5">
                  {selectedRisk.asset_name}
                </h3>
                <p className="text-xs text-stone-500 font-mono">
                  {selectedRisk.asset_type} · {selectedRisk.department || "Enterprise"}
                </p>
              </div>
              <button
                onClick={() => setSelectedRisk(null)}
                className="w-8 h-8 rounded-full bg-[#f5f0e6] hover:bg-[#ede5d8] text-stone-700 flex items-center justify-center font-bold"
              >
                ✕
              </button>
            </div>

            {/* Score & Tier Banner */}
            <div className="p-4 rounded-xl bg-[#faf7f2] border border-[#e5ded0] flex items-center justify-between">
              <div>
                <span className="text-xs text-stone-500 font-mono uppercase">
                  {simMetrics?.active ? "Simulated Risk Score" : "Calculated Risk Score"}
                </span>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <div className="text-3xl font-bold text-[#800020] font-mono">
                    {simMetrics?.active ? simMetrics.score : selectedRisk.risk_score}
                    <span className="text-xs font-normal text-stone-400 ml-1">/100</span>
                  </div>
                  {simMetrics?.active && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs line-through text-stone-400 font-mono">
                        {selectedRisk.risk_score}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[11px] font-bold font-mono bg-emerald-100 text-emerald-800 border border-emerald-300">
                        ▼ -{simMetrics.delta} pts (-{simMetrics.pctReduction}%)
                      </span>
                    </div>
                  )}
                </div>
              </div>
              <div className="text-right">
                <span className="text-xs text-stone-500 font-mono uppercase">
                  {simMetrics?.active ? "Simulated Tier" : "Risk Tier"}
                </span>
                <div className="mt-0.5">
                  <span
                    className={`px-3 py-1 rounded-md text-xs font-bold font-mono border ${
                      simMetrics?.active
                        ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                        : (RISK_BADGE[selectedRisk.risk_level] || RISK_BADGE.Medium).bg +
                          " " +
                          (RISK_BADGE[selectedRisk.risk_level] || RISK_BADGE.Medium).text +
                          " " +
                          (RISK_BADGE[selectedRisk.risk_level] || RISK_BADGE.Medium).border
                    }`}
                  >
                    {simMetrics?.active ? `Simulated ${simMetrics.tier}` : selectedRisk.risk_level}
                  </span>
                </div>
              </div>
            </div>

            {/* Contributing Factor Breakdown */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-stone-700">
                  Factor Contribution Breakdown (0–100)
                </h4>
                {simMetrics?.active && (
                  <span className="text-[10px] font-mono text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    Live Simulation Active
                  </span>
                )}
              </div>
              <div className="space-y-3">
                {[
                  {
                    label: "Vulnerability Severity (Weight 40%)",
                    score: simMetrics?.active ? simMetrics.severity : selectedRisk.severity_score,
                    origScore: selectedRisk.severity_score,
                    bar: simMetrics?.active && simPatch ? "bg-emerald-600" : "bg-[#800020]",
                    simulated: simMetrics?.active && simPatch,
                  },
                  {
                    label: "Threat Exploitability (Weight 20%)",
                    score: simMetrics?.active ? simMetrics.exploitability : selectedRisk.exploitability_score,
                    origScore: selectedRisk.exploitability_score,
                    bar: simMetrics?.active && (simPatch || simIsolate) ? "bg-emerald-600" : "bg-red-600",
                    simulated: simMetrics?.active && (simPatch || simIsolate),
                  },
                  {
                    label: "Network Exposure (Weight 20%)",
                    score: simMetrics?.active ? simMetrics.exposure : selectedRisk.exposure_score,
                    origScore: selectedRisk.exposure_score,
                    bar: simMetrics?.active && simIsolate ? "bg-emerald-600" : "bg-amber-600",
                    simulated: simMetrics?.active && simIsolate,
                  },
                  {
                    label: "Operational Criticality (Weight 20%)",
                    score: selectedRisk.criticality_score,
                    origScore: selectedRisk.criticality_score,
                    bar: "bg-stone-500",
                    simulated: false,
                    note: "Inherent",
                  },
                ].map((factor) => {
                  const hasChanged = factor.simulated && factor.score !== factor.origScore;
                  return (
                    <div key={factor.label}>
                      <div className="flex justify-between items-center text-xs text-stone-700 mb-1">
                        <span>{factor.label}</span>
                        <div className="flex items-center gap-1.5 font-mono">
                          {hasChanged && (
                            <span className="line-through text-stone-400 text-[11px]">
                              {factor.origScore}
                            </span>
                          )}
                          <span
                            className={`font-bold ${
                              hasChanged ? "text-emerald-700" : "text-stone-900"
                            }`}
                          >
                            {factor.score}
                          </span>
                          {hasChanged && (
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1 py-0.2 rounded border border-emerald-200">
                              ▼ -{factor.origScore - factor.score}
                            </span>
                          )}
                          {factor.note && (
                            <span className="text-[10px] text-stone-400 ml-1">
                              ({factor.note})
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="w-full bg-[#f4efe6] h-2 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-500 ${factor.bar}`}
                          style={{ width: `${factor.score}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Plain English Explainability */}
            <div className="p-4 bg-[#faf7f2] border border-[#e5ded0] rounded-xl space-y-1">
              <span className="text-xs font-mono font-bold text-[#800020]">Explainable Analysis:</span>
              <p className="text-xs text-stone-700 leading-relaxed mt-1">
                {selectedRisk.explanation}
              </p>
            </div>

            {/* Remediation Guidance */}
            <div>
              <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-emerald-800 mb-2">
                Recommended Remediation Actions
              </h4>
              <ul className="space-y-2">
                {selectedRisk.recommendations?.map((rec, i) => (
                  <li key={i} className="text-xs text-stone-700 flex items-start gap-2 bg-[#faf7f2] p-2.5 rounded-lg border border-[#e5ded0]">
                    <span className="text-emerald-700 font-bold">✓</span>
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* What-If Remediation Simulator */}
            <div className="p-4 bg-[#f5f0e6] border border-[#d6ccbe] rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold uppercase tracking-wider text-stone-900">
                    What-If Remediation Simulation
                  </span>
                  <span className="text-[10px] bg-white border border-[#d6ccbe] text-stone-700 px-2 py-0.5 rounded font-mono font-bold">
                    Predictive Twin
                  </span>
                </div>
                {simMetrics?.active && (
                  <button
                    onClick={() => {
                      setSimPatch(false);
                      setSimIsolate(false);
                    }}
                    className="text-[11px] text-[#800020] hover:underline font-mono font-bold cursor-pointer"
                  >
                    ↺ Reset
                  </button>
                )}
              </div>
              <p className="text-xs text-stone-600">
                Simulate the quantitative impact of vendor CVE patching and microsegmentation before rolling out changes to production.
              </p>

              {/* Remediation Action Toggles */}
              <div className="space-y-2 pt-1">
                <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-white border border-[#e5ded0] cursor-pointer hover:border-[#800020]/40 transition">
                  <input
                    type="checkbox"
                    checked={simPatch}
                    onChange={(e) => setSimPatch(e.target.checked)}
                    className="mt-0.5 accent-[#800020] cursor-pointer"
                  />
                  <div className="text-xs">
                    <span className="font-bold text-stone-900 block">
                      ⚡ Apply Vendor Security Patch (Resolve Active CVEs)
                    </span>
                    <span className="text-[11px] text-stone-500">
                      Reduces Vulnerability Severity to 0 and Threat Exploitability to residual baseline (15).
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-white border border-[#e5ded0] cursor-pointer hover:border-[#800020]/40 transition">
                  <input
                    type="checkbox"
                    checked={simIsolate}
                    onChange={(e) => setSimIsolate(e.target.checked)}
                    className="mt-0.5 accent-[#800020] cursor-pointer"
                  />
                  <div className="text-xs">
                    <span className="font-bold text-stone-900 block">
                      🛡️ Network Microsegmentation (Zero-Trust Enclave)
                    </span>
                    <span className="text-[11px] text-stone-500">
                      Restricts ingress exposure score to 10 (Isolated segment) and dampens unpatched exploitability.
                    </span>
                  </div>
                </label>
              </div>

              {/* Fast Quick-Simulate Button */}
              <button
                onClick={() => {
                  if (simPatch && simIsolate) {
                    setSimPatch(false);
                    setSimIsolate(false);
                  } else {
                    setSimPatch(true);
                    setSimIsolate(true);
                  }
                }}
                className={`w-full py-2.5 text-xs font-mono font-bold rounded-lg transition cursor-pointer flex items-center justify-center gap-2 shadow-xs ${
                  simMetrics?.active
                    ? "bg-emerald-700 hover:bg-emerald-800 text-white"
                    : "bg-[#800020] hover:bg-[#66001a] text-white"
                }`}
              >
                {simMetrics?.active ? (
                  <>
                    <span>✓</span>
                    <span>
                      Simulation Active: Risk Reduced by {simMetrics.pctReduction}% (Score {selectedRisk.risk_score} ➔ {simMetrics.score})
                    </span>
                  </>
                ) : (
                  <>
                    <span>⚡</span>
                    <span>Simulate Full Remediation (Patch + Isolate)</span>
                  </>
                )}
              </button>

              {/* Simulation Result Callout */}
              {simMetrics?.active && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs space-y-1">
                  <div className="font-bold text-emerald-900 font-mono flex items-center gap-1.5">
                    <span>📊</span>
                    <span>Predictive Impact Assessment</span>
                  </div>
                  <p className="text-emerald-800 leading-relaxed text-[11px]">
                    {simPatch && simIsolate
                      ? `Applying vendor patches while isolating the asset to a zero-trust enclave neutralizes all remote exploit pathways, cutting total risk by ${simMetrics.pctReduction}%. Residual score (${simMetrics.score}) accounts purely for intrinsic clinical/operational priority.`
                      : simPatch
                      ? `Vulnerability patching eliminates active CVE exploitation. Total asset risk drops from ${selectedRisk.risk_score} to ${simMetrics.score} points.`
                      : "Microsegmentation confines asset exposure to the internal enclave, shielding it from external reconnaissance."}
                  </p>
                </div>
              )}
            </div>

            {/* Drawer Actions */}
            <div className="pt-4 border-t border-[#e5ded0] flex items-center justify-between gap-3">
              <Link
                to={`/assets/${selectedRisk.asset_id}`}
                className="text-xs text-[#800020] hover:underline font-mono font-bold"
              >
                Open Full Asset Record →
              </Link>
              <button
                onClick={() => handleReassessSingle(selectedRisk.asset_id)}
                disabled={actionBusy}
                className="px-3 py-1.5 text-xs font-mono text-stone-700 bg-[#f5f0e6] hover:bg-[#ede5d8] border border-[#d6ccbe] rounded-lg transition"
              >
                🔄 Re-assess Risk
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
