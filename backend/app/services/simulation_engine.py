from __future__ import annotations

import uuid
import math
from datetime import datetime, timezone
from collections import deque
from typing import Dict, List, Set, Any, Optional
from sqlalchemy.orm import Session

from app.models.asset import Asset, AssetDependency
from app.models.risk import RiskAssessment
from app.models.vulnerability import AssetVulnerability


SCENARIOS = {
    "asset_compromise": {
        "title": "Asset Compromise & Lateral Movement",
        "description": "Simulates threat actor gaining initial execution on an asset and pivoting along reachable service dependencies.",
        "traversal_mode": "downstream_and_lateral",
        "decay_per_hop": 0.70,
    },
    "ransomware": {
        "title": "Ransomware Lateral Encryption Impact",
        "description": "Models automated wormable malware spreading across mapped dependencies and shared credential boundaries to encrypt critical databases and services.",
        "traversal_mode": "all_connected",
        "decay_per_hop": 0.80,
    },
    "service_outage": {
        "title": "Service Outage & Cascading Failure",
        "description": "Models systemic failure of an upstream component, cutting off essential operational feeds to downstream dependent systems.",
        "traversal_mode": "downstream_only",
        "decay_per_hop": 0.65,
    },
    "network_isolation": {
        "title": "Proactive Network Microsegmentation & Quarantine",
        "description": "Simulates emergency blast-radius containment by severing asset network interfaces, evaluating affected downstream dependents and confirming containment.",
        "traversal_mode": "containment_boundary",
        "decay_per_hop": 0.30,
    },
}


def classify_simulated_impact_level(
    criticality: str,
    distance: int,
    dependency_strength: float,
    scenario: str,
    base_severity: str = "HIGH",
) -> str:
    """
    Deterministic impact classification based on:
    - Distance (0 = Initial, 1 = Direct, 2+ = Cascading Indirect)
    - Target Asset Criticality (Critical, High, Medium, Low)
    - Dependency strength (0.0 to 1.0)
    - Scenario type
    """
    if distance == 0:
        return "CRITICAL" if base_severity in ["CRITICAL", "HIGH"] else base_severity

    crit = (criticality or "Medium").capitalize()

    # Calculate numeric impact weight (0 - 100)
    crit_weight = {"Critical": 90, "High": 70, "Medium": 45, "Low": 20}.get(crit, 45)
    distance_decay = 1.0 if distance == 1 else (0.65 ** (distance - 1))
    strength_factor = max(0.4, min(1.0, dependency_strength))

    impact_score = crit_weight * distance_decay * strength_factor

    if scenario == "ransomware":
        impact_score *= 1.15  # Ransomware compounds urgency
    elif scenario == "network_isolation":
        impact_score *= 0.60  # Controlled containment dampens unverified damage

    if impact_score >= 65:
        return "CRITICAL"
    elif impact_score >= 45:
        return "HIGH"
    elif impact_score >= 25:
        return "MEDIUM"
    return "LOW"


def run_incident_simulation(
    initial_asset_id: int,
    scenario_type: str = "asset_compromise",
    requested_severity: str = "HIGH",
    db: Session = None,
) -> Dict[str, Any]:
    """
    Executes a deterministic BFS graph traversal across live infrastructure dependencies.
    Computes reachable affected assets, blast radius, timeline events, and mitigation steps.
    Strictly isolated from actual production records.
    """
    if db is None:
        raise ValueError("Database session is required")

    initial_asset = db.query(Asset).filter(Asset.id == initial_asset_id).first()
    if not initial_asset:
        raise ValueError(f"Asset with ID {initial_asset_id} does not exist.")

    scenario_cfg = SCENARIOS.get(scenario_type, SCENARIOS["asset_compromise"])
    traversal_mode = scenario_cfg["traversal_mode"]

    # 1. Build adjacency list of dependencies
    # Outgoing: source -> target (downstream)
    # Incoming: target -> source (upstream)
    all_deps = db.query(AssetDependency).all()
    downstream_graph: Dict[int, List[AssetDependency]] = {}
    upstream_graph: Dict[int, List[AssetDependency]] = {}
    all_assets_map: Dict[int, Asset] = {a.id: a for a in db.query(Asset).all()}

    for dep in all_deps:
        downstream_graph.setdefault(dep.source_asset_id, []).append(dep)
        upstream_graph.setdefault(dep.target_asset_id, []).append(dep)

    # 2. Deterministic Graph Traversal (BFS)
    # Queue stores: (current_asset_id, distance_hops, path_of_ids, edge_impact_note, edge_strength)
    queue = deque([(initial_asset_id, 0, [initial_asset_id], "Initial epicenter", 1.0)])
    visited_nodes: Set[int] = {initial_asset_id}
    affected_nodes_list: List[Dict[str, Any]] = []
    traversed_edges: List[Dict[str, Any]] = []

    # Map for timeline generation
    timeline_by_distance: Dict[int, List[Dict[str, Any]]] = {}

    # Initial node record
    init_crit = initial_asset.criticality or "Medium"
    init_record = {
        "asset_id": initial_asset.id,
        "asset_name": initial_asset.asset_name,
        "asset_type": initial_asset.asset_type,
        "criticality": init_crit,
        "department": initial_asset.department or "Operations",
        "impact_level": requested_severity.upper(),
        "distance": 0,
        "path": [initial_asset.id],
        "path_labels": [initial_asset.asset_name],
        "reason": f"Simulated initial point of incident origin ({scenario_cfg['title']}).",
        "potential_service_disruption": "Primary operational compromise; host process execution compromised.",
        "recommended_mitigation": f"Immediately isolate {initial_asset.asset_name} ({initial_asset.ip_address or 'host'}) from network switch fabric.",
        "is_critical_service": init_crit.lower() == "critical",
    }
    affected_nodes_list.append(init_record)
    timeline_by_distance.setdefault(0, []).append(init_record)

    max_hops = 2 if scenario_type == "network_isolation" else 5

    while queue:
        curr_id, dist, path, impact_note, prev_strength = queue.popleft()

        if dist >= max_hops:
            continue

        # Determine eligible neighbors based on scenario
        candidates: List[tuple[int, float, str]] = []

        # Downstream dependencies (A -> B: B depends on A)
        for dep in downstream_graph.get(curr_id, []):
            tgt_id = dep.target_asset_id
            candidates.append(
                (
                    tgt_id,
                    dep.dependency_strength,
                    dep.service_impact
                    or f"Direct downstream dependency on {all_assets_map.get(curr_id, initial_asset).asset_name}",
                )
            )

        # In ransomware or lateral movement, bidirectional network reachability also allows lateral spread
        if traversal_mode in ["downstream_and_lateral", "all_connected"]:
            for dep in upstream_graph.get(curr_id, []):
                src_id = dep.source_asset_id
                # Only traverse upstream if strong communication link
                if dep.dependency_strength >= 0.65:
                    candidates.append(
                        (
                            src_id,
                            dep.dependency_strength * 0.8,
                            f"Lateral pivot via bidirectional service link from {all_assets_map.get(curr_id, initial_asset).asset_name}",
                        )
                    )

        for next_id, strength, impact_desc in candidates:
            if next_id not in visited_nodes:
                visited_nodes.add(next_id)
                next_asset = all_assets_map.get(next_id)
                if not next_asset:
                    continue

                new_dist = dist + 1
                new_path = path + [next_id]
                new_path_labels = [
                    all_assets_map[pid].asset_name
                    for pid in new_path
                    if pid in all_assets_map
                ]

                # Deterministic impact classification
                target_crit = next_asset.criticality or "Medium"
                impact_level = classify_simulated_impact_level(
                    criticality=target_crit,
                    distance=new_dist,
                    dependency_strength=strength,
                    scenario=scenario_type,
                    base_severity=requested_severity,
                )

                # Narrative reason
                curr_asset_name = all_assets_map.get(curr_id, initial_asset).asset_name
                if new_dist == 1:
                    reason = f"Directly connected dependent of {curr_asset_name}. {impact_desc}."
                else:
                    reason = f"Indirect multi-hop dependency via {curr_asset_name} (Hop {new_dist}). Cascading service disruption."

                mitigation = (
                    f"Implement ingress firewall ACLs between {curr_asset_name} and {next_asset.asset_name}; "
                    f"verify health of backup data stores."
                )

                affected_record = {
                    "asset_id": next_asset.id,
                    "asset_name": next_asset.asset_name,
                    "asset_type": next_asset.asset_type,
                    "criticality": target_crit,
                    "department": next_asset.department or "Operations",
                    "impact_level": impact_level,
                    "distance": new_dist,
                    "path": new_path,
                    "path_labels": new_path_labels,
                    "reason": reason,
                    "potential_service_disruption": impact_desc,
                    "recommended_mitigation": mitigation,
                    "is_critical_service": target_crit.lower() == "critical",
                }

                affected_nodes_list.append(affected_record)
                timeline_by_distance.setdefault(new_dist, []).append(affected_record)

                traversed_edges.append(
                    {
                        "from": curr_id,
                        "to": next_id,
                        "hop": new_dist,
                        "strength": strength,
                        "impact": impact_desc,
                    }
                )

                queue.append((next_id, new_dist, new_path, impact_desc, strength))

    # 3. Construct chronological timeline
    timeline: List[Dict[str, Any]] = []
    # T+0s: Initial selection
    timeline.append(
        {
            "timestamp_offset_seconds": 0,
            "event_time_label": "T+0s",
            "phase": "initial_compromise",
            "asset_id": initial_asset.id,
            "asset_name": initial_asset.asset_name,
            "description": f"Incident triggered on {initial_asset.asset_name} ({initial_asset.asset_type}). Scenario: {scenario_cfg['title']}.",
            "impact_tier": requested_severity.upper(),
        }
    )

    current_t = 1
    sorted_dists = sorted([d for d in timeline_by_distance.keys() if d > 0])
    for d in sorted_dists:
        nodes_at_d = timeline_by_distance[d]
        for node in nodes_at_d:
            phase = "direct_propagation" if d == 1 else "cascading_spread"
            timeline.append(
                {
                    "timestamp_offset_seconds": current_t,
                    "event_time_label": f"T+{current_t}s",
                    "phase": phase,
                    "asset_id": node["asset_id"],
                    "asset_name": node["asset_name"],
                    "description": f"Impact propagated to {node['asset_name']} via {node['path_labels'][-2]} (Hop {d}). Reason: {node['reason']}",
                    "impact_tier": node["impact_level"],
                }
            )
            current_t += 1

    # Final event: Containment / Boundary achieved
    timeline.append(
        {
            "timestamp_offset_seconds": current_t,
            "event_time_label": f"T+{current_t}s",
            "phase": "completed",
            "asset_id": initial_asset.id,
            "asset_name": "Perimeter Boundary",
            "description": f"Graph propagation boundary reached. Maximum traversal depth: {max(sorted_dists) if sorted_dists else 0} hops. Total blast radius: {len(affected_nodes_list)} assets.",
            "impact_tier": "ANALYSIS_COMPLETE",
        }
    )

    # 4. Generate high-level summary KPIs
    total_fleet_count = len(all_assets_map)
    total_affected = len(affected_nodes_list)
    directly_affected = len([n for n in affected_nodes_list if n["distance"] == 1])
    indirectly_affected = len([n for n in affected_nodes_list if n["distance"] > 1])
    critical_affected = len([n for n in affected_nodes_list if n["is_critical_service"]])

    blast_radius_pct = (
        round((total_affected / total_fleet_count) * 100, 1)
        if total_fleet_count > 0
        else 0.0
    )

    narrative = (
        f"Simulated {scenario_cfg['title']} originating from {initial_asset.asset_name} "
        f"propagated across {total_affected - 1} connected downstream components, "
        f"affecting {directly_affected} direct dependencies and {indirectly_affected} indirect cascade nodes. "
        f"{critical_affected} Tier-1 Mission-Critical asset{'s are' if critical_affected != 1 else ' is'} within the potential blast radius ({blast_radius_pct}% fleet exposure)."
    )

    # 5. Global incident mitigations
    global_mitigations = [
        f"Immediately execute emergency network microsegmentation on {initial_asset.asset_name} ({initial_asset.ip_address or 'primary host'}).",
        f"Inspect service dependency credentials between {initial_asset.asset_name} and {directly_affected} directly dependent systems.",
        "Validate immutable backup snapshot integrity for all Tier 1 databases in the blast radius.",
        "Enforce strict egress filtering to prevent unauthenticated lateral RPC/SMB propagation.",
    ]

    disrupted_services = list(
        {
            n["potential_service_disruption"]
            for n in affected_nodes_list
            if n.get("potential_service_disruption")
        }
    )

    simulation_id = f"sim_{uuid.uuid4().hex[:10]}"

    return {
        "simulation_id": simulation_id,
        "initial_asset": {
            "id": initial_asset.id,
            "name": initial_asset.asset_name,
            "type": initial_asset.asset_type,
            "criticality": initial_asset.criticality,
            "exposure": initial_asset.exposure,
            "department": initial_asset.department,
        },
        "scenario_type": scenario_type,
        "scenario_title": scenario_cfg["title"],
        "severity": requested_severity.upper(),
        "status": "completed",
        "summary": {
            "total_affected_assets": total_affected,
            "directly_affected": directly_affected,
            "indirectly_affected": indirectly_affected,
            "critical_assets_affected": critical_affected,
            "max_propagation_depth": max(sorted_dists) if sorted_dists else 0,
            "potential_blast_radius_pct": blast_radius_pct,
            "total_fleet_count": total_fleet_count,
            "narrative_summary": narrative,
        },
        "affected_assets": affected_nodes_list,
        "active_paths": traversed_edges,
        "timeline": timeline,
        "disrupted_services": disrupted_services,
        "mitigation_recommendations": global_mitigations,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

