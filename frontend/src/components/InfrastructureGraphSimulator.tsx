import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  getInfrastructureMap,
  getSimulationScenarios,
  runIncidentSimulation,
  resetSimulationRun,
} from "../services/api";
import type {
  InfrastructureMap,
  InfrastructureMapNode,
  InfrastructureMapEdge,
  SimulationScenario,
  SimulationResult,
  AffectedAssetDetail,
  SimulationTimelineEvent,
} from "../types/asset";

const ASSET_ICONS: Record<string, string> = {
  Router: "🌐",
  Firewall: "🔒",
  Server: "🖥️",
  Database: "🗄️",
  Application: "⚙️",
  Computer: "💻",
  Workstation: "💻",
  Switch: "🔀",
  Gateway: "🛡️",
};

export default function InfrastructureGraphSimulator() {
  // Graph Data
  const [graphData, setGraphData] = useState<InfrastructureMap | null>(null);
  const [loadingGraph, setLoadingGraph] = useState(true);
  const [graphError, setGraphError] = useState("");
  const [lastRefreshed, setLastRefreshed] = useState<string>("");

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);

  // Simulation Configuration Modal State
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [scenarios, setScenarios] = useState<SimulationScenario[]>([]);
  const [selectedInitialAssetId, setSelectedInitialAssetId] = useState<number | null>(null);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>("asset_compromise");
  const [selectedSeverity, setSelectedSeverity] = useState<string>("HIGH");
  const [isStartingSim, setIsStartingSim] = useState(false);

  // Active Simulation State
  const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(null);
  const [simPlaybackStatus, setSimPlaybackStatus] = useState<"idle" | "running" | "paused" | "completed">("idle");
  const [currentHopStep, setCurrentHopStep] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<"overview" | "assets" | "timeline" | "mitigations">("overview");

  // Pan & Zoom State
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Load Graph and Scenarios on mount
  const loadGraph = useCallback(async () => {
    try {
      setLoadingGraph(true);
      setGraphError("");
      const [map, scRes] = await Promise.all([
        getInfrastructureMap(),
        getSimulationScenarios().catch(() => ({ scenarios: [] })),
      ]);
      setGraphData(map);
      setScenarios(scRes.scenarios || []);
      setLastRefreshed(new Date().toLocaleTimeString());
      if (map.nodes.length > 0 && !selectedInitialAssetId) {
        setSelectedInitialAssetId(map.nodes[0].id);
      }
    } catch (err: unknown) {
      setGraphError(err instanceof Error ? err.message : "Failed to load infrastructure map");
    } finally {
      setLoadingGraph(false);
    }
  }, [selectedInitialAssetId]);

  useEffect(() => {
    loadGraph();
  }, [loadGraph]);

  // Compute Layout Positions (Deterministic Tiered Coordinates)
  const nodePositions = useMemo(() => {
    if (!graphData || graphData.nodes.length === 0) return new Map<number, { x: number; y: number }>();

    const positions = new Map<number, { x: number; y: number }>();
    const nodes = graphData.nodes;

    // Group nodes into 4 topological tiers:
    // Tier 0: Perimeter / Firewalls / Routers / Gateways
    // Tier 1: Core Applications / APIs / Controllers / Servers
    // Tier 2: Databases / Data Stores
    // Tier 3: Workstations / Terminals / Endpoints / Sandbox
    const tier0: InfrastructureMapNode[] = [];
    const tier1: InfrastructureMapNode[] = [];
    const tier2: InfrastructureMapNode[] = [];
    const tier3: InfrastructureMapNode[] = [];

    nodes.forEach((n) => {
      const type = (n.type || "").toLowerCase();
      const label = (n.label || "").toLowerCase();
      if (type.includes("firewall") || type.includes("router") || type.includes("gateway") || label.includes("perimeter")) {
        tier0.push(n);
      } else if (type.includes("database") || label.includes("db") || label.includes("warehouse")) {
        tier2.push(n);
      } else if (type.includes("computer") || type.includes("workstation") || label.includes("terminal") || label.includes("sandbox")) {
        tier3.push(n);
      } else {
        tier1.push(n);
      }
    });

    const tiers = [tier0, tier1, tier2, tier3];
    const canvasWidth = 1100;
    const canvasHeight = 650;
    const xSpacing = canvasWidth / 5;

    tiers.forEach((tierNodes, tierIdx) => {
      const x = (tierIdx + 1) * xSpacing - 40;
      const count = tierNodes.length;
      tierNodes.forEach((node, nodeIdx) => {
        // Distribute vertically with slight horizontal jitter for readability
        const ySpacing = canvasHeight / (count + 1);
        const y = (nodeIdx + 1) * ySpacing;
        const xOffset = (nodeIdx % 2 === 0 ? 1 : -1) * 20;
        positions.set(node.id, { x: x + xOffset, y });
      });
    });

    return positions;
  }, [graphData]);

  // Filtered nodes based on search
  const filteredNodeIds = useMemo(() => {
    if (!searchQuery.trim() || !graphData) return null;
    const q = searchQuery.toLowerCase();
    const set = new Set<number>();
    graphData.nodes.forEach((n) => {
      if (
        n.label.toLowerCase().includes(q) ||
        String(n.id).includes(q) ||
        (n.department && n.department.toLowerCase().includes(q)) ||
        (n.type && n.type.toLowerCase().includes(q))
      ) {
        set.add(n.id);
      }
    });
    return set;
  }, [searchQuery, graphData]);

  // Simulated node states map based on currentHopStep
  const nodeSimulationState = useMemo(() => {
    if (!simulationResult) return new Map<number, { state: string; impact: string; distance: number }>();

    const map = new Map<number, { state: string; impact: string; distance: number }>();
    simulationResult.affected_assets.forEach((aff) => {
      // Only show up to currentHopStep
      if (aff.distance <= currentHopStep) {
        let state = "directly_impacted";
        if (aff.distance === 0) state = "initial_compromise";
        else if (aff.distance > 1) state = "indirectly_impacted";

        if (simulationResult.scenario_type === "network_isolation" && aff.distance > 0) {
          state = "isolated";
        }

        map.set(aff.asset_id, {
          state,
          impact: aff.impact_level,
          distance: aff.distance,
        });
      }
    });

    return map;
  }, [simulationResult, currentHopStep]);

  // Active highlighted edges up to currentHopStep
  const activeEdgeKeys = useMemo(() => {
    if (!simulationResult) return new Set<string>();
    const set = new Set<string>();
    simulationResult.active_paths.forEach((p) => {
      if (p.hop <= currentHopStep) {
        set.add(`${p.from}->${p.to}`);
      }
    });
    return set;
  }, [simulationResult, currentHopStep]);

  // Max hop depth in current simulation
  const maxSimulationHops = useMemo(() => {
    if (!simulationResult) return 0;
    return simulationResult.summary.max_propagation_depth;
  }, [simulationResult]);

  // Playback Timer: Advances hop step automatically when running
  useEffect(() => {
    if (simPlaybackStatus !== "running" || !simulationResult) return;

    if (currentHopStep >= maxSimulationHops) {
      setSimPlaybackStatus("completed");
      return;
    }

    const timer = setTimeout(() => {
      setCurrentHopStep((prev) => {
        const next = prev + 1;
        if (next >= maxSimulationHops) {
          setSimPlaybackStatus("completed");
        }
        return next;
      });
    }, 1100);

    return () => clearTimeout(timer);
  }, [simPlaybackStatus, currentHopStep, maxSimulationHops, simulationResult]);

  // Start Simulation Action
  async function handleStartSimulation() {
    if (!selectedInitialAssetId) return;
    try {
      setIsStartingSim(true);
      const res = await runIncidentSimulation({
        initial_asset_id: selectedInitialAssetId,
        scenario_type: selectedScenarioId,
        severity: selectedSeverity,
      });

      setSimulationResult(res);
      setCurrentHopStep(0);
      setSimPlaybackStatus("running");
      setIsConfigOpen(false);
      setSelectedNodeId(res.initial_asset.id);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to run simulation");
    } finally {
      setIsStartingSim(false);
    }
  }

  // Playback Control Handlers
  function handlePlayResume() {
    if (currentHopStep >= maxSimulationHops) {
      setCurrentHopStep(0);
    }
    setSimPlaybackStatus("running");
  }

  function handlePause() {
    setSimPlaybackStatus("paused");
  }

  function handleStop() {
    setSimPlaybackStatus("paused");
  }

  function handleReset() {
    if (simulationResult) {
      resetSimulationRun(simulationResult.simulation_id).catch(() => {});
    }
    setSimulationResult(null);
    setSimPlaybackStatus("idle");
    setCurrentHopStep(0);
  }

  function handleNextStep() {
    if (currentHopStep < maxSimulationHops) {
      setCurrentHopStep((prev) => prev + 1);
    }
  }

  // Mouse Pan & Zoom Handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.target === svgRef.current || (e.target as HTMLElement).tagName === "svg" || (e.target as HTMLElement).id === "graph-background") {
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleZoomIn = () => setZoom((z) => Math.min(2.5, z + 0.2));
  const handleZoomOut = () => setZoom((z) => Math.max(0.4, z - 0.2));
  const handleResetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Find selected node details
  const selectedNode = useMemo(() => {
    if (!selectedNodeId || !graphData) return null;
    return graphData.nodes.find((n) => n.id === selectedNodeId) || null;
  }, [selectedNodeId, graphData]);

  // Find simulation detail for selected node
  const selectedSimDetail = useMemo(() => {
    if (!selectedNodeId || !simulationResult) return null;
    return simulationResult.affected_assets.find((a) => a.asset_id === selectedNodeId) || null;
  }, [selectedNodeId, simulationResult]);

  return (
    <div className="space-y-4 font-sans text-stone-900">
      {/* ── TOP HEADER / TOOLBAR ────────────────────────────────────────── */}
      <div className="bg-white border border-[#e5ded0] rounded-2xl p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-black text-[#800020] tracking-tight font-mono flex items-center gap-2">
              <span>🌐</span> Live Infrastructure Impact Simulator
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-[#800020]/10 text-[#800020] border border-[#800020]/20">
              {graphData?.asset_count ?? 0} Assets · {graphData?.edges.length ?? 0} Dependencies
            </span>
            {lastRefreshed && (
              <span className="text-[11px] text-stone-500 font-mono hidden sm:inline">
                Synced: {lastRefreshed}
              </span>
            )}
          </div>
          <p className="text-stone-600 text-xs mt-1">
            Dynamic graph traversal modeling cyber-incident blast radius, multi-hop dependency collapse, and lateral spread across critical infrastructure.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={loadGraph}
            disabled={loadingGraph}
            className="px-3 py-2 text-xs font-mono font-bold bg-[#faf7f2] hover:bg-stone-200 text-stone-700 border border-[#d6ccbe] rounded-xl transition cursor-pointer flex items-center gap-1.5"
            title="Refresh graph from database"
          >
            <span>🔄</span> Refresh
          </button>

          {/* Primary Simulate Incident Button */}
          <button
            onClick={() => setIsConfigOpen(true)}
            className="px-4 py-2 bg-[#800020] hover:bg-[#66001a] text-white rounded-xl text-xs font-mono font-black transition cursor-pointer flex items-center gap-2 shadow-xs hover:shadow-md"
          >
            <span className="text-sm">🚨</span>
            <span>Simulate Incident</span>
          </button>
        </div>
      </div>

      {/* ── PLAYBACK & SEARCH CONTROLS BAR ──────────────────────────────── */}
      <div className="bg-[#faf7f2] border border-[#d6ccbe] rounded-xl p-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3 shadow-xs">
        {/* Search */}
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <span className="text-xs font-mono text-stone-500">🔍</span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search asset by name, ID, type, or department..."
            className="w-full bg-white border border-[#d6ccbe] focus:border-[#800020] rounded-lg px-3 py-1.5 text-xs text-stone-900 placeholder:text-stone-400 outline-none font-mono"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="text-stone-400 hover:text-stone-700 text-xs"
            >
              ✕
            </button>
          )}
        </div>

        {/* Playback Controls (Active when simulation is present) */}
        {simulationResult ? (
          <div className="flex items-center gap-2 flex-wrap bg-white px-3 py-1.5 rounded-lg border border-[#e5ded0]">
            <span className="text-[11px] font-mono font-bold text-[#800020] uppercase tracking-wider mr-1 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse" />
              <span>Sim Active:</span>
            </span>

            {simPlaybackStatus === "running" ? (
              <button
                onClick={handlePause}
                className="px-2.5 py-1 text-xs font-mono font-bold bg-[#faf7f2] hover:bg-stone-200 text-stone-800 rounded border border-[#d6ccbe] transition cursor-pointer"
              >
                ⏸️ Pause
              </button>
            ) : (
              <button
                onClick={handlePlayResume}
                className="px-2.5 py-1 text-xs font-mono font-bold bg-[#800020] hover:bg-[#66001a] text-white rounded transition cursor-pointer"
              >
                ▶️ {simPlaybackStatus === "completed" ? "Replay" : "Resume"}
              </button>
            )}

            <button
              onClick={handleNextStep}
              disabled={currentHopStep >= maxSimulationHops}
              className="px-2.5 py-1 text-xs font-mono font-bold bg-[#faf7f2] hover:bg-stone-200 disabled:opacity-40 text-stone-800 rounded border border-[#d6ccbe] transition cursor-pointer"
              title="Advance one hop"
            >
              ⏭️ Next Hop
            </button>

            <button
              onClick={handleStop}
              className="px-2 py-1 text-xs font-mono text-stone-600 hover:text-stone-900 rounded hover:bg-stone-100 transition cursor-pointer"
            >
              ⏹️ Stop
            </button>

            <button
              onClick={handleReset}
              className="px-2 py-1 text-xs font-mono font-bold text-[#800020] hover:underline transition cursor-pointer"
            >
              ↺ Reset Sim
            </button>

            <div className="text-[11px] font-mono text-stone-600 border-l border-stone-200 pl-2">
              Propagation: <strong className="text-stone-900">Hop {currentHopStep} / {maxSimulationHops}</strong>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-4 text-xs font-mono text-stone-600">
            <span className="text-[11px] bg-white px-2.5 py-1 rounded border border-[#d6ccbe]">
              💡 Tip: Click <strong>Simulate Incident</strong> to model lateral propagation & cascading outages.
            </span>
          </div>
        )}

        {/* Zoom Controls */}
        <div className="flex items-center gap-1 self-end lg:self-auto font-mono text-xs">
          <button
            onClick={handleZoomOut}
            className="w-7 h-7 bg-white hover:bg-stone-100 border border-[#d6ccbe] rounded-md flex items-center justify-center font-bold text-stone-700"
            title="Zoom Out"
          >
            -
          </button>
          <span className="text-[11px] text-stone-600 w-12 text-center font-bold">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={handleZoomIn}
            className="w-7 h-7 bg-white hover:bg-stone-100 border border-[#d6ccbe] rounded-md flex items-center justify-center font-bold text-stone-700"
            title="Zoom In"
          >
            +
          </button>
          <button
            onClick={handleResetZoom}
            className="px-2 py-1 bg-white hover:bg-stone-100 border border-[#d6ccbe] rounded-md text-[10px] text-stone-600 ml-1"
          >
            Fit
          </button>
        </div>
      </div>

      {/* ── GRAPH CANVAS & SIDEBAR CONTAINER ────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* GRAPH CANVAS (8 or 12 cols depending on panel) */}
        <div className="lg:col-span-8 bg-[#f4efe6] border-2 border-[#d6ccbe] rounded-2xl relative h-[620px] overflow-hidden shadow-inner flex flex-col">
          {/* Legend Banner */}
          <div className="absolute top-3 left-3 z-10 bg-white/90 backdrop-blur-xs border border-[#d6ccbe] rounded-xl px-3 py-2 text-[10px] font-mono flex flex-wrap items-center gap-3 shadow-xs">
            <span className="font-bold text-stone-700 uppercase">State Legend:</span>
            <span className="flex items-center gap-1 text-emerald-800">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 border border-emerald-600" /> Healthy
            </span>
            <span className="flex items-center gap-1 text-amber-800">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 border border-amber-600" /> At Risk
            </span>
            <span className="flex items-center gap-1 text-red-700 font-bold">
              <span className="w-2.5 h-2.5 rounded-full bg-red-600 border border-red-700 animate-ping" /> Initial Compromise
            </span>
            <span className="flex items-center gap-1 text-[#800020] font-bold">
              <span className="w-2.5 h-2.5 rounded-full bg-[#800020] border border-[#800020]" /> Directly Impacted (Hop 1)
            </span>
            <span className="flex items-center gap-1 text-purple-800">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-600 border border-purple-700" /> Indirect Cascade (Hop 2+)
            </span>
          </div>

          {/* SVG Canvas */}
          {loadingGraph ? (
            <div className="m-auto text-center font-mono text-xs text-stone-500 space-y-2">
              <div className="text-3xl animate-spin">⚙️</div>
              <p>Constructing live infrastructure dependency topology...</p>
            </div>
          ) : graphError ? (
            <div className="m-auto text-center font-mono text-xs text-red-600 p-6 bg-red-50 border border-red-200 rounded-xl max-w-md">
              <p className="font-bold">Error loading topology:</p>
              <p className="mt-1">{graphError}</p>
            </div>
          ) : (
            <svg
              ref={svgRef}
              id="graph-canvas"
              className="w-full h-full cursor-grab active:cursor-grabbing select-none"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
            >
              {/* Background Grid */}
              <defs>
                <pattern id="grid-pattern" width="28" height="28" patternUnits="userSpaceOnUse">
                  <circle cx="2" cy="2" r="1" fill="#d6ccbe" opacity="0.8" />
                </pattern>
                {/* Arrowhead marker for directed edges */}
                <marker
                  id="arrow-default"
                  viewBox="0 0 10 10"
                  refX="18"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#b8aa95" />
                </marker>
                <marker
                  id="arrow-active"
                  viewBox="0 0 10 10"
                  refX="18"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#800020" />
                </marker>
              </defs>

              <rect
                id="graph-background"
                x="0"
                y="0"
                width="100%"
                height="100%"
                fill="url(#grid-pattern)"
              />

              <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
                {/* 1. EDGES */}
                {graphData?.edges.map((edge, idx) => {
                  const srcPos = nodePositions.get(edge.from);
                  const tgtPos = nodePositions.get(edge.to);
                  if (!srcPos || !tgtPos) return null;

                  const edgeKey = `${edge.from}->${edge.to}`;
                  const isActive = activeEdgeKeys.has(edgeKey);

                  // Calculate cubic curve control points
                  const dx = tgtPos.x - srcPos.x;
                  const dy = tgtPos.y - srcPos.y;
                  const cx1 = srcPos.x + dx * 0.4;
                  const cy1 = srcPos.y;
                  const cx2 = tgtPos.x - dx * 0.4;
                  const cy2 = tgtPos.y;
                  const pathData = `M ${srcPos.x} ${srcPos.y} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${tgtPos.x} ${tgtPos.y}`;

                  return (
                    <g key={idx} className="group">
                      <path
                        d={pathData}
                        fill="none"
                        stroke={isActive ? "#800020" : "#c4b5a0"}
                        strokeWidth={isActive ? 3 : 1.5}
                        strokeDasharray={isActive ? "6 4" : undefined}
                        className={isActive ? "animate-[dash_1.5s_linear_infinite]" : undefined}
                        markerEnd={isActive ? "url(#arrow-active)" : "url(#arrow-default)"}
                      />
                      {/* Pulse particle along active paths */}
                      {isActive && (
                        <circle r="3.5" fill="#ef4444">
                          <animateMotion path={pathData} dur="1.8s" repeatCount="indefinite" />
                        </circle>
                      )}
                    </g>
                  );
                })}

                {/* 2. NODES */}
                {graphData?.nodes.map((node) => {
                  const pos = nodePositions.get(node.id);
                  if (!pos) return null;

                  const isSelected = selectedNodeId === node.id;
                  const simState = nodeSimulationState.get(node.id);
                  const isFiltered = filteredNodeIds ? filteredNodeIds.has(node.id) : true;
                  const icon = ASSET_ICONS[node.type] || "🖥️";

                  // Node color determination
                  let borderColor = "#10b981"; // Healthy green
                  let bgColor = "#ffffff";
                  let badgeText = "Healthy";
                  let badgeBg = "bg-emerald-50 text-emerald-800 border-emerald-200";

                  if (node.status === "at_risk") {
                    borderColor = "#f59e0b"; // Orange
                    badgeText = "At Risk";
                    badgeBg = "bg-amber-50 text-amber-800 border-amber-200";
                  }

                  if (simState) {
                    if (simState.state === "initial_compromise") {
                      borderColor = "#dc2626"; // Red
                      bgColor = "#fef2f2";
                      badgeText = "COMPROMISED";
                      badgeBg = "bg-red-600 text-white font-bold";
                    } else if (simState.state === "directly_impacted") {
                      borderColor = "#800020"; // Maroon
                      bgColor = "#faf5f5";
                      badgeText = "Impacted (Hop 1)";
                      badgeBg = "bg-[#800020] text-white font-bold";
                    } else if (simState.state === "indirectly_impacted") {
                      borderColor = "#9333ea"; // Purple
                      bgColor = "#faf5ff";
                      badgeText = `Cascading (${simState.distance} hops)`;
                      badgeBg = "bg-purple-600 text-white font-bold";
                    } else if (simState.state === "isolated") {
                      borderColor = "#3b82f6"; // Blue
                      badgeText = "Segmented";
                      badgeBg = "bg-blue-600 text-white font-bold";
                    }
                  }

                  return (
                    <g
                      key={node.id}
                      transform={`translate(${pos.x}, ${pos.y})`}
                      onClick={() => setSelectedNodeId(node.id)}
                      className={`cursor-pointer transition-opacity ${
                        isFiltered ? "opacity-100" : "opacity-25"
                      }`}
                    >
                      {/* Concentric ping circle for initial compromise */}
                      {simState?.state === "initial_compromise" && (
                        <circle
                          r="42"
                          fill="none"
                          stroke="#ef4444"
                          strokeWidth="2"
                          className="animate-ping opacity-75"
                        />
                      )}

                      {/* Selection Aura */}
                      {isSelected && (
                        <circle
                          r="38"
                          fill="none"
                          stroke="#800020"
                          strokeWidth="3"
                          strokeDasharray="4 2"
                          className="animate-spin"
                        />
                      )}

                      {/* Main Node Circle */}
                      <circle
                        r="28"
                        fill={bgColor}
                        stroke={borderColor}
                        strokeWidth={isSelected ? 3.5 : 2.5}
                        className="transition-all hover:scale-110 drop-shadow-sm"
                      />

                      {/* Icon */}
                      <text
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize="18"
                        pointerEvents="none"
                      >
                        {icon}
                      </text>

                      {/* Node Label Below */}
                      <text
                        y="42"
                        textAnchor="middle"
                        fontSize="11"
                        fontFamily="monospace"
                        fontWeight="bold"
                        fill="#1c1917"
                        pointerEvents="none"
                      >
                        {node.label.length > 18 ? node.label.slice(0, 16) + "…" : node.label}
                      </text>

                      {/* Criticality Pill */}
                      <text
                        y="55"
                        textAnchor="middle"
                        fontSize="9"
                        fontFamily="monospace"
                        fill={node.criticality === "Critical" ? "#800020" : "#78716c"}
                        fontWeight={node.criticality === "Critical" ? "bold" : "normal"}
                        pointerEvents="none"
                      >
                        {node.type} · {node.criticality}
                      </text>
                    </g>
                  );
                })}
              </g>
            </svg>
          )}

          {/* Safety Watermark */}
          <div className="absolute bottom-2 left-3 text-[10px] font-mono text-stone-500 bg-white/80 px-2 py-0.5 rounded border border-[#d6ccbe] pointer-events-none">
            🛡️ Simulation Engine: Strictly Isolated from Production State
          </div>
        </div>

        {/* ── IMPACT ANALYSIS SIDE PANEL ──────────────────────────────────── */}
        <div className="lg:col-span-4 bg-white border border-[#e5ded0] rounded-2xl p-4 shadow-xs flex flex-col h-[620px] overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-[#e5ded0] pb-2 mb-3 gap-1 font-mono text-xs">
            <button
              onClick={() => setActiveTab("overview")}
              className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                activeTab === "overview"
                  ? "bg-[#800020] text-white"
                  : "text-stone-600 hover:text-stone-900"
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab("assets")}
              className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                activeTab === "assets"
                  ? "bg-[#800020] text-white"
                  : "text-stone-600 hover:text-stone-900"
              }`}
            >
              Assets ({simulationResult?.summary.total_affected_assets ?? 0})
            </button>
            <button
              onClick={() => setActiveTab("timeline")}
              className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                activeTab === "timeline"
                  ? "bg-[#800020] text-white"
                  : "text-stone-600 hover:text-stone-900"
              }`}
            >
              Timeline
            </button>
            <button
              onClick={() => setActiveTab("mitigations")}
              className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                activeTab === "mitigations"
                  ? "bg-[#800020] text-white"
                  : "text-stone-600 hover:text-stone-900"
              }`}
            >
              Playbook
            </button>
          </div>

          {/* Body based on Active Tab */}
          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {/* TAB 1: OVERVIEW */}
            {activeTab === "overview" && (
              <div className="space-y-4">
                {simulationResult ? (
                  <>
                    {/* Scenario Badge */}
                    <div className="p-3 bg-[#faf7f2] border border-[#d6ccbe] rounded-xl space-y-1">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="font-bold text-[#800020] uppercase">
                          {simulationResult.scenario_title}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-600 text-white font-mono">
                          {simulationResult.severity}
                        </span>
                      </div>
                      <div className="text-xs text-stone-700">
                        Origin: <strong className="text-stone-900">{simulationResult.initial_asset.name}</strong> ({simulationResult.initial_asset.type})
                      </div>
                    </div>

                    {/* KPI Cards */}
                    <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                      <div className="p-2.5 bg-[#faf7f2] border border-[#e5ded0] rounded-lg">
                        <span className="text-[10px] text-stone-500 uppercase">Potentially Affected</span>
                        <div className="text-xl font-bold text-[#800020] mt-0.5">
                          {simulationResult.summary.total_affected_assets}
                          <span className="text-[10px] font-normal text-stone-400 ml-1">
                            / {simulationResult.summary.total_fleet_count}
                          </span>
                        </div>
                      </div>

                      <div className="p-2.5 bg-[#faf7f2] border border-[#e5ded0] rounded-lg">
                        <div className="text-[10px] text-stone-500 uppercase">Blast Radius</div>
                        <div className="text-xl font-bold text-stone-900 mt-0.5">
                          {simulationResult.summary.potential_blast_radius_pct}%
                        </div>
                      </div>

                      <div className="p-2.5 bg-[#faf7f2] border border-[#e5ded0] rounded-lg">
                        <span className="text-[10px] text-stone-500 uppercase">Directly Dependent</span>
                        <div className="text-lg font-bold text-stone-800 mt-0.5">
                          {simulationResult.summary.directly_affected} assets
                        </div>
                      </div>

                      <div className="p-2.5 bg-[#faf7f2] border border-[#e5ded0] rounded-lg">
                        <span className="text-[10px] text-stone-500 uppercase">Tier 1 Critical</span>
                        <div className="text-lg font-bold text-red-700 mt-0.5">
                          {simulationResult.summary.critical_assets_affected} at risk
                        </div>
                      </div>
                    </div>

                    {/* Narrative Explanation */}
                    <div className="p-3 bg-[#f5f0e6] border border-[#d6ccbe] rounded-xl text-xs space-y-1">
                      <div className="font-bold font-mono text-[#800020] uppercase text-[11px]">
                        Propagation Narrative:
                      </div>
                      <p className="text-stone-700 leading-relaxed text-[11px]">
                        {simulationResult.summary.narrative_summary}
                      </p>
                    </div>

                    {/* Focused Node Info (if user clicked a node) */}
                    {selectedNode && (
                      <div className="p-3 bg-white border border-[#800020]/30 rounded-xl space-y-1 shadow-xs">
                        <div className="text-xs font-mono font-bold text-[#800020] flex items-center justify-between">
                          <span>Inspector: {selectedNode.label}</span>
                          <span className="text-[10px] text-stone-500">ID #{selectedNode.id}</span>
                        </div>
                        <div className="text-xs text-stone-600">
                          Type: <strong>{selectedNode.type}</strong> · Criticality: <strong>{selectedNode.criticality}</strong>
                        </div>
                        {selectedSimDetail ? (
                          <div className="pt-2 border-t border-stone-200 text-xs space-y-1">
                            <div className="text-[11px] font-mono font-bold text-red-700">
                              Simulated Impact: {selectedSimDetail.impact_level} (Distance: {selectedSimDetail.distance} hop{selectedSimDetail.distance !== 1 ? "s" : ""})
                            </div>
                            <p className="text-[11px] text-stone-600">{selectedSimDetail.reason}</p>
                          </div>
                        ) : (
                          <div className="text-[11px] text-emerald-700 pt-1 font-mono">
                            ✓ Unreachable in current scenario propagation.
                          </div>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="p-8 text-center text-xs font-mono text-stone-500 space-y-3">
                    <div className="text-3xl">📡</div>
                    <p className="font-bold text-stone-800">No active incident simulation.</p>
                    <p className="text-stone-500">
                      Click the maroon <strong>Simulate Incident</strong> button above to pick an initial compromised asset and model cascading consequences.
                    </p>
                    <button
                      onClick={() => setIsConfigOpen(true)}
                      className="px-4 py-2 bg-[#800020] text-white rounded-xl text-xs font-mono font-bold hover:bg-[#66001a] transition cursor-pointer"
                    >
                      Configure Simulation
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: AFFECTED ASSETS LIST */}
            {activeTab === "assets" && (
              <div className="space-y-2">
                {!simulationResult ? (
                  <div className="p-6 text-center text-xs font-mono text-stone-500">No active simulation.</div>
                ) : (
                  simulationResult.affected_assets.map((item) => (
                    <div
                      key={item.asset_id}
                      onClick={() => setSelectedNodeId(item.asset_id)}
                      className={`p-2.5 rounded-xl border text-xs cursor-pointer transition ${
                        selectedNodeId === item.asset_id
                          ? "bg-[#faf5f5] border-[#800020]"
                          : "bg-white border-[#e5ded0] hover:bg-[#faf7f2]"
                      }`}
                    >
                      <div className="flex items-center justify-between font-mono">
                        <span className="font-bold text-stone-900">{item.asset_name}</span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                            item.impact_level === "CRITICAL"
                              ? "bg-red-600 text-white"
                              : item.impact_level === "HIGH"
                              ? "bg-[#800020] text-white"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {item.impact_level}
                        </span>
                      </div>
                      <div className="text-[11px] text-stone-500 mt-0.5">
                        {item.asset_type} · Distance: {item.distance === 0 ? "Initial" : `Hop ${item.distance}`}
                      </div>
                      <p className="text-[11px] text-stone-600 mt-1 line-clamp-2">{item.reason}</p>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* TAB 3: CHRONOLOGICAL TIMELINE */}
            {activeTab === "timeline" && (
              <div className="space-y-3">
                {!simulationResult ? (
                  <div className="p-6 text-center text-xs font-mono text-stone-500">No active simulation.</div>
                ) : (
                  <div className="relative border-l-2 border-[#800020]/30 ml-2 space-y-4">
                    {simulationResult.timeline.map((evt, idx) => (
                      <div
                        key={idx}
                        onClick={() => setSelectedNodeId(evt.asset_id)}
                        className="ml-3 cursor-pointer group"
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-[#800020] -ml-[19px] border-2 border-white" />
                          <span className="text-[10px] font-mono font-bold text-[#800020] bg-[#800020]/10 px-1.5 py-0.2 rounded">
                            {evt.event_time_label}
                          </span>
                          <span className="text-xs font-bold text-stone-900 font-mono">
                            {evt.asset_name}
                          </span>
                        </div>
                        <p className="text-[11px] text-stone-600 mt-1 leading-relaxed pl-1">
                          {evt.description}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB 4: MITIGATION PLAYBOOK */}
            {activeTab === "mitigations" && (
              <div className="space-y-3">
                {!simulationResult ? (
                  <div className="p-6 text-center text-xs font-mono text-stone-500">No active simulation.</div>
                ) : (
                  <>
                    <h4 className="text-xs font-mono font-bold uppercase text-[#800020]">
                      Emergency Incident Mitigations:
                    </h4>
                    <ul className="space-y-2">
                      {simulationResult.mitigation_recommendations.map((rec, i) => (
                        <li
                          key={i}
                          className="p-2.5 bg-[#faf7f2] border border-[#e5ded0] rounded-xl text-xs text-stone-700 flex items-start gap-2"
                        >
                          <span className="text-emerald-700 font-bold">✓</span>
                          <span>{rec}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── SIMULATION CONFIGURATION MODAL ──────────────────────────────── */}
      {isConfigOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-xs p-4 font-sans">
          <div className="bg-[#fbf9f5] rounded-2xl border-2 border-[#d6ccbe] shadow-2xl max-w-2xl w-full p-6 space-y-5 animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-[#e5ded0] pb-3">
              <div>
                <h3 className="text-lg font-black text-[#800020] font-mono flex items-center gap-2">
                  <span>🚨</span> Configure Incident Simulation
                </h3>
                <p className="text-xs text-stone-600 mt-0.5">
                  Select an initial affected asset and incident archetype to compute blast radius and cascading failures.
                </p>
              </div>
              <button
                onClick={() => setIsConfigOpen(false)}
                className="w-8 h-8 rounded-full bg-white hover:bg-stone-200 text-stone-700 flex items-center justify-center font-bold border border-[#d6ccbe] cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Step 1: Initial Asset Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-mono font-bold uppercase tracking-wider text-stone-700 flex items-center justify-between">
                <span>1. Select Initial Affected Asset</span>
                <span className="text-[10px] text-stone-500 font-normal">Epicenter of incident</span>
              </label>
              <select
                value={selectedInitialAssetId || ""}
                onChange={(e) => setSelectedInitialAssetId(Number(e.target.value))}
                className="w-full bg-white border border-[#d6ccbe] focus:border-[#800020] rounded-xl p-2.5 text-xs text-stone-900 font-mono outline-none"
              >
                {graphData?.nodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    Asset #{n.id}: {n.label} ({n.type} · {n.criticality} Criticality)
                  </option>
                ))}
              </select>
            </div>

            {/* Step 2: Scenario Type Cards */}
            <div className="space-y-2">
              <label className="text-xs font-mono font-bold uppercase tracking-wider text-stone-700">
                2. Select Incident Scenario Archetype
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {scenarios.map((sc) => {
                  const isChosen = selectedScenarioId === sc.id;
                  return (
                    <div
                      key={sc.id}
                      onClick={() => setSelectedScenarioId(sc.id)}
                      className={`p-3 rounded-xl border text-xs cursor-pointer transition ${
                        isChosen
                          ? "bg-[#800020]/10 border-[#800020] ring-1 ring-[#800020]"
                          : "bg-white border-[#d6ccbe] hover:border-stone-400"
                      }`}
                    >
                      <div className="flex items-center justify-between font-mono font-bold text-stone-900">
                        <span>{sc.title}</span>
                        {isChosen && <span className="text-[#800020]">✓</span>}
                      </div>
                      <p className="text-[11px] text-stone-600 mt-1 leading-relaxed">
                        {sc.description}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Step 3: Severity */}
            <div className="space-y-1.5">
              <label className="text-xs font-mono font-bold uppercase tracking-wider text-stone-700">
                3. Incident Severity
              </label>
              <div className="flex gap-2">
                {["CRITICAL", "HIGH", "MEDIUM", "LOW"].map((sev) => (
                  <button
                    key={sev}
                    type="button"
                    onClick={() => setSelectedSeverity(sev)}
                    className={`flex-1 py-1.5 text-xs font-mono font-bold rounded-lg border transition cursor-pointer ${
                      selectedSeverity === sev
                        ? "bg-[#800020] text-white border-[#800020]"
                        : "bg-white text-stone-700 border-[#d6ccbe] hover:bg-stone-50"
                    }`}
                  >
                    {sev}
                  </button>
                ))}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="pt-3 border-t border-[#e5ded0] flex items-center justify-between">
              <span className="text-[10px] font-mono text-stone-500">
                🔒 Safe Graph Calculation · No physical device altered
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsConfigOpen(false)}
                  className="px-4 py-2 bg-white hover:bg-stone-100 border border-[#d6ccbe] rounded-xl text-xs font-mono font-bold text-stone-700 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleStartSimulation}
                  disabled={isStartingSim}
                  className="px-5 py-2 bg-[#800020] hover:bg-[#66001a] disabled:opacity-50 text-white rounded-xl text-xs font-mono font-black transition cursor-pointer flex items-center gap-2 shadow-xs"
                >
                  {isStartingSim ? "Running Traversal..." : "▶️ Start Simulation"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

