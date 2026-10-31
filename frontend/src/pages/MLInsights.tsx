import { useEffect, useState } from "react";
import { getMLStatus, getMLInsights, getMLModelCards, trainAnomaly, trainSupervised, loadEPSS } from "../services/api";
import type { MLStatus, MLInsight, MLModelCard } from "../types/asset";

const ALGO_COLOR: Record<string, string> = {
  IsolationForest: "text-purple-400 border-purple-500/30 bg-purple-500/10",
  LogisticRegression: "text-blue-400 border-blue-500/30 bg-blue-500/10",
  RandomForest: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
  GradientBoosting: "text-orange-400 border-orange-500/30 bg-orange-500/10",
};

export default function MLInsights() {
  const [status, setStatus] = useState<MLStatus | null>(null);
  const [insights, setInsights] = useState<{ assets: MLInsight[]; anomalies_detected: number; model_available: boolean } | null>(null);
  const [cards, setCards] = useState<MLModelCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [s, i, c] = await Promise.all([getMLStatus(), getMLInsights(), getMLModelCards()]);
      setStatus(s);
      setInsights(i);
      setCards(c);
    } catch {
      // backend may not have models yet — that's fine
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const handleAction = async (key: string, fn: () => Promise<unknown>) => {
    setActionBusy(key);
    try {
      const res = await fn() as { message?: string };
      showToast(res?.message ?? "Started successfully");
      setTimeout(fetchAll, 2000);
    } catch (e: unknown) {
      const err = e as { message?: string };
      showToast(`Error: ${err?.message ?? "Unknown error"}`);
    } finally {
      setActionBusy(null);
    }
  };

  const supervisedCards = cards.filter(c => c.mode === "supervised");
  const anomalyCard = cards.find(c => c.mode === "anomaly" && c.is_active);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-slate-800 border border-slate-600 text-slate-100 px-4 py-3 rounded-lg shadow-xl text-sm max-w-sm">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold text-white">ML Insights</h1>
          <span className="px-2 py-0.5 rounded text-xs font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30">
            EXPERIMENTAL
          </span>
        </div>
        <p className="text-slate-400 text-sm">
          Anomaly detection (Isolation Forest) + supervised risk prediction (LR · RF · GB).
          Labels are derived from <strong className="text-slate-300">EPSS percentile scores</strong>, not confirmed hospital incidents.
        </p>
      </div>

      {/* Warning Banner */}
      <div className="mb-6 p-4 rounded-lg border border-amber-500/30 bg-amber-500/5 text-amber-300 text-sm">
        ⚠️ <strong>Important:</strong> All outputs on this page are experimental prioritisation aids.
        They must not be used as the sole basis for security decisions.
        EPSS scores predict exploit probability in the wild — not specific hospital incident risk.
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatusCard
          label="EPSS Records"
          value={status?.epss_records_loaded?.toLocaleString() ?? "—"}
          active={!!status?.epss_records_loaded}
        />
        <StatusCard
          label="Anomaly Model"
          value={status?.anomaly_model_trained ? "Trained" : "Not trained"}
          active={!!status?.anomaly_model_trained}
          sub={status?.anomaly_trained_at ? new Date(status.anomaly_trained_at).toLocaleDateString() : undefined}
        />
        <StatusCard
          label="Supervised Models"
          value={status?.supervised_models_trained ? "Trained" : "Not trained"}
          active={!!status?.supervised_models_trained}
          sub={status?.supervised_algorithms?.join(" · ")}
        />
        <StatusCard
          label="Anomalies Detected"
          value={insights?.anomalies_detected?.toString() ?? "—"}
          active={!!insights?.model_available}
        />
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3 mb-8">
        <ActionButton
          label="Load EPSS Data"
          busy={actionBusy === "epss"}
          disabled={!!status?.epss_records_loaded}
          disabledReason={status?.epss_records_loaded ? "Already loaded" : undefined}
          onClick={() => handleAction("epss", loadEPSS)}
          color="blue"
        />
        <ActionButton
          label="Train Anomaly Model"
          busy={actionBusy === "anomaly"}
          disabled={!status?.epss_records_loaded}
          disabledReason={!status?.epss_records_loaded ? "Load EPSS first" : undefined}
          onClick={() => handleAction("anomaly", trainAnomaly)}
          color="purple"
        />
        <ActionButton
          label="Train Supervised Models"
          busy={actionBusy === "supervised"}
          disabled={!status?.epss_records_loaded}
          disabledReason={!status?.epss_records_loaded ? "Load EPSS first" : undefined}
          onClick={() => handleAction("supervised", trainSupervised)}
          color="emerald"
        />
        <ActionButton
          label="Refresh"
          busy={loading}
          onClick={fetchAll}
          color="slate"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Anomaly Leaderboard */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h2 className="text-base font-semibold text-white mb-1">Asset Anomaly Leaderboard</h2>
          <p className="text-xs text-slate-500 mb-4">
            Assets whose vulnerability profile is statistically unusual vs the fleet.
            Higher score = more anomalous.
          </p>

          {!insights?.model_available ? (
            <EmptyState message="Train the anomaly model to see results." />
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {insights.assets.slice(0, 20).map(asset => (
                <div
                  key={asset.asset_id}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg border ${
                    asset.is_anomaly
                      ? "border-red-500/30 bg-red-500/5"
                      : "border-slate-700 bg-slate-800/40"
                  }`}
                >
                  <div>
                    <p className="text-sm font-medium text-slate-200">{asset.asset_name}</p>
                    <p className="text-xs text-slate-500">{asset.asset_type} · {asset.department}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {asset.is_anomaly && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30">
                        ANOMALY
                      </span>
                    )}
                    <div className="text-right">
                      <p className={`text-sm font-bold ${asset.is_anomaly ? "text-red-400" : "text-slate-400"}`}>
                        {asset.anomaly_score !== null ? asset.anomaly_score.toFixed(1) : "—"}
                      </p>
                      <p className="text-xs text-slate-600">score</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Model Cards */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h2 className="text-base font-semibold text-white mb-1">Model Performance</h2>
          <p className="text-xs text-slate-500 mb-4">
            Evaluated on 25% held-out test set. EPSS ≥ 90th percentile = high-risk label.
          </p>

          {supervisedCards.length === 0 && !anomalyCard ? (
            <EmptyState message="No trained models yet. Train models using the buttons above." />
          ) : (
            <div className="space-y-3">
              {anomalyCard && (
                <ModelCardRow card={anomalyCard} />
              )}
              {supervisedCards.map(card => (
                <ModelCardRow key={card.id} card={card} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Feature Importances */}
      {supervisedCards.length > 0 && (
        <div className="mt-6 bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h2 className="text-base font-semibold text-white mb-1">Feature Importances</h2>
          <p className="text-xs text-slate-500 mb-4">
            Which features drive the model's predictions most. Higher = more influential.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {supervisedCards.map(card => {
              const importances = card.metrics?.feature_importances;
              if (!importances) return null;
              const entries = Object.entries(importances).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
              const maxVal = Math.max(...entries.map(([, v]) => Math.abs(v)));
              return (
                <div key={card.id}>
                  <p className={`text-xs font-semibold mb-2 ${ALGO_COLOR[card.algorithm]?.split(" ")[0] ?? "text-slate-400"}`}>
                    {card.algorithm}
                  </p>
                  <div className="space-y-2">
                    {entries.map(([feat, val]) => (
                      <div key={feat}>
                        <div className="flex justify-between text-xs text-slate-400 mb-0.5">
                          <span>{feat.replace(/_/g, " ")}</span>
                          <span>{Math.abs(val).toFixed(3)}</span>
                        </div>
                        <div className="h-1.5 bg-slate-800 rounded-full">
                          <div
                            className="h-full rounded-full bg-teal-500"
                            style={{ width: `${(Math.abs(val) / maxVal) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatusCard({ label, value, active, sub }: {
  label: string; value: string; active: boolean; sub?: string;
}) {
  return (
    <div className={`rounded-xl border p-4 ${active ? "border-teal-500/30 bg-teal-500/5" : "border-slate-700 bg-slate-900"}`}>
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className={`text-lg font-bold ${active ? "text-teal-400" : "text-slate-500"}`}>{value}</p>
      {sub && <p className="text-xs text-slate-600 mt-0.5 truncate">{sub}</p>}
    </div>
  );
}

function ActionButton({ label, busy, disabled, disabledReason, onClick, color }: {
  label: string; busy: boolean; disabled?: boolean; disabledReason?: string;
  onClick: () => void; color: string;
}) {
  const colorMap: Record<string, string> = {
    blue: "bg-blue-600 hover:bg-blue-700 disabled:bg-blue-900/40",
    purple: "bg-purple-600 hover:bg-purple-700 disabled:bg-purple-900/40",
    emerald: "bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-900/40",
    slate: "bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800",
  };
  return (
    <button
      onClick={onClick}
      disabled={busy || disabled}
      title={disabledReason}
      className={`px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${colorMap[color] ?? colorMap.slate}`}
    >
      {busy ? "Working…" : label}
    </button>
  );
}

function ModelCardRow({ card }: { card: MLModelCard }) {
  const colorClass = ALGO_COLOR[card.algorithm] ?? "text-slate-400 border-slate-700 bg-slate-800/40";
  return (
    <div className={`rounded-lg border p-3 ${colorClass}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold">{card.algorithm}</span>
        <span className="text-xs opacity-70">{card.mode}</span>
      </div>
      {card.roc_auc !== null && card.roc_auc !== undefined && (
        <div className="grid grid-cols-4 gap-2 text-xs">
          <Metric label="ROC-AUC" value={card.roc_auc?.toFixed(3)} />
          <Metric label="F1" value={card.f1_score?.toFixed(3)} />
          <Metric label="Precision" value={card.precision?.toFixed(3)} />
          <Metric label="Recall" value={card.recall?.toFixed(3)} />
        </div>
      )}
      {card.training_rows && (
        <p className="text-xs opacity-60 mt-2">
          {card.training_rows} train · {card.test_rows} test rows
        </p>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <p className="opacity-60">{label}</p>
      <p className="font-bold">{value ?? "—"}</p>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-10 text-slate-500 text-sm">{message}</div>
  );
}

