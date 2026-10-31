import logging
from datetime import datetime
import httpx
from sqlalchemy.orm import Session
from app.core.config import settings
from app.models.vulnerability import Vulnerability

logger = logging.getLogger(__name__)
NVD_URL = "https://services.nvd.nist.gov/rest/json/cves/2.0"


def _parse_date(value: str | None):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _pick_cvss(metrics: dict) -> tuple[str | None, float | None, str | None, float | None]:
    # Prefer v4, then v3.1, v3.0, then v2 when present.
    for key in ("cvssMetricV40", "cvssMetricV31", "cvssMetricV30", "cvssMetricV2"):
        entries = metrics.get(key) or []
        if entries:
            item = entries[0]
            data = item.get("cvssData", {})
            return (
                data.get("version"),
                data.get("baseScore"),
                data.get("baseSeverity") or item.get("baseSeverity"),
                data.get("exploitabilityScore", item.get("exploitabilityScore")),
            )
    return None, None, None, None


def _serialize_vulnerability(vuln: Vulnerability) -> dict:
    return {
        "id": vuln.id,
        "cve_id": vuln.cve_id,
        "description": vuln.description,
        "cvss_version": vuln.cvss_version,
        "cvss_score": vuln.cvss_score,
        "severity": vuln.severity,
        "published_date": vuln.published_date,
        "modified_date": vuln.modified_date,
        "reference_url": vuln.reference_url,
        "affected_products": vuln.affected_products,
    }


async def search_cves(keyword: str, limit: int = 20, db: Session | None = None) -> list[dict]:
    normalized_keyword = (keyword or "").strip()
    if not normalized_keyword:
        logger.warning("⚠️ [NVD CACHE] Empty keyword supplied; skipping lookup.")
        return []

    if db is not None:
        cached = (
            db.query(Vulnerability)
            .filter(
                Vulnerability.description.ilike(f"%{normalized_keyword}%")
                | Vulnerability.affected_products.ilike(f"%{normalized_keyword}%")
            )
            .order_by(Vulnerability.fetched_at.desc())
            .limit(limit)
            .all()
        )
        if cached:
            logger.info(
                "📦 [NVD CACHE HIT] Local database already contains %d result(s) for '%s'.",
                len(cached),
                normalized_keyword,
            )
            return [_serialize_vulnerability(item) for item in cached]
        logger.info(
            "📦 [NVD CACHE MISS] No local cache hit for '%s'; querying external source.",
            normalized_keyword,
        )

    headers = {}
    if settings.NVD_API_KEY:
        headers["apiKey"] = settings.NVD_API_KEY
    params = {"keywordSearch": normalized_keyword, "resultsPerPage": min(max(limit, 1), 100)}
    logger.info("🌐 [NVD API CALL] keyword='%s' limit=%s", normalized_keyword, params["resultsPerPage"])
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(NVD_URL, params=params, headers=headers)
            response.raise_for_status()
            payload = response.json()
    except httpx.HTTPStatusError as exc:
        logger.warning(
            "⚠️ [NVD API UNAVAILABLE] keyword='%s' failed with HTTP %s; keeping asset import alive and returning empty result set.",
            normalized_keyword,
            exc.response.status_code if exc.response is not None else "unknown",
        )
        return []
    except httpx.RequestError as exc:
        logger.warning(
            "⚠️ [NVD API CONNECTION ERROR] keyword='%s' failed to reach NVD service: %s",
            normalized_keyword,
            exc,
        )
        return []

    results = []
    for wrapper in payload.get("vulnerabilities", []):
        cve = wrapper.get("cve", {})
        descriptions = cve.get("descriptions", [])
        description = next((d.get("value") for d in descriptions if d.get("lang") == "en"), None)
        version, score, severity, exploitability = _pick_cvss(cve.get("metrics", {}))
        item = {
            "cve_id": cve.get("id"),
            "description": description,
            "cvss_version": version,
            "cvss_score": score,
            "severity": severity,
            "exploitability_score": exploitability,
            "published_date": _parse_date(cve.get("published")),
            "modified_date": _parse_date(cve.get("lastModified")),
            "reference_url": f"https://nvd.nist.gov/vuln/detail/{cve.get('id')}",
            "affected_products": ", ".join(
                sorted({match.get("product") for match in (cve.get("configurations") or []) if isinstance(match, dict) and match.get("product")})
            ) or None,
        }
        results.append(item)

    if db is not None:
        inserted = 0
        updated = 0
        for item in results:
            cve_id = item.get("cve_id")
            if not cve_id:
                continue
            existing = db.query(Vulnerability).filter(Vulnerability.cve_id == cve_id).first()
            if existing:
                existing.description = item.get("description") or existing.description
                existing.cvss_score = item.get("cvss_score") if item.get("cvss_score") is not None else existing.cvss_score
                existing.cvss_version = item.get("cvss_version") or existing.cvss_version
                existing.severity = item.get("severity") or existing.severity
                existing.published_date = item.get("published_date") or existing.published_date
                existing.modified_date = item.get("modified_date") or existing.modified_date
                existing.reference_url = item.get("reference_url") or existing.reference_url
                existing.affected_products = item.get("affected_products") or existing.affected_products
                updated += 1
            else:
                db.add(
                    Vulnerability(
                        cve_id=cve_id,
                        description=item.get("description") or "No description available",
                        cvss_score=item.get("cvss_score"),
                        cvss_version=item.get("cvss_version"),
                        severity=item.get("severity"),
                        published_date=item.get("published_date"),
                        modified_date=item.get("modified_date"),
                        reference_url=item.get("reference_url"),
                        affected_products=item.get("affected_products"),
                    )
                )
                inserted += 1
        db.commit()
        logger.info(
            "💾 [NVD CACHE WRITE] Stored %d new and updated %d existing CVE record(s) for '%s'.",
            inserted,
            updated,
            normalized_keyword,
        )

    return results
