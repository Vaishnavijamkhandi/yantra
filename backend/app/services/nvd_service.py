from datetime import datetime
import httpx
from app.core.config import settings

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


async def search_cves(keyword: str, limit: int = 20) -> list[dict]:
    headers = {}
    if settings.nvd_api_key:
        headers["apiKey"] = settings.nvd_api_key
    params = {"keywordSearch": keyword, "resultsPerPage": min(max(limit, 1), 100)}
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(NVD_URL, params=params, headers=headers)
        response.raise_for_status()
        payload = response.json()

    results = []
    for wrapper in payload.get("vulnerabilities", []):
        cve = wrapper.get("cve", {})
        descriptions = cve.get("descriptions", [])
        description = next((d.get("value") for d in descriptions if d.get("lang") == "en"), None)
        version, score, severity, exploitability = _pick_cvss(cve.get("metrics", {}))
        results.append({
            "cve_id": cve.get("id"),
            "description": description,
            "cvss_version": version,
            "cvss_score": score,
            "severity": severity,
            "exploitability_score": exploitability,
            "published_at": _parse_date(cve.get("published")),
            "last_modified_at": _parse_date(cve.get("lastModified")),
            "source_url": f"https://nvd.nist.gov/vuln/detail/{cve.get('id')}",
            "raw_data": cve,
        })
    return results
