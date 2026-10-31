"""
Software normalization for CPE/keyword matching.
Cleans and standardises vendor/product names so they match NVD CPE strings.
"""
from __future__ import annotations
import re

# ── Vendor aliases → canonical CPE vendor ────────────────────────────────────
VENDOR_ALIASES: dict[str, str] = {
    # Web / app servers
    "apache software foundation": "apache",
    "apache foundation": "apache",
    "the apache software foundation": "apache",
    "nginx inc": "nginx",
    "nginx, inc": "nginx",
    "nginx, inc.": "nginx",
    # Databases
    "postgresql global development group": "postgresql",
    "the postgresql global development group": "postgresql",
    "oracle corporation": "oracle",
    "oracle corp": "oracle",
    "mysql ab": "mysql",
    "percona": "percona",
    "mongodb inc": "mongodb",
    "mongodb, inc": "mongodb",
    "redis labs": "redis",
    "elastic nv": "elastic",
    "elastic n.v.": "elastic",
    # OS
    "canonical ltd": "canonical",
    "canonical ltd.": "canonical",
    "ubuntu": "canonical",
    "debian": "debian",
    "red hat": "redhat",
    "red hat, inc": "redhat",
    "redhat inc": "redhat",
    "centos": "centos",
    "microsoft": "microsoft",
    "microsoft corporation": "microsoft",
    # Network
    "cisco systems": "cisco",
    "cisco systems, inc": "cisco",
    "cisco systems inc": "cisco",
    # Security
    "openssl software foundation": "openssl",
    "openssl project": "openssl",
    # Languages / runtimes
    "python software foundation": "python",
    "php group": "php",
    "php: hypertext preprocessor": "php",
    "oracle java": "oracle",
    "openjdk": "oracle",
    # SSH / System
    "openbsd": "openbsd",
    "the openbsd project": "openbsd",
}

# ── Product aliases → canonical CPE product ───────────────────────────────────
PRODUCT_ALIASES: dict[str, str] = {
    # Web servers
    "apache web server": "http_server",
    "apache httpd": "http_server",
    "apache http server": "http_server",
    "httpd": "http_server",
    "iis": "internet_information_services",
    "internet information services": "internet_information_services",
    "nginx web server": "nginx",
    # Databases
    "postgres": "postgresql",
    "postgres database": "postgresql",
    "postgresql database": "postgresql",
    "mysql database": "mysql",
    "mariadb": "mariadb",
    "mongo": "mongodb",
    "mongodb server": "mongodb",
    "redis server": "redis",
    "elasticsearch server": "elasticsearch",
    # OS
    "ubuntu server": "ubuntu_linux",
    "ubuntu linux": "ubuntu_linux",
    "debian linux": "debian_linux",
    "rhel": "enterprise_linux",
    "red hat enterprise linux": "enterprise_linux",
    "centos linux": "centos",
    "windows server 2019": "windows_server_2019",
    "windows server 2016": "windows_server_2016",
    "windows server 2012": "windows_server_2012",
    "windows 10": "windows_10",
    "windows 11": "windows_11",
    "embedded linux": "linux_kernel",
    "linux": "linux_kernel",
    # Security
    "openssl library": "openssl",
    # Runtimes
    "python runtime": "python",
    "cpython": "python",
    "jdk": "jdk",
    "jre": "jre",
    "openjdk": "openjdk",
    "tomcat": "tomcat",
    "apache tomcat": "tomcat",
    # SSH / VPN
    "openssh server": "openssh",
    "ssh": "openssh",
    # Network
    "cisco ios": "ios",
    "cisco asa": "adaptive_security_appliance_software",
    "asa": "adaptive_security_appliance_software",
    "openwrt": "openwrt",
}

# ── Version cleaners ──────────────────────────────────────────────────────────

_VERSION_RE = re.compile(r"(\d+[\.\d]*)")


def clean_version(version: str | None) -> str:
    """Extract the leading numeric version string, e.g. '1.24.0 (Ubuntu)' → '1.24.0'."""
    if not version:
        return "*"
    m = _VERSION_RE.search(version.strip())
    return m.group(1) if m else "*"


def normalize_name(name: str | None) -> str:
    """Lower-case, strip punctuation noise, collapse spaces."""
    if not name:
        return ""
    s = name.lower().strip()
    s = re.sub(r"[®™©,.]", "", s)
    s = re.sub(r"\s+", " ", s)
    return s


def canonical_vendor(vendor: str | None) -> str:
    n = normalize_name(vendor)
    return VENDOR_ALIASES.get(n, n)


def canonical_product(product: str | None) -> str:
    n = normalize_name(product)
    return PRODUCT_ALIASES.get(n, n.replace(" ", "_"))


def build_search_keywords(software_name: str, vendor: str | None) -> list[str]:
    """
    Return a list of search keywords to use for NVD keywordSearch.
    Tries the most specific first, falls back to generic terms.
    """
    keywords: list[str] = []

    prod = canonical_product(software_name)
    vend = canonical_vendor(vendor)

    # Most specific: canonical vendor + product
    if vend and prod and vend != prod:
        keywords.append(f"{vend} {prod}".replace("_", " "))

    # Product alone
    if prod:
        keywords.append(prod.replace("_", " "))

    # Original name
    orig = normalize_name(software_name)
    if orig and orig not in keywords:
        keywords.append(orig)

    return keywords[:3]  # at most 3 queries per software


def software_matches_cpe(
    software_name: str,
    vendor: str | None,
    version: str | None,
    cpe_string: str,
) -> bool:
    """
    True if the installed software plausibly matches a CPE string.
    Format: cpe:2.3:a:<vendor>:<product>:<version>:...
    Uses keyword matching — not full CPE range evaluation.
    """
    parts = cpe_string.lower().split(":")
    if len(parts) < 6:
        return False

    cpe_vendor = parts[3].replace("_", " ")
    cpe_product = parts[4].replace("_", " ")
    cpe_version = parts[5]

    prod_norm = canonical_product(software_name).replace("_", " ")
    vend_norm = canonical_vendor(vendor).replace("_", " ")

    # Product must match
    product_match = (
        prod_norm == cpe_product
        or prod_norm in cpe_product
        or cpe_product in prod_norm
        or normalize_name(software_name) in cpe_product
    )
    if not product_match:
        return False

    # Vendor should match (lenient)
    if vend_norm and cpe_vendor not in ("*", "-"):
        vendor_match = vend_norm in cpe_vendor or cpe_vendor in vend_norm
        if not vendor_match:
            return False

    # Version: if CVE specifies a version, it must match (or be wildcard)
    if version and cpe_version not in ("*", "-"):
        installed_ver = clean_version(version)
        if installed_ver != "*" and installed_ver != cpe_version:
            # Allow partial: '1.24' matches '1.24.0'
            if not (cpe_version.startswith(installed_ver) or installed_ver.startswith(cpe_version)):
                return False

    return True


def software_matches_products(
    software_name: str,
    vendor: str | None,
    affected_products: str | None,
) -> bool:
    """
    Lightweight keyword match against the 'vendor:product' CSV stored in Vulnerability.
    Used as a fast pre-filter before CPE matching.
    """
    if not affected_products:
        return False

    prod_norm = canonical_product(software_name).replace("_", " ")
    vend_norm = canonical_vendor(vendor) if vendor else ""
    name_norm = normalize_name(software_name)

    for pair in affected_products.split(","):
        pair = pair.strip()
        if not pair:
            continue
        pair_vend, _, pair_prod = pair.partition(":")

        # Check product
        if (
            prod_norm == pair_prod
            or prod_norm in pair_prod
            or pair_prod in prod_norm
            or name_norm in pair_prod
            or pair_prod in name_norm
        ):
            return True

    return False

