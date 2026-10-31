"""
Vulnerability matching engine.
Compares each asset's installed software (and OS) against stored CVE records
and writes results to asset_vulnerabilities.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.asset import Asset, AssetSoftware
from app.models.vulnerability import Vulnerability, AssetVulnerability
from app.services.normalizer import (
    software_matches_products,
    software_matches_cpe,
    normalize_name,
    canonical_product,
    canonical_vendor,
)

logger = logging.getLogger(__name__)


def _match_software_to_vulns(
    software_name: str,
    vendor: str | None,
    version: str | None,
    db: Session,
) -> list[tuple[Vulnerability, str]]:
    """
    Return list of (Vulnerability, match_method) that apply to the given software.
    Two-pass: keyword pre-filter → CPE confirmation.
    """
    results: list[tuple[Vulnerability, str]] = []
    prod_norm = canonical_product(software_name)
    vend_norm = canonical_vendor(vendor) if vendor else ""
    name_norm = normalize_name(software_name)

    # Build search terms for SQL ILIKE
    search_terms = set()
    if prod_norm:
        search_terms.add(prod_norm.replace("_", " "))
    if vend_norm:
        search_terms.add(vend_norm)
    search_terms.add(name_norm)
    search_terms.discard("")

    if not search_terms:
        return []

    # Pull candidate CVEs where affected_products or description contains any search term
    candidates: list[Vulnerability] = []
    seen_ids: set[int] = set()
    for term in search_terms:
        if len(term) < 3:
            continue
        rows = (
            db.query(Vulnerability)
            .filter(
                Vulnerability.affected_products.ilike(f"%{term}%")
                | Vulnerability.description.ilike(f"%{term}%")
            )
            .limit(200)
            .all()
        )
        for row in rows:
            if row.id not in seen_ids:
                candidates.append(row)
                seen_ids.add(row.id)

    for vuln in candidates:
        method = None

        # Pass 1 — fast keyword match on stored affected_products field
        if software_matches_products(software_name, vendor, vuln.affected_products):
            method = "keyword"

        # Pass 2 — CPE-level match (more precise)
        if vuln.cpe_strings:
            for cpe in vuln.cpe_strings.split(","):
                cpe = cpe.strip()
                if software_matches_cpe(software_name, vendor, version, cpe):
                    method = "cpe"
                    break

        if method:
            results.append((vuln, method))

    return results


def run_assessment(db: Session, asset_ids: list[int] | None = None) -> dict:
    """
    Run vulnerability matching for all assets (or a subset).
    Upserts results into asset_vulnerabilities.
    Returns a summary dict.
    """
    query = db.query(Asset)
    if asset_ids:
        query = query.filter(Asset.id.in_(asset_ids))
    assets = query.all()

    total_matches = 0
    assets_with_vulns = 0
    assessed_count = 0

    for asset in assets:
        asset_matches = 0

        # Collect software items + OS as a virtual software entry
        software_items: list[tuple[str, str | None, str | None]] = []
        for sw in asset.software:
            software_items.append((sw.software_name, sw.vendor, sw.version))

        # Also treat the OS as a software item
        if asset.operating_system:
            software_items.append((asset.operating_system, None, None))

        for sw_name, sw_vendor, sw_version in software_items:
            matches = _match_software_to_vulns(sw_name, sw_vendor, sw_version, db)
            for vuln, method in matches:
                # Upsert into asset_vulnerabilities
                existing = (
                    db.query(AssetVulnerability)
                    .filter(
                        AssetVulnerability.asset_id == asset.id,
                        AssetVulnerability.vulnerability_id == vuln.id,
                    )
                    .first()
                )
                if not existing:
                    link = AssetVulnerability(
                        asset_id=asset.id,
                        vulnerability_id=vuln.id,
                        matched_software=sw_name[:200],
                        matched_version=sw_version[:100] if sw_version else None,
                        match_method=method,
                        assessed_at=datetime.now(timezone.utc),
                    )
                    db.add(link)
                    asset_matches += 1
                else:
                    # Update method if CPE (more precise)
                    if method == "cpe" and existing.match_method != "cpe":
                        existing.match_method = method
                        existing.assessed_at = datetime.now(timezone.utc)

        db.commit()
        assessed_count += 1
        if asset_matches > 0:
            assets_with_vulns += 1
        total_matches += asset_matches

        logger.info(
            "Asset #%d '%s': %d vulnerability match(es)", asset.id, asset.asset_name, asset_matches
        )

    return {
        "assets_assessed": assessed_count,
        "assets_with_vulnerabilities": assets_with_vulns,
        "total_matches": total_matches,
    }

