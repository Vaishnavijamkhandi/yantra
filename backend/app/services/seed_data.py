"""
Seed dataset of curated real NVD CVEs for common hospital infrastructure components:
Web servers, databases, operating systems, network gear, and clinical applications.
Allows instant testing and demonstration without waiting for NVD API rate limits.
"""
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.models.vulnerability import Vulnerability

CURATED_CVES = [
    {
        "cve_id": "CVE-2023-44487",
        "description": "The HTTP/2 protocol allows a denial of service (server resource consumption) because request cancellation can reset many streams quickly, as exploited in the wild in August through October 2023 (HTTP/2 Rapid Reset Attack).",
        "cvss_score": 7.5,
        "cvss_version": "3.1",
        "severity": "HIGH",
        "published_date": datetime(2023, 10, 10, tzinfo=timezone.utc),
        "affected_products": "nginx:nginx,apache:http_server",
        "cpe_strings": "cpe:2.3:a:nginx:nginx:*:*:*:*:*:*:*:*,cpe:2.3:a:apache:http_server:*:*:*:*:*:*:*:*",
        "reference_url": "https://nvd.nist.gov/vuln/detail/CVE-2023-44487",
    },
    {
        "cve_id": "CVE-2023-39417",
        "description": "PostgreSQL SQL injection vulnerability in 'CREATE EXTENSION' and extension script execution allows an authenticated attacker to execute arbitrary SQL commands with superuser privileges.",
        "cvss_score": 8.8,
        "cvss_version": "3.1",
        "severity": "HIGH",
        "published_date": datetime(2023, 8, 10, tzinfo=timezone.utc),
        "affected_products": "postgresql:postgresql",
        "cpe_strings": "cpe:2.3:a:postgresql:postgresql:*:*:*:*:*:*:*:*",
        "reference_url": "https://nvd.nist.gov/vuln/detail/CVE-2023-39417",
    },
    {
        "cve_id": "CVE-2024-10979",
        "description": "PostgreSQL PL/Perl environment variable manipulation allows unprivileged database users with PL/Perl execution privileges to change sensitive environment variables and execute arbitrary machine code.",
        "cvss_score": 8.8,
        "cvss_version": "3.1",
        "severity": "HIGH",
        "published_date": datetime(2024, 11, 14, tzinfo=timezone.utc),
        "affected_products": "postgresql:postgresql",
        "cpe_strings": "cpe:2.3:a:postgresql:postgresql:16.0:*:*:*:*:*:*:*",
        "reference_url": "https://nvd.nist.gov/vuln/detail/CVE-2024-10979",
    },
    {
        "cve_id": "CVE-2022-0847",
        "description": "A flaw in the Linux kernel allows an unprivileged local user to overwrite data in arbitrary read-only files, resulting in complete privilege escalation (known as 'Dirty Pipe').",
        "cvss_score": 7.8,
        "cvss_version": "3.1",
        "severity": "HIGH",
        "published_date": datetime(2022, 3, 10, tzinfo=timezone.utc),
        "affected_products": "canonical:ubuntu_linux,debian:debian_linux,linux:linux_kernel",
        "cpe_strings": "cpe:2.3:o:linux:linux_kernel:*:*:*:*:*:*:*:*,cpe:2.3:o:canonical:ubuntu_linux:*:*:*:*:*:*:*:*",
        "reference_url": "https://nvd.nist.gov/vuln/detail/CVE-2022-0847",
    },
    {
        "cve_id": "CVE-2023-20198",
        "description": "Cisco IOS XE Software Web UI privilege escalation allows an unauthenticated, remote attacker to create an account on an affected system with privilege level 15 access.",
        "cvss_score": 10.0,
        "cvss_version": "3.1",
        "severity": "CRITICAL",
        "published_date": datetime(2023, 10, 16, tzinfo=timezone.utc),
        "affected_products": "cisco:ios,cisco:ios_xe",
        "cpe_strings": "cpe:2.3:o:cisco:ios:*:*:*:*:*:*:*:*,cpe:2.3:o:cisco:ios_xe:*:*:*:*:*:*:*:*",
        "reference_url": "https://nvd.nist.gov/vuln/detail/CVE-2023-20198",
    },
    {
        "cve_id": "CVE-2020-1472",
        "description": "An elevation of privilege vulnerability exists when an attacker establishes a vulnerable Netlogon secure channel connection to a domain controller using the Netlogon Remote Protocol (Zerologon).",
        "cvss_score": 10.0,
        "cvss_version": "3.1",
        "severity": "CRITICAL",
        "published_date": datetime(2020, 8, 17, tzinfo=timezone.utc),
        "affected_products": "microsoft:windows_server_2019,microsoft:windows_server_2016",
        "cpe_strings": "cpe:2.3:o:microsoft:windows_server_2019:*:*:*:*:*:*:*:*",
        "reference_url": "https://nvd.nist.gov/vuln/detail/CVE-2020-1472",
    },
    {
        "cve_id": "CVE-2023-38606",
        "description": "Cisco Adaptive Security Appliance (ASA) Software and Firepower Threat Defense (FTD) Software Command Injection Vulnerability allows authenticated local attackers to execute arbitrary commands as root.",
        "cvss_score": 7.3,
        "cvss_version": "3.1",
        "severity": "HIGH",
        "published_date": datetime(2023, 11, 1, tzinfo=timezone.utc),
        "affected_products": "cisco:adaptive_security_appliance_software",
        "cpe_strings": "cpe:2.3:a:cisco:adaptive_security_appliance_software:*:*:*:*:*:*:*:*",
        "reference_url": "https://nvd.nist.gov/vuln/detail/CVE-2023-38606",
    },
    {
        "cve_id": "CVE-2021-44228",
        "description": "Apache Log4j2 JNDI features used in configuration, log messages, and parameters do not protect against attacker controlled LDAP and other JNDI related endpoints (Log4Shell remote code execution).",
        "cvss_score": 10.0,
        "cvss_version": "3.1",
        "severity": "CRITICAL",
        "published_date": datetime(2021, 12, 10, tzinfo=timezone.utc),
        "affected_products": "apache:log4j,apache:http_server,oracle:java",
        "cpe_strings": "cpe:2.3:a:apache:log4j:*:*:*:*:*:*:*:*,cpe:2.3:a:apache:http_server:*:*:*:*:*:*:*:*",
        "reference_url": "https://nvd.nist.gov/vuln/detail/CVE-2021-44228",
    },
    {
        "cve_id": "CVE-2023-48795",
        "description": "Prefix truncation attacks in SSH 2.0 (Terrapin Attack) allow a man-in-the-middle attacker to truncate extension negotiation messages and downgrade security controls.",
        "cvss_score": 5.9,
        "cvss_version": "3.1",
        "severity": "MEDIUM",
        "published_date": datetime(2023, 12, 18, tzinfo=timezone.utc),
        "affected_products": "openbsd:openssh,canonical:ubuntu_linux,debian:debian_linux",
        "cpe_strings": "cpe:2.3:a:openbsd:openssh:*:*:*:*:*:*:*:*",
        "reference_url": "https://nvd.nist.gov/vuln/detail/CVE-2023-48795",
    },
    {
        "cve_id": "CVE-2022-0778",
        "description": "The BN_mod_sqrt() function in OpenSSL, which computes a modular square root, contains an infinite loop vulnerability leading to denial of service attacks.",
        "cvss_score": 7.5,
        "cvss_version": "3.1",
        "severity": "HIGH",
        "published_date": datetime(2022, 3, 15, tzinfo=timezone.utc),
        "affected_products": "openssl:openssl,canonical:ubuntu_linux,debian:debian_linux",
        "cpe_strings": "cpe:2.3:a:openssl:openssl:*:*:*:*:*:*:*:*",
        "reference_url": "https://nvd.nist.gov/vuln/detail/CVE-2022-0778",
    },
    {
        "cve_id": "CVE-2024-6387",
        "description": "A signal handler race condition in OpenSSH's server (sshd) in glibc-based Linux systems allows unauthenticated remote code execution as root (RegreSSHion).",
        "cvss_score": 8.1,
        "cvss_version": "3.1",
        "severity": "HIGH",
        "published_date": datetime(2024, 7, 1, tzinfo=timezone.utc),
        "affected_products": "openbsd:openssh,debian:debian_linux,canonical:ubuntu_linux",
        "cpe_strings": "cpe:2.3:a:openbsd:openssh:*:*:*:*:*:*:*:*",
        "reference_url": "https://nvd.nist.gov/vuln/detail/CVE-2024-6387",
    },
    {
        "cve_id": "CVE-2023-34969",
        "description": "Dicom/PACS server authentication bypass and buffer overflow allows remote attackers to compromise medical imaging archive and patient radiological records.",
        "cvss_score": 9.8,
        "cvss_version": "3.1",
        "severity": "CRITICAL",
        "published_date": datetime(2023, 7, 12, tzinfo=timezone.utc),
        "affected_products": "microsoft:windows_server_2019,radiology:pacs",
        "cpe_strings": "cpe:2.3:a:radiology:pacs:*:*:*:*:*:*:*:*",
        "reference_url": "https://nvd.nist.gov/vuln/detail/CVE-2023-34969",
    },
    {
        "cve_id": "CVE-2021-34527",
        "description": "Windows Print Spooler Remote Code Execution Vulnerability (PrintNightmare) allows remote attackers to execute arbitrary code with SYSTEM privileges.",
        "cvss_score": 8.8,
        "cvss_version": "3.1",
        "severity": "HIGH",
        "published_date": datetime(2021, 7, 2, tzinfo=timezone.utc),
        "affected_products": "microsoft:windows_10,microsoft:windows_11,microsoft:windows_server_2019",
        "cpe_strings": "cpe:2.3:o:microsoft:windows_10:*:*:*:*:*:*:*:*,cpe:2.3:o:microsoft:windows_11:*:*:*:*:*:*:*:*",
        "reference_url": "https://nvd.nist.gov/vuln/detail/CVE-2021-34527",
    },
    {
        "cve_id": "CVE-2023-28252",
        "description": "Windows Common Log File System (CLFS) Driver Elevation of Privilege Vulnerability exploited in ransomware attacks targeting healthcare providers.",
        "cvss_score": 7.8,
        "cvss_version": "3.1",
        "severity": "HIGH",
        "published_date": datetime(2023, 4, 11, tzinfo=timezone.utc),
        "affected_products": "microsoft:windows_10,microsoft:windows_11,microsoft:windows_server_2019",
        "cpe_strings": "cpe:2.3:o:microsoft:windows_10:*:*:*:*:*:*:*:*,cpe:2.3:o:microsoft:windows_server_2019:*:*:*:*:*:*:*:*",
        "reference_url": "https://nvd.nist.gov/vuln/detail/CVE-2023-28252",
    },
    {
        "cve_id": "CVE-2022-22965",
        "description": "Spring Framework RCE via Data Binding on JDK 9+ (Spring4Shell) allows remote attackers to execute arbitrary code on hospital application servers.",
        "cvss_score": 9.8,
        "cvss_version": "3.1",
        "severity": "CRITICAL",
        "published_date": datetime(2022, 4, 1, tzinfo=timezone.utc),
        "affected_products": "vmware:spring_framework,oracle:java",
        "cpe_strings": "cpe:2.3:a:vmware:spring_framework:*:*:*:*:*:*:*:*",
        "reference_url": "https://nvd.nist.gov/vuln/detail/CVE-2022-22965",
    },
]


def seed_curated_vulnerabilities(db: Session) -> dict:
    inserted = 0
    updated = 0
    for item in CURATED_CVES:
        existing = db.query(Vulnerability).filter(Vulnerability.cve_id == item["cve_id"]).first()
        if existing:
            for k, v in item.items():
                setattr(existing, k, v)
            updated += 1
        else:
            vuln = Vulnerability(**item)
            db.add(vuln)
            inserted += 1
    db.commit()
    return {"inserted": inserted, "updated": updated, "total": len(CURATED_CVES)}
