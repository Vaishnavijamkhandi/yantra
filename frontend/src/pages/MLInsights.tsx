import { useEffect, useState } from "react";
import { getMLStatus, getMLInsights, getMLModelCards, trainAnomaly, trainSupervised, loadEPSS } from "../services/api";
import type { MLStatus, MLInsight, MLModelCard } from "../types/asset";

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
      // models may not be trained yet
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
    <div className="p-6 max-w-7xl mx-auto space-y-6 text-stone-900">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-white border-2 border-[#800020] text-stone-900 px-4 py-3 rounded-xl shadow-lg text-xs font-mono max-w-sm">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[#e5ded0]">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black text-[#800020] tracking-tight">
              AI Risk Prediction &amp; Anomaly Models
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold uppercase bg-[#800020]/10 text-[#800020] border border-[#800020]/20">
              CyberSaathi ML
            </span>
          </div>
          <p className="text-stone-600 text-xs mt-1">
            Unsupervised Isolation Forest anomaly detection + supervised risk prediction calibrated against FIRST.org EPSS percentiles.
          </p>
        </div>
      </div>

      {/* Advisory Banner */}
      <div className="p-4 rounded-xl border border-[#e5ded0] bg-white text-xs font-mono flex items-center gap-3 shadow-xs">
        <span className="text-[#800020] text-base">⚠️</span>
        <div className="text-stone-700">
          <strong className="text-[#800020]">Advisory:</strong> Machine learning models serve as predictive prioritization aids.
          Calculations evaluate weaponization likelihood across critical infrastructure assets and CISA KEV feeds.
        </div>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
          label="Anomalies Flagged"
          value={insights?.anomalies_detected?.toString() ?? "—"}
          active={!!insights?.model_available}
        />
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3 font-mono text-xs">
        <button
          onClick={() => handleAction("epss", loadEPSS)}
          disabled={actionBusy === "epss" || !!status?.epss_records_loaded}
          className="bg-white hover:bg-[#faf7f2] text-stone-800 border border-[#d6ccbe] px-4 py-2 rounded-xl transition disabled:opacity-40 cursor-pointer shadow-2xs font-semibold"
        >
          {actionBusy === "epss" ? "Loading..." : "📥 Ingest Live EPSS Data"}
        </button>
        <button
          onClick={() => handleAction("anomaly", trainAnomaly)}
          disabled={actionBusy === "anomaly" || !status?.epss_records_loaded}
          className="bg-[#800020] hover:bg-[#66001a] text-white font-bold px-4 py-2 rounded-xl transition disabled:opacity-40 cursor-pointer uppercase shadow-xs"
        >
          {actionBusy === "anomaly" ? "Training..." : "⚡ Train Anomaly Model"}
        </button>
        <button
          onClick={() => handleAction("supervised", trainSupervised)}
          disabled={actionBusy === "supervised" || !status?.epss_records_loaded}
          className="bg-white hover:bg-[#faf7f2] text-[#800020] border border-[#800020]/30 font-bold px-4 py-2 rounded-xl transition disabled:opacity-40 cursor-pointer shadow-2xs"
        >
          {actionBusy === "supervised" ? "Training..." : "Train Supervised Models"}
        </button>
        <button
          onClick={fetchAll}
          disabled={loading}
          className="bg-[#ede5d8] hover:bg-[#e2d6c3] text-stone-800 border border-[#d6ccbe] px-4 py-2 rounded-xl transition cursor-pointer"
        >
          {loading ? "Refreshing..." : "🔄 Refresh"}
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Anomaly Leaderboard */}
        <div className="bg-white border border-[#e5ded0] rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-xs font-bold text-stone-900 uppercase tracking-wider font-mono">
              Anomaly Leaderboard
            </h2>
            <span className="text-[11px] font-mono text-stone-400">Isolation Forest</span>
          </div>
          <p className="text-xs text-stone-500 mb-4">
            Assets whose configuration deviates significantly from the fleet baseline.
          </p>

          {!insights?.model_available ? (
            <div className="text-center py-10 text-stone-400 font-mono text-xs">
              Train the anomaly model to view deviation scores.
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1 font-mono">
              {insights.assets.slice(0, 20).map(asset => (
                <div
                  key={asset.asset_id}
                  className={`flex items-center justify-between px-3.5 py-2.5 rounded-lg border transition ${
                    asset.is_anomaly
                      ? "border-[#800020]/30 bg-[#800020]/5"
                      : "border-[#e5ded0] bg-[#faf7f2]"
                  }`}
                >
                  <div>
                    <p className="text-xs font-bold text-stone-900">{asset.asset_name}</p>
                    <p className="text-[11px] text-stone-500">{asset.asset_type} · {asset.department}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {asset.is_anomaly && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#800020]/10 text-[#800020] border border-[#800020]/20">
                        ANOMALOUS
                      </span>
                    )}
                    <div className="text-right">
                      <p className={`text-xs font-bold ${asset.is_anomaly ? "text-[#800020]" : "text-stone-600"}`}>
                        {asset.anomaly_score !== null ? asset.anomaly_score.toFixed(1) : "—"}
                      </p>
                      <p className="text-[10px] text-stone-400">score</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Model Cards */}
        <div className="bg-white border border-[#e5ded0] rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-xs font-bold text-stone-900 uppercase tracking-wider font-mono">
              Model Performance Benchmark
            </h2>
            <span className="text-[11px] font-mono text-stone-400">25% Held-out Test</span>
          </div>
          <p className="text-xs text-stone-500 mb-4">
            Supervised evaluation against EPSS ≥ 90th percentile high-risk ground truth.
          </p>

          {supervisedCards.length === 0 && !anomalyCard ? (
            <div className="text-center py-10 text-stone-400 font-mono text-xs">
              No trained models yet. Click &apos;Train Supervised Models&apos; to benchmark algorithms.
            </div>
          ) : (
            <div className="space-y-3 font-mono">
              {anomalyCard && <ModelCardRow card={anomalyCard} />}
              {supervisedCards.map(card => (
                <ModelCardRow key={card.id} card={card} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Feature Importances */}
      {supervisedCards.length > 0 && (
        <div className="bg-white border border-[#e5ded0] rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-xs font-bold text-stone-900 uppercase tracking-wider font-mono">
              Feature Importances
            </h2>
            <span className="text-[11px] font-mono text-stone-400">Gini / Weight</span>
          </div>
          <p className="text-xs text-stone-500 mb-4">
            Factors driving critical infrastructure risk classifications.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 font-mono">
            {supervisedCards.map(card => {
              const importances = card.metrics?.feature_importances;
              if (!importances) return null;
              const entries = Object.entries(importances).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
              const maxVal = Math.max(...entries.map(([, v]) => Math.abs(v)));
              return (
                <div key={card.id} className="bg-[#faf7f2] p-4 rounded-xl border border-[#e5ded0]">
                  <p className="text-xs font-bold mb-3 text-[#800020]">
                    {card.algorithm}
                  </p>
                  <div className="space-y-2">
                    {entries.map(([feat, val]) => (
                      <div key={feat}>
                        <div className="flex justify-between text-[11px] text-stone-600 mb-1">
                          <span>{feat.replace(/_/g, " ")}</span>
                          <span className="text-stone-900 font-bold">{Math.abs(val).toFixed(3)}</span>
                        </div>
                        <div className="h-1.5 bg-[#ede5d8] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#800020]"
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

function StatusCard({ label, value, active, sub }: {
  label: string; value: string; active: boolean; sub?: string;
}) {
  return (
    <div className={`rounded-xl border p-4 ${active ? "border-[#800020]/30 bg-white" : "border-[#e5ded0] bg-white"} shadow-xs`}>
      <p className="text-[11px] font-mono uppercase text-stone-500 mb-1">{label}</p>
      <p className={`text-2xl font-black font-mono ${active ? "text-[#800020]" : "text-stone-400"}`}>{value}</p>
      {sub && <p className="text-[11px] text-stone-400 font-mono mt-1 truncate">{sub}</p>}
    </div>
  );
}

function ModelCardRow({ card }: { card: MLModelCard }) {
  return (
    <div className="rounded-xl border border-[#e5ded0] bg-[#faf7f2] p-3.5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-[#800020]">{card.algorithm}</span>
        <span className="text-[10px] uppercase text-stone-500">{card.mode}</span>
      </div>
      {card.roc_auc !== null && card.roc_auc !== undefined && (
        <div className="grid grid-cols-4 gap-2 text-xs">
          <div><p className="text-[10px] text-stone-400">ROC-AUC</p><p className="font-bold text-stone-900">{card.roc_auc?.toFixed(3)}</p></div>
          <div><p className="text-[10px] text-stone-400">F1</p><p className="font-bold text-stone-900">{card.f1_score?.toFixed(3)}</p></div>
          <div><p className="text-[10px] text-stone-400">Precision</p><p className="font-bold text-stone-900">{card.precision?.toFixed(3)}</p></div>
          <div><p className="text-[10px] text-stone-400">Recall</p><p className="font-bold text-stone-900">{card.recall?.toFixed(3)}</p></div>
        </div>
      )}
      {card.training_rows && (
        <p className="text-[10px] text-stone-400 mt-2">
          {card.training_rows} training rows · {card.test_rows} validation rows
        </p>
      )}
    </div>
  );
}
