import { useEffect, useMemo, useState, type ReactNode } from "react";
import { getAssets, getDepartmentRisks, getLatestRisks, getMLStatus, getRiskSummary } from "../services/api";
import type { Asset, DepartmentRisk, MLStatus, RiskAssessment, RiskSummary } from "../types/asset";

const sectionOrder = ["overview", "risk", "ml", "assets"] as const;
type SectionKey = (typeof sectionOrder)[number];

export default function Dashboard() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [summary, setSummary] = useState<RiskSummary | null>(null);
  const [risks, setRisks] = useState<RiskAssessment[]>([]);
  const [departments, setDepartments] = useState<DepartmentRisk[]>([]);
  const [mlStatus, setMlStatus] = useState<MLStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>({
    overview: true,
    risk: true,
    ml: true,
    assets: true,
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const [assetsData, summaryData, risksData, deptData, mlData] = await Promise.all([
        getAssets().catch(() => []),
        getRiskSummary().catch(() => null),
        getLatestRisks().catch(() => []),
        getDepartmentRisks().catch(() => []),
        getMLStatus().catch(() => null),
      ]);

      setAssets(assetsData);
      setSummary(summaryData);
      setRisks(risksData);
      setDepartments(deptData);
      setMlStatus(mlData);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
    const id = window.setInterval(() => {
      void loadData();
    }, 30000);
    return () => window.clearInterval(id);
  }, []);

  const riskPriority = useMemo(() => risks.slice(0, 5), [risks]);
  const uniqueDepartments = useMemo(() => departments.map((d) => d.department), [departments]);

  const toggleSection = (key: SectionKey) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Operations view</p>
          <h1 className="text-3xl font-bold text-slate-900">Analysis overview</h1>
        </div>
        <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
          live refresh every 30s
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500">
          Loading analysis...
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <MetricCard label="Total assets" value={summary?.total_assets ?? assets.length} accent="indigo" />
            <MetricCard label="Avg risk score" value={summary ? `${summary.average_risk_score}/100` : "—"} accent="amber" />
            <MetricCard label="Critical + High" value={summary ? String(summary.critical_risk_count + summary.high_risk_count) : "0"} accent="rose" />
            <MetricCard label="ML status" value={mlStatus?.supervised_models_trained ? "Ready" : "Waiting"} accent="emerald" />
          </div>

          <div className="space-y-4">
            <AccordionSection title="Fleet overview" open={openSections.overview} onToggle={() => toggleSection("overview")}>
              <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Department view</h3>
                    <span className="text-xs text-slate-500">{departments.length} departments</span>
                  </div>
                  <div className="space-y-3">
                    {departments.length === 0 ? (
                      <p className="text-sm text-slate-500">No department summary available yet.</p>
                    ) : (
                      departments.map((dept) => (
                        <div key={dept.department} className="rounded-lg border border-slate-200 bg-white p-3">
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-medium text-slate-800">{dept.department}</span>
                            <span className="text-xs text-slate-500">{dept.asset_count} assets</span>
                          </div>
                          <div className="mt-2 flex items-center gap-3 text-xs text-slate-600">
                            <span>Avg risk {dept.average_risk.toFixed(1)}</span>
                            <span>•</span>
                            <span>{dept.critical_count} critical</span>
                            <span>•</span>
                            <span>{dept.high_count} high</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Summary</h3>
                  <div className="mt-4 space-y-3 text-sm text-slate-700">
                    <div className="flex justify-between"><span>Average risk</span><strong>{summary ? `${summary.average_risk_score.toFixed(1)}/100` : "—"}</strong></div>
                    <div className="flex justify-between"><span>Critical</span><strong>{summary?.critical_risk_count ?? 0}</strong></div>
                    <div className="flex justify-between"><span>High</span><strong>{summary?.high_risk_count ?? 0}</strong></div>
                    <div className="flex justify-between"><span>Medium</span><strong>{summary?.medium_risk_count ?? 0}</strong></div>
                    <div className="flex justify-between"><span>Low</span><strong>{summary?.low_risk_count ?? 0}</strong></div>
                  </div>
                </div>
              </div>
            </AccordionSection>

            <AccordionSection title="Risk scoring details" open={openSections.risk} onToggle={() => toggleSection("risk")}>
              <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                <div className="space-y-3">
                  {riskPriority.length === 0 ? (
                    <p className="text-sm text-slate-500">No risk scores generated yet.</p>
                  ) : (
                    riskPriority.map((item) => (
                      <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="font-semibold text-slate-800">{item.asset_name}</div>
                            <div className="text-xs text-slate-500">{item.department || "Unassigned"} · {item.asset_type}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-bold text-slate-900">{item.risk_score}</div>
                            <div className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${riskBadge(item.risk_level)}`}>
                              {item.risk_level}
                            </div>
                          </div>
                        </div>
                        <div className="mt-3 text-xs text-slate-600">{item.explanation}</div>
                      </div>
                    ))
                  )}
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Breakdown</h3>
                  <div className="mt-3 space-y-3 text-sm text-slate-700">
                    {uniqueDepartments.length === 0 ? (
                      <p className="text-slate-500">No department breakdown yet.</p>
                    ) : (
                      uniqueDepartments.map((department) => (
                        <div key={department} className="flex items-center justify-between rounded-lg bg-slate-50 px-2 py-2">
                          <span>{department}</span>
                          <span className="font-medium">{risks.filter((r) => r.department === department).length}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </AccordionSection>

            <AccordionSection title="ML analysis" open={openSections.ml} onToggle={() => toggleSection("ml")}>
              <div className="grid gap-4 md:grid-cols-3">
                <MiniStat label="EPSS records" value={String(mlStatus?.epss_records_loaded ?? 0)} />
                <MiniStat label="Anomaly model" value={mlStatus?.anomaly_model_trained ? "trained" : "waiting"} />
                <MiniStat label="Supervised model" value={mlStatus?.supervised_models_trained ? "trained" : "waiting"} />
              </div>
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                {mlStatus?.warning || "Experimental analysis is active and refreshes automatically."}
              </div>
            </AccordionSection>

            <AccordionSection title="Asset drill-down" open={openSections.assets} onToggle={() => toggleSection("assets")}>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {assets.length === 0 ? (
                  <p className="text-sm text-slate-500">No assets exist yet. Use the Upload tab to import them.</p>
                ) : (
                  assets.slice(0, 12).map((asset) => (
                    <div key={asset.id} className="rounded-xl border border-slate-200 bg-white p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-semibold text-slate-800">{asset.asset_name}</div>
                        <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] uppercase text-slate-700">
                          {asset.criticality}
                        </span>
                      </div>
                      <div className="mt-2 text-xs text-slate-600">
                        <div>{asset.asset_type}</div>
                        <div>{asset.department || "Unassigned"}</div>
                        <div>{asset.exposure}</div>
                      </div>
                      <div className="mt-3">
                        <a href={`/assets/${asset.id}`} className="text-xs font-medium text-indigo-600 hover:underline">
                          Open asset details →
                        </a>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </AccordionSection>
          </div>
        </>
      )}
    </div>
  );
}

function MetricCard({ label, value, accent }: { label: string; value: string | number; accent: "indigo" | "amber" | "rose" | "emerald" }) {
  const palette = {
    indigo: "bg-indigo-50 border-indigo-200 text-indigo-700",
    amber: "bg-amber-50 border-amber-200 text-amber-700",
    rose: "bg-rose-50 border-rose-200 text-rose-700",
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-700",
  };

  return (
    <div className={`rounded-2xl border p-4 ${palette[accent]}`}>
      <div className="text-xs uppercase tracking-wide opacity-80">{label}</div>
      <div className="mt-2 text-2xl font-bold">{value}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-2 text-lg font-semibold text-slate-800">{value}</div>
    </div>
  );
}

function AccordionSection({ title, open, onToggle, children }: { title: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <button onClick={onToggle} type="button" className="flex w-full items-center justify-between bg-slate-50 px-4 py-3 text-left">
        <span className="font-semibold text-slate-800">{title}</span>
        <span className="text-lg text-slate-500">{open ? "−" : "+"}</span>
      </button>
      {open && <div className="p-4">{children}</div>}
    </div>
  );
}

function riskBadge(level: string) {
  switch ((level || "").toUpperCase()) {
    case "CRITICAL":
      return "border-red-200 bg-red-100 text-red-700";
    case "HIGH":
      return "border-orange-200 bg-orange-100 text-orange-700";
    case "MEDIUM":
      return "border-yellow-200 bg-yellow-100 text-yellow-700";
    default:
      return "border-emerald-200 bg-emerald-100 text-emerald-700";
  }
}
