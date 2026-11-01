"""
Infrastructure Gap Analysis Service for CyberSentra.
Detects missing, incomplete, unknown, or unsupported infrastructure information,
security coverage blind spots, ICS/OT omissions, and dependency gaps.
"""
from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.models.asset import Asset, AssetSoftware, AssetDependency
from app.models.gap import InfrastructureGap
from app.models.risk import RiskAssessment
from app.services.normalizer import canonical_product, canonical_vendor, normalize_name

logger = logging.getLogger(__name__)

# Industrial / OT device indicator keywords
OT_KEYWORDS = {
    "plc", "scada", "rtu", "ied", "hmi", "dcs", "modbus", "dnp3", "bacnet",
    "profinet", "ethernet/ip", "controller", "sensor", "actuator", "pump",
    "turbine", "generator", "smart grid", "substation", "ventilator",
    "infusion", "pacemaker", "medical", "telemetry", "historian", "iot",
}

# Known OT protocols
OT_PROTOCOLS = {
    "modbus", "dnp3", "cip", "ethernet/ip", "bacnet", "profinet", "profibus",
    "iec 60870", "iec 61850", "opc", "opc-ua", "mqtt", "coap", "hart",
}


def _make_fingerprint(asset_id: int, gap_type: str, differentiator: str = "") -> str:
    """Generate a unique, deterministic fingerprint for idempotency."""
    raw = f"{asset_id}:{gap_type}:{differentiator.strip().lower()}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:32]


def _is_critical_or_exposed(asset: Asset) -> bool:
    crit = (asset.criticality or "").strip().lower()
    exp = (asset.exposure or "").strip().lower()
    is_crit = crit in ("critical", "high")
    is_exp = any(x in exp for x in ("external", "internet", "public", "dmz"))
    return is_crit or is_exp


class GapDetector:
    """Evaluates an individual asset against the 4 gap detection categories."""

    def __init__(self, asset: Asset, db: Session):
        self.asset = asset
        self.db = db
        self.gaps: list[dict[str, Any]] = []

    def run_all(self) -> list[dict[str, Any]]:
        self.detect_asset_information_gaps()
        self.detect_security_coverage_gaps()
        self.detect_ics_ot_coverage_gaps()
        self.detect_dependency_gaps()
        return self.gaps

    def _add_gap(
        self,
        *,
        gap_title: str,
        category: str,
        gap_type: str,
        severity: str,
        reason: str,
        recommendation: str,
        differentiator: str = "",
    ) -> None:
        fp = _make_fingerprint(self.asset.id, gap_type, differentiator)
        self.gaps.append({
            "asset_id": self.asset.id,
            "gap_title": gap_title,
            "category": category,
            "gap_type": gap_type,
            "severity": severity,
            "reason": reason,
            "recommendation": recommendation,
            "fingerprint": fp,
        })

    # ── Category A: Asset Information Gaps ────────────────────────────────────

    def detect_asset_information_gaps(self) -> None:
        asset = self.asset
        is_crit_or_exp = _is_critical_or_exposed(asset)

        # 1. Missing or unassigned criticality
        crit = (asset.criticality or "").strip().lower()
        if not crit or crit in ("unknown", "unassigned", "n/a", "none"):
            self._add_gap(
                gap_title="Missing Asset Criticality Classification",
                category="Asset Information",
                gap_type="missing_criticality",
                severity="HIGH" if any(x in (asset.exposure or "").lower() for x in ("external", "internet")) else "MEDIUM",
                reason=(
                    f"Asset '{asset.asset_name}' has no recorded business criticality tier. "
                    "Without criticality classification, incident escalation and risk prioritization cannot be performed accurately."
                ),
                recommendation="Conduct an operational asset valuation and assign a recognized criticality level (Critical, High, Medium, or Low).",
                differentiator="criticality",
            )

        # 2. Unknown or unverified network exposure
        exp = (asset.exposure or "").strip().lower()
        if not exp or exp in ("unknown", "unassigned", "unverified", "n/a"):
            self._add_gap(
                gap_title="Unknown Network Exposure Boundary",
                category="Asset Information",
                gap_type="unknown_exposure",
                severity="HIGH" if crit in ("critical", "high") else "MEDIUM",
                reason=(
                    f"Network boundary exposure for '{asset.asset_name}' is unverified. "
                    "If this host is accessible from public or perimeter zones, unmapped exposure conceals the immediate attack surface."
                ),
                recommendation="Audit firewall ingress/egress rules and NAT tables to confirm whether this asset is Internal or External/Internet-Facing.",
                differentiator="exposure",
            )

        # 3. Missing asset owner / department
        dept = (asset.department or "").strip().lower()
        if not dept or dept in ("unknown", "unassigned", "n/a", "none", "operations default"):
            sev = "HIGH" if (crit == "critical" and is_crit_or_exp) else ("MEDIUM" if is_crit_or_exp else "LOW")
            self._add_gap(
                gap_title="Missing Operational Asset Owner",
                category="Asset Information",
                gap_type="missing_owner",
                severity=sev,
                reason=(
                    f"Asset '{asset.asset_name}' has no assigned department or operational custodian. "
                    "In the event of an infrastructure incident or required patch cycle, lack of ownership delays containment."
                ),
                recommendation="Assign a designated engineering unit, application team, or system administrator as the accountable asset owner.",
                differentiator="department",
            )

        # 4. Missing asset location / environment
        env = (asset.environment or "").strip().lower()
        if not env or env in ("unknown", "unassigned", "n/a"):
            self._add_gap(
                gap_title="Missing Deployment Environment Metadata",
                category="Asset Information",
                gap_type="missing_location",
                severity="MEDIUM" if is_crit_or_exp else "LOW",
                reason=(
                    f"The operating environment for '{asset.asset_name}' is unspecified. "
                    "Discerning whether this system operates in Production, Staging, DMZ, or a segregated lab is critical for risk scoring."
                ),
                recommendation="Specify the deployment lifecycle environment (Production, Staging, DR Site, or DMZ).",
                differentiator="environment",
            )

        # 5. Incomplete asset descriptions (IP address / OS platform)
        ip = (asset.ip_address or "").strip()
        os_platform = (asset.operating_system or "").strip()
        if not ip:
            self._add_gap(
                gap_title="Missing Host IP Address",
                category="Asset Information",
                gap_type="missing_ip",
                severity="MEDIUM" if is_crit_or_exp else "LOW",
                reason=(
                    f"Asset '{asset.asset_name}' does not have a recorded IPv4/IPv6 address. "
                    "Without network addresses, automated vulnerability probes and SIEM log correlation cannot associate network alerts."
                ),
                recommendation="Register the static IP address, DHCP reservation, or internal DNS hostname for this asset.",
                differentiator="ip",
            )
        if not os_platform or os_platform.lower() in ("unknown", "n/a", "other"):
            self._add_gap(
                gap_title="Unspecified Operating System Platform",
                category="Asset Information",
                gap_type="missing_os",
                severity="HIGH" if is_crit_or_exp else "MEDIUM",
                reason=(
                    f"Operating system platform for '{asset.asset_name}' is missing or unverified. "
                    "Kernel-level vulnerabilities, missing security baselines, and OS End-of-Life (EOL) risks cannot be tracked."
                ),
                recommendation="Inspect host telemetry to record the exact OS distribution and kernel release (e.g., Ubuntu 22.04 LTS, Windows Server 2022).",
                differentiator="os",
            )

        # 6. Software-level information gaps (Vendor & Version)
        for sw in asset.software:
            v = (sw.vendor or "").strip().lower()
            if not v or v in ("unknown", "n/a", "none", ""):
                sev = "HIGH" if is_crit_or_exp else "MEDIUM"
                self._add_gap(
                    gap_title=f"Missing Vendor/Manufacturer: {sw.software_name}",
                    category="Asset Information",
                    gap_type="missing_vendor",
                    severity=sev,
                    reason=(
                        f"Software component '{sw.software_name}' on asset '{asset.asset_name}' has no recorded vendor/manufacturer. "
                        "Without vendor information, automated matching against National Vulnerability Database (NVD) CPE catalogs is impaired."
                    ),
                    recommendation=f"Update the asset inventory with the official vendor or publisher for '{sw.software_name}'.",
                    differentiator=f"sw_vendor_{sw.software_name}",
                )

            ver = (sw.version or "").strip().lower()
            if not ver or ver in ("*", "unknown", "n/a", "none", "latest", "default"):
                sev = "HIGH" if is_crit_or_exp else "MEDIUM"
                self._add_gap(
                    gap_title=f"Unknown Software/Firmware Version: {sw.software_name}",
                    category="Asset Information",
                    gap_type="unknown_version",
                    severity=sev,
                    reason=(
                        f"Software component '{sw.software_name}' on asset '{asset.asset_name}' has an unknown or unverified version ('{sw.version}'). "
                        "Vulnerability assessment requires specific version numbers to evaluate whether known security advisories affect this build."
                    ),
                    recommendation=f"Query the package manager or management console to record the exact semantic version/build of '{sw.software_name}'.",
                    differentiator=f"sw_version_{sw.software_name}",
                )

    # ── Category B: Security Coverage Gaps ────────────────────────────────────

    def detect_security_coverage_gaps(self) -> None:
        asset = self.asset
        is_crit_or_exp = _is_critical_or_exposed(asset)

        # 1. Asset with zero installed software or services recorded
        if not asset.software:
            self._add_gap(
                gap_title="Insufficient Inventory for Vulnerability Assessment",
                category="Security Coverage",
                gap_type="insufficient_match_intel",
                severity="HIGH" if is_crit_or_exp else "MEDIUM",
                reason=(
                    f"Asset '{asset.asset_name}' has zero software applications, firmware modules, or network services documented in inventory. "
                    "Automated vulnerability scanning cannot evaluate an empty profile, causing a false sense of security."
                ),
                recommendation="Perform an automated discovery scan (e.g., Nmap/agent SBOM) to inventory installed packages and listening services.",
                differentiator="no_software",
            )

        # 2. Unassessed asset (never evaluated by risk engine)
        assessment_count = len(asset.risk_assessments)
        if assessment_count == 0:
            self._add_gap(
                gap_title="Unassessed Asset — No Cyber-Risk Evaluation",
                category="Security Coverage",
                gap_type="unassessed_asset",
                severity="HIGH" if is_crit_or_exp else "MEDIUM",
                reason=(
                    f"Asset '{asset.asset_name}' has not undergone an automated risk or vulnerability assessment. "
                    "A lack of recorded vulnerabilities must not be interpreted as a clean or secure posture."
                ),
                recommendation="Trigger a fleet risk assessment or run a targeted assessment for this asset from the Assessment console.",
                differentiator="unassessed",
            )

        # 3. Unsupported or unnormalized software products
        for sw in asset.software:
            norm_prod = canonical_product(sw.software_name)
            norm_vend = canonical_vendor(sw.vendor) if sw.vendor else ""
            clean_name = normalize_name(sw.software_name)

            # If normalizer returned identical raw string or couldn't parse product
            if clean_name and (norm_prod == clean_name.replace(" ", "_")) and len(clean_name) > 3:
                # Check if it has any match in local vulnerability DB or CPE catalog
                # If software has no recognized CPE alias
                pass

        # 4. Zero vulnerability matches stored despite software being present
        if asset.software and assessment_count > 0 and len(asset.vulnerabilities) == 0:
            self._add_gap(
                gap_title="Unverified Clean State — Zero Vulnerabilities Stored",
                category="Security Coverage",
                gap_type="unmatched_coverage",
                severity="MEDIUM" if is_crit_or_exp else "LOW",
                reason=(
                    f"Asset '{asset.asset_name}' has installed software but zero matched CVEs in the local threat intelligence catalog. "
                    "While no active matches were found, zero stored findings does not guarantee immunity from zero-day or proprietary risks."
                ),
                recommendation="Ensure NVD threat intelligence feeds are synchronized and review niche vendor advisories manually.",
                differentiator="zero_cves_coverage",
            )

    # ── Category C: ICS/OT Coverage Gaps ──────────────────────────────────────

    def detect_ics_ot_coverage_gaps(self) -> None:
        asset = self.asset
        combined_text = f"{asset.asset_name} {asset.asset_type} {asset.operating_system or ''} {asset.department or ''}".lower()

        # Check if asset matches ICS/OT signatures
        is_ot = any(k in combined_text for k in OT_KEYWORDS) or asset.asset_type.lower() in ("iot", "medical device")

        if not is_ot:
            return

        is_crit_or_exp = _is_critical_or_exposed(asset)

        # 1. Unknown industrial device classification
        generic_types = {"iot", "device", "endpoint", "hardware", "other", "embedded"}
        if asset.asset_type.lower() in generic_types:
            self._add_gap(
                gap_title="Unknown Industrial Device Classification",
                category="ICS/OT Coverage",
                gap_type="unknown_industrial_device",
                severity="HIGH" if is_crit_or_exp else "MEDIUM",
                reason=(
                    f"Asset '{asset.asset_name}' operates in an operational technology or IoT domain but has a generic type '{asset.asset_type}'. "
                    "Operational technology devices (PLCs, RTUs, IEDs, HMIs) carry distinct physical safety hazards that require specific classification."
                ),
                recommendation="Reclassify the asset into its specific Purdue Model / OT tier (e.g. PLC Controller, SCADA HMI, Medical Infusion Pump).",
                differentiator="ot_device_type",
            )

        # 2. Missing operational technology details (firmware / hardware revision)
        has_firmware = False
        for sw in asset.software:
            if any(k in sw.software_type.lower() for k in ("firmware", "embedded", "os", "rtos")):
                has_firmware = True
                break

        if not has_firmware and not asset.operating_system:
            self._add_gap(
                gap_title="Missing Industrial Firmware & RTOS Telemetry",
                category="ICS/OT Coverage",
                gap_type="missing_ot_details",
                severity="HIGH" if is_crit_or_exp else "MEDIUM",
                reason=(
                    f"Industrial asset '{asset.asset_name}' lacks documented firmware revisions or real-time OS (RTOS) versioning. "
                    "ICS vulnerabilities are predominantly firmware-specific and cannot be monitored without exact firmware telemetry."
                ),
                recommendation="Retrieve the exact firmware release, hardware revision, and PLC logic version from the engineering workstation.",
                differentiator="ot_firmware",
            )

        # 3. Missing industrial communication protocol
        has_protocol = False
        for sw in asset.software:
            sw_full = f"{sw.software_name} {sw.software_type}".lower()
            if any(p in sw_full for p in OT_PROTOCOLS):
                has_protocol = True
                break

        if not has_protocol:
            self._add_gap(
                gap_title="Unmapped Industrial Communication Protocols",
                category="ICS/OT Coverage",
                gap_type="missing_ot_protocol",
                severity="MEDIUM" if is_crit_or_exp else "LOW",
                reason=(
                    f"Industrial asset '{asset.asset_name}' has no recorded fieldbus or OT communication protocols (e.g. Modbus TCP, DNP3, CIP). "
                    "Unencrypted legacy industrial protocols require strict micro-segmentation and DPI firewall validation."
                ),
                recommendation="Document operational field protocols and listening ports (e.g., Modbus Port 502, CIP Port 44818, DNP3 Port 20000).",
                differentiator="ot_protocol",
            )

    # ── Category D: Dependency Gaps ───────────────────────────────────────────

    def detect_dependency_gaps(self) -> None:
        asset = self.asset
        crit = (asset.criticality or "").strip().lower()
        is_crit = crit in ("critical", "high")
        is_crit_or_exp = _is_critical_or_exposed(asset)

        out_count = len(asset.outgoing_dependencies)
        in_count = len(asset.incoming_dependencies)
        total_deps = out_count + in_count

        # 1. Critical asset with zero recorded dependencies
        if is_crit and total_deps == 0:
            self._add_gap(
                gap_title="Unmapped Dependencies for Critical Asset",
                category="Dependency Gaps",
                gap_type="missing_critical_dependency",
                severity="HIGH",
                reason=(
                    f"Asset '{asset.asset_name}' is classified as '{asset.criticality}' but has zero recorded upstream or downstream dependencies. "
                    "While isolated enclaves exist, unmapped relationships prevent accurate blast-radius calculation and cascading risk analysis. "
                    "This relationship requires verification rather than assuming misconfiguration."
                ),
                recommendation=(
                    "Verify connected infrastructure: map downstream services that rely on this asset "
                    "and upstream components (databases, authenticators, gateways) that feed into it."
                ),
                differentiator="critical_deps",
            )

        # 2. Essential infrastructure role with isolated dependencies
        essential_roles = ("database", "router", "firewall", "gateway", "server")
        is_essential_role = any(r in asset.asset_type.lower() for r in essential_roles) or any(
            r in asset.asset_name.lower() for r in essential_roles
        )

        if is_essential_role and total_deps == 0 and not is_crit:
            self._add_gap(
                gap_title="Isolated Essential Service Infrastructure",
                category="Dependency Gaps",
                gap_type="isolated_service_dependency",
                severity="MEDIUM" if is_crit_or_exp else "LOW",
                reason=(
                    f"Asset '{asset.asset_name}' operates as an essential infrastructure role ({asset.asset_type}) "
                    "but has no documented connections in the dependency graph. "
                    "Inter-service dependencies need verification to model potential outage cascades."
                ),
                recommendation="Map consumer applications and dependent host nodes in the Asset Dependencies configuration.",
                differentiator="service_deps",
            )


# ── FLEET GAP ANALYSIS ORCHESTRATOR ──────────────────────────────────────────

def analyze_infrastructure_gaps(
    db: Session,
    asset_ids: list[int] | None = None,
) -> dict[str, Any]:
    """
    Runs complete infrastructure gap analysis across all assets or a specified subset.
    Guarantees idempotency:
      - Existing gaps retain their user-configured status ('In Review', 'Resolved', 'Accepted').
      - Fresh gaps are inserted with 'Open' status.
      - Updated timestamp is recorded.
    """
    query = db.query(Asset)
    if asset_ids:
        query = query.filter(Asset.id.in_(asset_ids))
    assets = query.all()

    total_detected = 0
    new_created = 0
    preserved = 0

    # Fetch all existing gaps in one pass indexed by fingerprint
    existing_gaps = {g.fingerprint: g for g in db.query(InfrastructureGap).all()}

    now = datetime.now(timezone.utc)

    for asset in assets:
        detector = GapDetector(asset, db)
        detected_items = detector.run_all()
        total_detected += len(detected_items)

        for item in detected_items:
            fp = item["fingerprint"]
            if fp in existing_gaps:
                # Update details and refresh updated_at, but preserve status!
                gap_record = existing_gaps[fp]
                gap_record.gap_title = item["gap_title"]
                gap_record.severity = item["severity"]
                gap_record.reason = item["reason"]
                gap_record.recommendation = item["recommendation"]
                gap_record.updated_at = now
                preserved += 1
            else:
                # Brand new gap
                gap_record = InfrastructureGap(
                    asset_id=item["asset_id"],
                    gap_title=item["gap_title"],
                    category=item["category"],
                    gap_type=item["gap_type"],
                    severity=item["severity"],
                    reason=item["reason"],
                    recommendation=item["recommendation"],
                    status="Open",
                    fingerprint=fp,
                    created_at=now,
                    updated_at=now,
                )
                db.add(gap_record)
                existing_gaps[fp] = gap_record
                new_created += 1

    db.commit()

    summary = get_gap_summary(db)

    return {
        "message": f"Gap analysis completed across {len(assets)} assets.",
        "assets_analyzed": len(assets),
        "total_gaps_detected": total_detected,
        "new_gaps_created": new_created,
        "existing_gaps_preserved": preserved,
        "summary": summary,
    }


def get_gap_summary(db: Session) -> dict[str, Any]:
    """Computes fleet gap metrics and distribution."""
    gaps = db.query(InfrastructureGap).all()
    total_assets = db.query(Asset).count()
    affected_asset_ids = {g.asset_id for g in gaps if g.status != "Resolved"}

    by_cat: dict[str, int] = {
        "Asset Information": 0,
        "Security Coverage": 0,
        "ICS/OT Coverage": 0,
        "Dependency Gaps": 0,
    }
    by_sev: dict[str, int] = {"HIGH": 0, "MEDIUM": 0, "LOW": 0}

    high = 0
    med = 0
    low = 0
    open_count = 0
    in_review = 0
    resolved = 0
    accepted = 0

    latest_date = None

    for g in gaps:
        if g.severity in by_sev:
            by_sev[g.severity] += 1
        if g.severity == "HIGH":
            high += 1
        elif g.severity == "MEDIUM":
            med += 1
        else:
            low += 1

        cat = g.category
        by_cat[cat] = by_cat.get(cat, 0) + 1

        st = g.status
        if st == "Open":
            open_count += 1
        elif st == "In Review":
            in_review += 1
        elif st == "Resolved":
            resolved += 1
        elif st == "Accepted":
            accepted += 1

        if latest_date is None or (g.updated_at and g.updated_at > latest_date):
            latest_date = g.updated_at

    unaffected = max(0, total_assets - len(affected_asset_ids))
    coverage_rate = round((unaffected / total_assets * 100), 1) if total_assets > 0 else 100.0

    return {
        "total_gaps": len(gaps),
        "high_severity": high,
        "medium_severity": med,
        "low_severity": low,
        "open_gaps": open_count,
        "in_review_gaps": in_review,
        "resolved_gaps": resolved,
        "accepted_gaps": accepted,
        "by_category": by_cat,
        "by_severity": by_sev,
        "affected_assets_count": len(affected_asset_ids),
        "total_assets": total_assets,
        "coverage_rate": coverage_rate,
        "last_analyzed_at": latest_date,
    }

