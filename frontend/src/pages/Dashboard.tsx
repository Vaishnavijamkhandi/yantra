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
} from "../services/api";
import type {
  Asset,
  RiskSummary,
  RiskAssessment,
  DepartmentRisk,
} from "../types/asset";

const RISK_BADGE: Record<string, { bg: string; text: string; border: string }> = {
  Critical: { bg: "bg-red-500/10", text: "text-red-500", border: "border-red-500/30" },
  High: { bg: "bg-orange-500/10", text: "text-orange-500", border: "border-orange-500/30" },
  Medium: { bg: "bg-yellow-500/10", text: "text-yellow-500", border: "border-yellow-500/30" },
  Low: { bg: "bg-emerald-500/10", text: "text-emerald-500", border: "border-emerald-500/30" },
};

export default function Dashboard() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [summary, setSummary] = useState<RiskSummary | null>(null);
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
  const [simulatedRemediation, setSimulatedRemediation] = useState<boolean>(false);

  async function loadData() {
    try {
      setLoading(true);
      const [assetsData, summaryData, risksData, deptData] = await Promise.all([
        getAssets().catch(() => []),
        getRiskSummary().catch(() => null),
        getLatestRisks().catch(() => []),
        getDepartmentRisks().catch(() => []),
      ]);
      setAssets(assetsData);
      setSummary(summaryData);
      setRisks(risksData);
      setDepartments(deptData);
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
      setToastMessage("Seeded curated hospital CVEs successfully!");
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

  // Filtered priority queue
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

  // Unique departments for filter
  const uniqueDepartments = useMemo(() => {
    const set = new Set<string>();
    risks.forEach((r) => {
      if (r.department) set.add(r.department);
    });
    return Array.from(set);
  }, [risks]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="flex items-center justify-between p-4 bg-blue-900/90 border border-blue-700 text-blue-100 rounded-xl shadow-lg">
          <div className="flex items-center gap-2">
            <span className="text-xl">🛡️</span>
            <span className="text-sm font-medium">{toastMessage}</span>
          </div>
          <button
            onClick={() => setToastMessage(null)}
            className="text-xs bg-blue-800 hover:bg-blue-700 px-3 py-1 rounded-md"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Top Header & Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-gray-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">
              Cyber-Risk Operations Center
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-800">
              Phase 3 &amp; 4 Active
            </span>
          </div>
          <p className="text-gray-500 text-sm mt-1">
            Deterministic risk scoring, vulnerability intelligence, and explainable prioritization for IT.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSeedData}
            disabled={actionBusy}
            className="px-4 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 shadow-sm transition"
          >
            📥 Seed Curated CVEs
          </button>
          <button
            onClick={handleAssessAll}
            disabled={actionBusy || assets.length === 0}
            className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition flex items-center gap-2"
          >
            <span>⚡</span>
            <span>{actionBusy ? "Calculating..." : "Assess Fleet Risk"}</span>
          </button>
        </div>
      </div>

      {/* CISA KEV Alert Banner */}
      {summary && summary.cisa_kev_alert_count > 0 && (
        <div className="p-4 bg-red-50 border-l-4 border-red-500 rounded-r-xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <p className="text-sm font-bold text-red-800">
                ACTIVE EXPLOITATION WARNING: {summary.cisa_kev_alert_count} asset(s) match CISA Known Exploited Vulnerabilities!
              </p>
              <p className="text-xs text-red-600">
                These vulnerabilities are actively targeted by ransomware campaigns. Remediation is critical within 24 hours.
              </p>
            </div>
          </div>
          <button
            onClick={() => setRiskFilter("CRITICAL")}
            className="text-xs font-semibold bg-red-600 text-white px-3 py-1.5 rounded-lg hover:bg-red-700"
          >
            Filter Critical Threats →
          </button>
        </div>
      )}

      {/* KPI Metric Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between text-gray-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Assets</span>
            <span className="text-lg">🖥️</span>
          </div>
          <div className="text-3xl font-extrabold text-gray-900">{summary?.total_assets ?? 0}</div>
          <p className="text-xs text-gray-500 mt-1">
            {summary?.assessed_assets ?? 0} assessed for risk
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between text-gray-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Vulnerable Assets</span>
            <span className="text-lg">🎯</span>
          </div>
          <div className="text-3xl font-extrabold text-indigo-600">
            {summary?.assets_with_confirmed_matches ?? 0}
          </div>
          <p className="text-xs text-gray-500 mt-1">With confirmed CVE matches</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between text-gray-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Critical Risk</span>
            <span className="text-lg">🚨</span>
          </div>
          <div className="text-3xl font-extrabold text-red-600">
            {summary?.critical_risk_count ?? 0}
          </div>
          <p className="text-xs text-gray-500 mt-1">Score ≥ 80.0 (Immediate SLA)</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between text-gray-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Fleet Avg Risk</span>
            <span className="text-lg">📊</span>
          </div>
          <div className="text-3xl font-extrabold text-blue-700">
            {summary?.average_risk_score ?? 0}
            <span className="text-sm font-medium text-gray-400">/100</span>
          </div>
          <p className="text-xs text-gray-500 mt-1">Across all hospital systems</p>
        </div>
      </div>

      {/* Visualizations Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart 1: Fleet Risk Tier Distribution */}
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm lg:col-span-1">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide">
              Risk Tier Distribution
            </h3>
            <span className="text-xs text-gray-400">Latest Assessment</span>
          </div>

          <div className="space-y-4">
            {[
              { label: "Critical (80–100)", count: summary?.critical_risk_count ?? 0, color: "bg-red-500", text: "text-red-600" },
              { label: "High (60–79)", count: summary?.high_risk_count ?? 0, color: "bg-orange-500", text: "text-orange-600" },
              { label: "Medium (30–59)", count: summary?.medium_risk_count ?? 0, color: "bg-yellow-500", text: "text-yellow-600" },
              { label: "Low (0–29)", count: summary?.low_risk_count ?? 0, color: "bg-emerald-500", text: "text-emerald-600" },
            ].map((tier) => {
              const totalAssessed = summary?.assessed_assets || 1;
              const pct = Math.round((tier.count / totalAssessed) * 100);
              return (
                <div key={tier.label}>
                  <div className="flex justify-between text-xs font-semibold mb-1">
                    <span className="text-gray-700">{tier.label}</span>
                    <span className={tier.text}>{tier.count} assets ({pct}%)</span>
                  </div>
                  <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${tier.color} transition-all duration-500`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-6 pt-4 border-t border-gray-100 text-xs text-gray-500 leading-relaxed">
            💡 Calculated using deterministic formula: 40% Severity + 20% Exploitability + 20% Exposure + 20% Criticality.
          </div>
        </div>

        {/* Chart 2: Department Risk Heatmap */}
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide">
              Department-Wise Accumulated Risk
            </h3>
            <span className="text-xs text-gray-400">Clinical &amp; Operational Posture</span>
          </div>

          {departments.length === 0 ? (
            <div className="py-12 text-center text-gray-400 text-xs">
              Run risk assessments to populate department analytics.
            </div>
          ) : (
            <div className="space-y-4">
              {departments.map((dept) => (
                <div key={dept.department} className="flex items-center gap-4">
                  <div className="w-36 text-xs font-bold text-gray-700 truncate">
                    {dept.department}
                  </div>
                  <div className="flex-1 bg-gray-100 h-4 rounded-full overflow-hidden relative">
                    <div
                      className={`h-full transition-all duration-500 ${
                        dept.average_risk >= 70
                          ? "bg-red-500"
                          : dept.average_risk >= 50
                          ? "bg-orange-400"
                          : "bg-emerald-500"
                      }`}
                      style={{ width: `${Math.min(100, dept.average_risk)}%` }}
                    />
                  </div>
                  <div className="w-20 text-right">
                    <span className="text-xs font-extrabold text-gray-900">
                      {dept.average_risk}
                    </span>
                    <span className="text-xs text-gray-400">/100</span>
                  </div>
                  <div className="w-24 text-right">
                    {dept.critical_count > 0 && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700">
                        {dept.critical_count} Critical
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Dynamic Asset Priority Queue Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-100 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                Asset Prioritization Queue
              </h2>
              <p className="text-xs text-gray-500">
                Assets ranked dynamically by risk score. Focus remediation on top items first.
              </p>
            </div>

            {/* Filter Pills */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-gray-400">Filter Risk:</span>
              {["ALL", "CRITICAL", "HIGH", "MEDIUM", "LOW"].map((level) => (
                <button
                  key={level}
                  onClick={() => setRiskFilter(level)}
                  className={`px-3 py-1 rounded-full text-xs font-bold transition ${
                    riskFilter === level
                      ? "bg-gray-900 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3">
            <div className="relative flex-1 w-full">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
                🔍
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by asset name, department, or hardware type..."
                className="w-full pl-9 pr-4 py-2 text-xs border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50/50"
              />
            </div>

            <select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              className="px-3 py-2 text-xs border border-gray-200 rounded-xl bg-gray-50/50 text-gray-700"
            >
              <option value="ALL">All Departments</option>
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
            <thead className="bg-gray-50/75 border-b border-gray-100 text-gray-500 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4 w-14">Rank</th>
                <th className="py-3 px-4">Asset Name</th>
                <th className="py-3 px-4">Department</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Exposure</th>
                <th className="py-3 px-4 text-center">Matched CVEs</th>
                <th className="py-3 px-4">Risk Score</th>
                <th className="py-3 px-4">Risk Tier</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredRisks.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-gray-400">
                    {loading ? "Loading priority queue..." : "No risk records match your search criteria."}
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
                        setSimulatedRemediation(false);
                      }}
                      className="hover:bg-blue-50/40 cursor-pointer transition"
                    >
                      <td className="py-3.5 px-4 font-mono font-bold text-gray-400">
                        #{String(index + 1).padStart(2, "0")}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-gray-900">{risk.asset_name}</div>
                        <div className="text-[11px] text-gray-400 font-mono">
                          ID: {risk.asset_id}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-gray-700">
                        {risk.department || "Unassigned"}
                      </td>
                      <td className="py-3.5 px-4 text-gray-500">{risk.asset_type}</td>
                      <td className="py-3.5 px-4">
                        <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-700">
                          {risk.factors?.exposure === 100 ? "Internet-Facing" : "Internal"}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`font-bold px-2 py-0.5 rounded-full text-xs ${
                            cveCount > 0
                              ? "bg-indigo-100 text-indigo-700"
                              : "bg-gray-100 text-gray-400"
                          }`}
                        >
                          {cveCount}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-extrabold text-sm text-gray-900">
                        <div className="flex items-center gap-2">
                          <span>{risk.risk_score}</span>
                          <div className="w-16 bg-gray-100 h-2 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${
                                risk.risk_score >= 80
                                  ? "bg-red-500"
                                  : risk.risk_score >= 60
                                  ? "bg-orange-500"
                                  : risk.risk_score >= 30
                                  ? "bg-yellow-500"
                                  : "bg-emerald-500"
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
                            setSimulatedRemediation(false);
                          }}
                          className="px-2.5 py-1 text-xs font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 rounded-lg transition"
                        >
                          Explain →
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
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex justify-end transition-opacity"
          onClick={() => setSelectedRisk(null)}
        >
          <div
            className="w-full max-w-lg bg-white h-full shadow-2xl p-6 overflow-y-auto space-y-6"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  Risk Factor Analysis &amp; Remediation
                </span>
                <h3 className="text-xl font-bold text-gray-900">
                  {selectedRisk.asset_name}
                </h3>
                <p className="text-xs text-gray-500">
                  {selectedRisk.asset_type} · {selectedRisk.department || "General"}
                </p>
              </div>
              <button
                onClick={() => setSelectedRisk(null)}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500"
              >
                ✕
              </button>
            </div>

            {/* Score & Tier Banner */}
            <div className="p-4 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-between">
              <div>
                <span className="text-xs text-gray-400">Current Risk Score</span>
                <div className="text-3xl font-extrabold text-gray-900">
                  {simulatedRemediation
                    ? Math.round(selectedRisk.risk_score * 0.45)
                    : selectedRisk.risk_score}
                  <span className="text-sm font-normal text-gray-400">/100</span>
                </div>
              </div>
              <div className="text-right">
                <span className="text-xs text-gray-400">Risk Tier</span>
                <div>
                  <span
                    className={`px-3 py-1 rounded-md text-xs font-bold ${
                      simulatedRemediation
                        ? "bg-emerald-100 text-emerald-800"
                        : (RISK_BADGE[selectedRisk.risk_level] || RISK_BADGE.Medium).text
                    }`}
                  >
                    {simulatedRemediation ? "Low (Remediated)" : selectedRisk.risk_level}
                  </span>
                </div>
              </div>
            </div>

            {/* Contributing Factor Breakdown */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700 mb-3">
                Factor Contribution Breakdown (0–100)
              </h4>
              <div className="space-y-3">
                {[
                  { label: "Vulnerability Severity (Weight 40%)", score: selectedRisk.severity_score, color: "bg-red-500" },
                  { label: "Threat Exploitability (Weight 20%)", score: selectedRisk.exploitability_score, color: "bg-orange-500" },
                  { label: "Network Exposure (Weight 20%)", score: selectedRisk.exposure_score, color: "bg-yellow-500" },
                  { label: "Clinical Criticality (Weight 20%)", score: selectedRisk.criticality_score, color: "bg-blue-500" },
                ].map((factor) => (
                  <div key={factor.label}>
                    <div className="flex justify-between text-xs font-medium text-gray-600 mb-1">
                      <span>{factor.label}</span>
                      <span className="font-bold text-gray-900">{factor.score}</span>
                    </div>
                    <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${factor.color}`}
                        style={{ width: `${factor.score}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Plain English Explainability */}
            <div className="p-4 bg-blue-50/70 border border-blue-200 rounded-xl space-y-1">
              <span className="text-xs font-bold text-blue-900">Explainable Reasoning:</span>
              <p className="text-xs text-blue-800 leading-relaxed">
                {selectedRisk.explanation}
              </p>
            </div>

            {/* Remediation Guidance */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700 mb-2">
                Recommended Remediation Actions
              </h4>
              <ul className="space-y-2">
                {selectedRisk.recommendations?.map((rec, i) => (
                  <li key={i} className="text-xs text-gray-700 flex items-start gap-2">
                    <span className="text-blue-600 font-bold">✓</span>
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* What-If Remediation Simulator */}
            <div className="p-4 bg-slate-900 text-white rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  What-If Remediation Simulation
                </span>
                <span className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded">
                  Predictive Impact
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Simulate the effect of applying the latest security patches to this asset.
              </p>
              <button
                onClick={() => setSimulatedRemediation(!simulatedRemediation)}
                className={`w-full py-2 text-xs font-bold rounded-lg transition ${
                  simulatedRemediation
                    ? "bg-emerald-500 hover:bg-emerald-600 text-white"
                    : "bg-blue-600 hover:bg-blue-700 text-white"
                }`}
              >
                {simulatedRemediation
                  ? "✓ Remediation Simulated (Score -55%) — Reset"
                  : "⚡ Simulate Vulnerability Patching"}
              </button>
            </div>

            {/* Drawer Actions */}
            <div className="pt-4 border-t border-gray-100 flex items-center justify-between gap-3">
              <Link
                to={`/assets/${selectedRisk.asset_id}`}
                className="text-xs text-blue-600 hover:underline font-semibold"
              >
                Open Full Asset Record →
              </Link>
              <button
                onClick={() => handleReassessSingle(selectedRisk.asset_id)}
                disabled={actionBusy}
                className="px-3 py-1.5 text-xs font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition"
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
