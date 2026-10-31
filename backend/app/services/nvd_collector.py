"""
NVD API v2.0 collector.
Fetches CVE records from https://services.nvd.nist.gov/rest/json/cves/2.0
and stores them in the vulnerabilities table.
"""
from __future__ import annotations

import asyncio
import logging
import re
from datetime import datetime, timezone
from typing import Any

import httpx
from sqlalchemy.orm import Session

from app.models.vulnerability import Vulnerability
from app.core.config import settings

logger = logging.getLogger(__name__)

NVD_BASE = "https://services.nvd.nist.gov/rest/json/cves/2.0"
# NVD rate limit: 5 req/30 s without API key, 50 req/30s with key
REQUEST_DELAY = 1.0 if settings.NVD_API_KEY else 7.0
PAGE_SIZE = 100


# ── CVSS helpers ──────────────────────────────────────────────────────────────

def _extract_cvss(cve_item: dict) -> tuple[float | None, str | None, str | None]:
    """Return (score, version_string, severity) from NVD metrics block."""
    metrics = cve_item.get("metrics", {})

    for key, ver in [("cvssMetricV31", "3.1"), ("cvssMetricV30", "3.0"), ("cvssMetricV2", "2.0")]:
        entries = metrics.get(key, [])
        if entries:
            data = entries[0].get("cvssData", {})
            score = data.get("baseScore")
            sev = entries[0].get("baseSeverity") or data.get("baseSeverity")
            # Derive severity from score if not present
            if score and not sev:
                sev = _score_to_severity(float(score))
            return score, ver, sev

    return None, None, None


def _score_to_severity(score: float) -> str:
    if score >= 9.0:
        return "CRITICAL"
    if score >= 7.0:
        return "HIGH"
    if score >= 4.0:
        return "MEDIUM"
    return "LOW"


# ── CPE helpers ───────────────────────────────────────────────────────────────

def _extract_cpes(cve_item: dict) -> tuple[str, str]:
    """
    Return (cpe_strings_csv, affected_products_csv).
    cpe_strings: raw cpe:2.3:... strings (for future precise matching)
    affected_products: 'vendor:product' pairs for keyword matching
    """
    cpe_list: list[str] = []
    products: set[str] = set()

    configs = cve_item.get("configurations", [])
    for cfg in configs:
        for node in cfg.get("nodes", []):
            for cpe_match in node.get("cpeMatch", []):
                cpe = cpe_match.get("criteria", "")
                if cpe:
                    cpe_list.append(cpe)
                    # cpe:2.3:a:vendor:product:version:...
                    parts = cpe.split(":")
                    if len(parts) >= 5:
                        vendor = parts[3].replace("_", " ").lower()
                        product = parts[4].replace("_", " ").lower()
                        if vendor not in ("*", "-") and product not in ("*", "-"):
                            products.add(f"{vendor}:{product}")

    return ",".join(cpe_list[:80]), ",".join(products)  # cap length


# ── Single-page fetcher ───────────────────────────────────────────────────────

async def _fetch_page(
    client: httpx.AsyncClient,
    keyword: str,
    start: int,
) -> dict[str, Any]:
    params = {
        "keywordSearch": keyword,
        "resultsPerPage": PAGE_SIZE,
        "startIndex": start,
    }
    for attempt in range(3):
        try:
            logger.info("🌐 [NVD API CALL] Querying NVD for '%s' (startIndex=%d, limit=%d, attempt %d/3)...", keyword, start, PAGE_SIZE, attempt + 1)
            resp = await client.get(NVD_BASE, params=params, timeout=30)
            if resp.status_code == 200:
                data = resp.json()
                total = data.get("totalResults", 0)
                vulns = data.get("vulnerabilities", [])
                logger.info("✅ [NVD API SUCCESS] Received %d CVEs (Total available: %d) for keyword '%s'", len(vulns), total, keyword)
                return data
            if resp.status_code == 429:
                logger.warning("⚠️ [NVD API RATE LIMIT] 429 Too Many Requests received from NVD. Sleeping 30s...")
                await asyncio.sleep(30)
            else:
                logger.warning("⚠️ [NVD API WARNING] NVD returned HTTP %d: %s", resp.status_code, resp.text[:200])
        except httpx.RequestError as exc:
            logger.warning("❌ [NVD API ERROR] Request error (attempt %d): %s", attempt + 1, exc)
            await asyncio.sleep(10)
    return {}


# ── Upsert one CVE ────────────────────────────────────────────────────────────

def _upsert_cve(db: Session, raw: dict) -> str:
    cve_id = raw.get("id", "")
    if not cve_id:
        return "skip"

    descs = raw.get("descriptions", [])
    description = next(
        (d["value"] for d in descs if d.get("lang") == "en"), "No description"
    )

    score, cvss_ver, severity = _extract_cvss(raw)
    cpe_strings, affected_products = _extract_cpes(raw)

    pub_str = raw.get("published", "")
    mod_str = raw.get("lastModified", "")
    published = _parse_dt(pub_str)
    modified = _parse_dt(mod_str)

    refs = raw.get("references", [])
    ref_url = refs[0].get("url", "") if refs else ""

    existing = db.query(Vulnerability).filter(Vulnerability.cve_id == cve_id).first()
    if existing:
        existing.description = description
        existing.cvss_score = score
        existing.cvss_version = cvss_ver
        existing.severity = severity
        existing.published_date = published
        existing.modified_date = modified
        existing.affected_products = affected_products
        existing.cpe_strings = cpe_strings
        existing.reference_url = ref_url[:500] if ref_url else None
        existing.fetched_at = datetime.now(timezone.utc)
        return "updated"
    else:
        vuln = Vulnerability(
            cve_id=cve_id,
            description=description,
            cvss_score=score,
            cvss_version=cvss_ver,
            severity=severity,
            published_date=published,
            modified_date=modified,
            affected_products=affected_products,
            cpe_strings=cpe_strings,
            reference_url=ref_url[:500] if ref_url else None,
        )
        db.add(vuln)
        return "inserted"


def _parse_dt(s: str) -> datetime | None:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None


# ── Public: sync a keyword ────────────────────────────────────────────────────

async def sync_keyword(keyword: str, db: Session, max_results: int = 500) -> dict:
    """Fetch CVEs matching `keyword` from NVD and upsert into DB."""
    inserted = updated = skipped = 0

    headers = {"User-Agent": "CyberSentra-Hospital-Asset-Manager/1.0"}
    if settings.NVD_API_KEY:
        headers["apiKey"] = settings.NVD_API_KEY
        logger.info("🔑 [NVD API] Authenticating with NVD API key: %s...", settings.NVD_API_KEY[:8])
    else:
        logger.warning("⚠️ [NVD API] No NVD_API_KEY set — rate limited to 5 requests / 30s")

    async with httpx.AsyncClient(headers=headers) as client:
        start = 0
        while start < max_results:
            data = await _fetch_page(client, keyword, start)
            if not data:
                break

            vulnerabilities = data.get("vulnerabilities", [])
            if not vulnerabilities:
                break

            for item in vulnerabilities:
                raw = item.get("cve", {})
                result = _upsert_cve(db, raw)
                if result == "inserted":
                    inserted += 1
                elif result == "updated":
                    updated += 1
                else:
                    skipped += 1

            db.commit()

            total = data.get("totalResults", 0)
            start += len(vulnerabilities)
            if start >= min(total, max_results):
                break

            await asyncio.sleep(REQUEST_DELAY)

    logger.info("📊 [NVD SYNC FINISHED] '%s': +%d inserted, ~%d updated, %d skipped", keyword, inserted, updated, skipped)
    return {"inserted": inserted, "updated": updated, "skipped": skipped, "keyword": keyword}


# ── Bulk sync for all hospital software keywords ──────────────────────────────

HOSPITAL_KEYWORDS = [
    "nginx", "postgresql", "mysql", "apache", "openssl",
    "ubuntu", "debian", "linux kernel", "windows server",
    "cisco ios", "cisco asa",
    "php", "python", "java", "tomcat",
    "mongodb", "redis", "elasticsearch",
    "vsftpd", "openssh", "samba",
]


async def sync_bulk(keywords: list[str], db: Session, max_per_keyword: int = 200) -> dict:
    total = {"inserted": 0, "updated": 0, "skipped": 0, "keywords_synced": 0}
    for kw in keywords:
        result = await sync_keyword(kw, db, max_results=max_per_keyword)
        total["inserted"] += result["inserted"]
        total["updated"] += result["updated"]
        total["skipped"] += result["skipped"]
        total["keywords_synced"] += 1
        await asyncio.sleep(REQUEST_DELAY)
    return total
