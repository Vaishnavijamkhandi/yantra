import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getAssets, getAssessmentSummary } from "../services/api";
import type { Asset, AssessmentDashboardSummary } from "../types/asset";

const CRITICALITY_COLORS: Record<string, string> = {
  Critical: "bg-red-100 text-red-700",
  High: "bg-orange-100 text-orange-700",
  Medium: "bg-yellow-100 text-yellow-700",
  Low: "bg-green-100 text-green-700",
};

export default function Dashboard() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [assessmentSummary, setAssessmentSummary] = useState<AssessmentDashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getAssets(),
      getAssessmentSummary().catch(() => null),
    ])
      .then(([assetData, assessData]) => {
        setAssets(assetData);
        setAssessmentSummary(assessData);
      })
      .finally(() => setLoading(false));
  }, []);

  const total = assets.length;
  const byType = assets.reduce<Record<string, number>>((acc, a) => {
    acc[a.asset_type] = (acc[a.asset_type] ?? 0) + 1;
    return acc;
  }, {});
  const byCrit = assets.reduce<Record<string, number>>((acc, a) => {
    acc[a.criticality] = (acc[a.criticality] ?? 0) + 1;
    return acc;
  }, {});

  const statCard = (label: string, value: number | string, subtitle: string, color: string) => (
    <div className={`rounded-xl p-5 shadow-sm border border-gray-100 ${color}`}>
      <p className="text-3xl font-bold">{value}</p>
      <p className="text-sm font-semibold mt-1">{label}</p>
      <p className="text-xs opacity-75">{subtitle}</p>
    </div>
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 mb-1">Hospital Security Operations Dashboard</h1>
        <p className="text-gray-500 text-sm">Phase 1 (Asset Inventory) &amp; Phase 2 (Vulnerability Assessment)</p>
      </div>

      {loading ? (
        <p className="text-gray-500">Loading metrics...</p>
      ) : (
        <>
          {/* Phase 1 Stat Cards */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                Phase 1: Asset Inventory Overview
              </h2>
              <Link to="/assets" className="text-xs text-blue-600 hover:underline">
                View All Assets →
              </Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {statCard("Total Assets", total, "Registered infrastructure", "bg-blue-50 text-blue-800")}
              {statCard("Critical Assets", byCrit["Critical"] ?? 0, "High operational impact", "bg-red-50 text-red-800")}
              {statCard("High Priority", byCrit["High"] ?? 0, "Mission sensitive", "bg-orange-50 text-orange-800")}
              {statCard("Asset Types", Object.keys(byType).length, "Hardware & software types", "bg-purple-50 text-purple-800")}
            </div>
          </div>

          {/* Phase 2 Stat Cards */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                Phase 2: Vulnerability Assessment Findings
              </h2>
              <Link to="/assessment" className="text-xs text-indigo-600 hover:underline">
                View Assessment Results →
              </Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {statCard(
                "Known CVEs",
                assessmentSummary?.total_vulnerabilities_in_db ?? 0,
                "In vulnerability database",
                "bg-slate-50 text-slate-800"
              )}
              {statCard(
                "Detected Matches",
                assessmentSummary?.total_asset_vulnerability_links ?? 0,
                "Total active matches",
                "bg-indigo-50 text-indigo-800"
              )}
              {statCard(
                "Affected Assets",
                assessmentSummary?.assets_affected ?? 0,
                "Assets requiring remediation",
                "bg-amber-50 text-amber-800"
              )}
              {statCard(
                "Critical CVEs",
                assessmentSummary?.by_severity["CRITICAL"] ?? 0,
                "Immediate patching required",
                "bg-rose-50 text-rose-800"
              )}
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-6">
            {/* By Type */}
            <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
              <h2 className="font-semibold text-gray-700 mb-3">Assets by Type</h2>
              <div className="space-y-2">
                {Object.entries(byType).sort(([, a], [, b]) => b - a).map(([type, count]) => (
                  <div key={type} className="flex items-center gap-2">
                    <span className="text-sm text-gray-600 w-36 truncate">{type}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-2">
                      <div
                        className="bg-blue-500 h-2 rounded-full"
                        style={{ width: `${(count / (total || 1)) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-500 w-6 text-right">{count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* By Criticality */}
            <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
              <h2 className="font-semibold text-gray-700 mb-3">Assets by Operational Criticality</h2>
              <div className="space-y-2">
                {["Critical", "High", "Medium", "Low"].map(level => (
                  <div key={level} className="flex items-center justify-between">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CRITICALITY_COLORS[level] ?? "bg-gray-100 text-gray-600"}`}>
                      {level}
                    </span>
                    <span className="text-sm font-semibold text-gray-700">{byCrit[level] ?? 0}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
