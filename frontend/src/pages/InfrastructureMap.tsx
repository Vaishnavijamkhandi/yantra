import { useEffect, useMemo, useState } from "react";
import { getAssets, getInfrastructureMap, getAssetImpact } from "../services/api";
import type { Asset, DependencyImpact, InfrastructureMap as InfrastructureGraph } from "../types/asset";

export default function InfrastructureMapPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [graph, setGraph] = useState<InfrastructureGraph | null>(null);
  const [impact, setImpact] = useState<DependencyImpact | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadData() {
    try {
      setLoading(true);
      const [assetList, infra] = await Promise.all([getAssets(), getInfrastructureMap()]);
      setAssets(assetList);
      setGraph(infra);
      if (assetList[0]) {
        setSelectedId(assetList[0].id);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    getAssetImpact(selectedId)
      .then(setImpact)
      .catch(() => setImpact(null));
  }, [selectedId]);

  const selectedAsset = useMemo(
    () => assets.find((asset) => asset.id === selectedId) ?? assets[0] ?? null,
    [assets, selectedId],
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Infrastructure Impact Map</h1>
          <p className="text-sm text-slate-600 mt-1">
            Simulated dependency view showing how a compromised asset could affect downstream systems.
          </p>
        </div>
        <div className="px-3 py-1.5 rounded-full bg-indigo-100 text-indigo-800 text-xs font-semibold">
          Blast radius simulation
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
          Loading infrastructure graph...
        </div>
      ) : (
        <div className="grid xl:grid-cols-[1.4fr_0.6fr] gap-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-800">Dependency graph</h2>
              <span className="text-xs text-slate-500">{graph?.asset_count ?? 0} assets</span>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {assets.map((asset) => {
                const isSelected = selectedAsset?.id === asset.id;
                return (
                  <button
                    key={asset.id}
                    onClick={() => setSelectedId(asset.id)}
                    className={`text-left rounded-xl border p-3 transition ${
                      isSelected
                        ? "border-indigo-500 bg-indigo-50 shadow-sm"
                        : "border-slate-200 bg-slate-50 hover:bg-slate-100"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-800">{asset.asset_name}</span>
                      <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                        {asset.criticality}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-1">{asset.asset_type}</p>
                    <p className="text-xs text-slate-500 mt-1">{asset.department || "Unassigned"}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-800">What-if simulation</h2>
            {selectedAsset ? (
              <div className="mt-4 space-y-4">
                <div className="rounded-xl bg-slate-100 p-3">
                  <div className="text-xs uppercase text-slate-500">Selected asset</div>
                  <div className="mt-1 font-semibold text-slate-800">{selectedAsset.asset_name}</div>
                  <div className="text-xs text-slate-600">{selectedAsset.asset_type}</div>
                </div>

                {impact ? (
                  <>
                    <div className="rounded-xl border border-red-200 bg-red-50 p-3">
                      <div className="text-xs uppercase text-red-700">Blast radius</div>
                      <div className="text-2xl font-bold text-red-700">{impact.blast_radius}</div>
                    </div>

                    <div className="space-y-2 text-sm">
                      <div>
                        <div className="font-semibold text-slate-700">Affected assets</div>
                        <ul className="mt-1 list-disc list-inside text-slate-600">
                          {(impact.affected_assets.length ? impact.affected_assets : ["None detected"]).map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>

                      <div>
                        <div className="font-semibold text-slate-700">Recommendations</div>
                        <ul className="mt-1 list-disc list-inside text-slate-600 space-y-1">
                          {impact.recommendations.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-slate-500">No dependency impact simulated yet.</div>
                )}
              </div>
            ) : (
              <div className="text-sm text-slate-500">No asset selected</div>
            )}
          </div>
        </div>
      )}

      {graph && graph.edges.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Dependency links</h2>
          <div className="space-y-2">
            {graph.edges.map((edge, idx) => {
              const fromAsset = assets.find((asset) => asset.id === edge.from);
              const toAsset = assets.find((asset) => asset.id === edge.to);
              if (!fromAsset || !toAsset) return null;
              return (
                <div key={`${edge.from}-${edge.to}-${idx}`} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                  <span className="font-medium text-slate-700">{fromAsset.asset_name}</span>
                  <span className="text-slate-400">→</span>
                  <span className="font-medium text-slate-700">{toAsset.asset_name}</span>
                  <span className="ml-3 rounded-full bg-indigo-100 text-indigo-700 px-2 py-0.5 text-[10px] uppercase">
                    {edge.strength.toFixed(2)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
