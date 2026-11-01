from __future__ import annotations

import logging
from sqlalchemy.orm import Session
from app.models.asset import Asset, AssetDependency

logger = logging.getLogger(__name__)


def ensure_baseline_dependencies(db: Session) -> int:
    """
    Ensures realistic critical infrastructure dependency relationships exist
    between assets in the database. If asset_dependencies is empty, it populates
    realistic directed paths (Firewall -> Gateway -> API/App -> Core DB -> Warehouse / Workstations).
    Returns the number of active dependencies in the database.
    """
    existing_count = db.query(AssetDependency).count()
    if existing_count > 0:
        return existing_count

    assets = db.query(Asset).all()
    if len(assets) < 2:
        return 0

    # Index assets by name and ID
    asset_by_name = {a.asset_name.strip().lower(): a for a in assets}
    asset_by_id = {a.id: a for a in assets}

    # Archetype relationships mapping: (source_pattern, target_pattern, dep_type, strength, impact)
    archetypes = [
        # Network perimeter & gateways
        ("firewall", "router", "routes_traffic", 0.95, "Ingress routing failure; segmented networks disconnected"),
        ("perimeter", "gateway", "routes_traffic", 0.95, "Perimeter security inspection bypass or gateway outage"),
        ("gateway", "api", "authenticates", 0.90, "API authentication tokens cannot be verified; service blackout"),
        ("gateway", "cluster", "load_balances", 0.85, "Traffic cannot reach application clusters"),
        ("gateway", "workstation", "remote_access", 0.70, "Remote operator workstation access severed"),
        
        # Application to Database & Services
        ("api", "db", "persists_to", 0.95, "Critical transactions cannot be committed to core ledger"),
        ("api", "database", "persists_to", 0.95, "Database read/write latency degrades application SLA"),
        ("cluster", "db", "persists_to", 0.95, "Customer record persistence failure"),
        ("order", "db", "queries", 0.85, "Order fulfillment and inventory lookups stalled"),
        ("order", "database", "queries", 0.85, "Order processing halted due to database disconnect"),
        
        # Industrial / SCADA / Healthcare
        ("scada", "order", "telemetry_feed", 0.75, "Manufacturing line operational telemetry stream lost"),
        ("scada", "plc", "controls", 0.95, "Physical process control loops lose safety setpoint signals"),
        ("pacs", "workstation", "dicom_stream", 0.85, "Diagnostic imaging stream inaccessible to clinical staff"),
        ("emr", "nurse", "clinical_records", 0.90, "Electronic medical records unavailable at bedside terminals"),
        ("server", "warehouse", "etl_pipeline", 0.50, "Analytics and reporting telemetry synchronization lag"),
    ]

    dependencies_to_add: list[AssetDependency] = []
    created_pairs: set[tuple[int, int]] = set()

    # 1. Match based on known asset naming archetypes
    for src_asset in assets:
        src_name = src_asset.asset_name.lower()
        src_type = src_asset.asset_type.lower()
        for src_pat, tgt_pat, dep_type, strength, impact in archetypes:
            if src_pat in src_name or src_pat in src_type:
                # Find suitable targets
                for tgt_asset in assets:
                    if tgt_asset.id == src_asset.id:
                        continue
                    tgt_name = tgt_asset.asset_name.lower()
                    tgt_type = tgt_asset.asset_type.lower()
                    if tgt_pat in tgt_name or tgt_pat in tgt_type:
                        pair = (src_asset.id, tgt_asset.id)
                        rev_pair = (tgt_asset.id, src_asset.id)
                        if pair not in created_pairs and rev_pair not in created_pairs:
                            created_pairs.add(pair)
                            dependencies_to_add.append(
                                AssetDependency(
                                    source_asset_id=src_asset.id,
                                    target_asset_id=tgt_asset.id,
                                    dependency_type=dep_type,
                                    dependency_strength=strength,
                                    service_impact=impact,
                                )
                            )
                            if len(created_pairs) >= 35:
                                break

    # 2. If too few matched (e.g. generic names), create deterministic tiered links
    if len(dependencies_to_add) < 10 and len(assets) >= 5:
        sorted_assets = sorted(assets, key=lambda a: a.id)
        # Create multi-hop cluster chains: 0->1, 1->2, 2->3, etc.
        for i in range(len(sorted_assets) - 1):
            src = sorted_assets[i]
            tgt = sorted_assets[i + 1]
            pair = (src.id, tgt.id)
            if pair not in created_pairs and len(created_pairs) < 40:
                created_pairs.add(pair)
                dependencies_to_add.append(
                    AssetDependency(
                        source_asset_id=src.id,
                        target_asset_id=tgt.id,
                        dependency_type="depends_on",
                        dependency_strength=0.75,
                        service_impact=f"Operational dependency: {tgt.asset_name} requires {src.asset_name} availability.",
                    )
                )

    if dependencies_to_add:
        try:
            db.add_all(dependencies_to_add)
            db.commit()
            logger.info(f"Seeded {len(dependencies_to_add)} baseline infrastructure dependencies.")
            return len(dependencies_to_add)
        except Exception as e:
            db.rollback()
            logger.error(f"Error seeding baseline dependencies: {e}")
            return 0

    return 0

