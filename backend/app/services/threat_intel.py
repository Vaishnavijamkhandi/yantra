"""
Real-time Threat Intelligence, Remediation, & Multi-Sector Impact Engine.
Fetches live exploit data from CISA KEV and FIRST.org EPSS,
and produces the 3-part profile:
  1. Remedy (Technical fix + CISA mandate + CLI commands)
  2. What If Not Cured (Exploit threat vector + live attacker telemetry)
  3. Consequences (Dynamic operational, legal, and financial impact for any industry)
"""
from __future__ import annotations

import logging
from typing import Any
import httpx

logger = logging.getLogger(__name__)

CISA_KEV_URL = "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json"
FIRST_EPSS_URL = "https://api.first.org/data/v1/epss"

# In-memory caches to ensure fast responses
_CISA_KEV_DICT: dict[str, dict[str, str]] | None = None


async def get_cisa_kev_details(cve_id: str) -> dict[str, Any] | None:
    """Fetch official CISA KEV metadata including requiredAction and dueDate."""
    global _CISA_KEV_DICT
    if _CISA_KEV_DICT is None:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(CISA_KEV_URL)
                if resp.status_code == 200:
                    data = resp.json()
                    vulns = data.get("vulnerabilities", [])
                    _CISA_KEV_DICT = {
                        v["cveID"]: {
                            "required_action": v.get("requiredAction", "Apply vendor update."),
                            "due_date": v.get("dueDate", "Immediate"),
                            "vulnerability_name": v.get("vulnerabilityName", ""),
                            "notes": v.get("notes", ""),
                        }
                        for v in vulns
                        if "cveID" in v
                    }
        except Exception as exc:
            logger.warning("Failed to fetch live CISA KEV feed: %s", exc)
            _CISA_KEV_DICT = {}

    return _CISA_KEV_DICT.get(cve_id) if _CISA_KEV_DICT else None


async def get_live_epss(cve_id: str) -> dict[str, Any]:
    """Query live exploit probability and percentile from FIRST.org API."""
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(FIRST_EPSS_URL, params={"cve": cve_id})
            if resp.status_code == 200:
                data = resp.json()
                results = data.get("data", [])
                if results:
                    epss_val = float(results[0].get("epss", 0.0))
                    percentile_val = float(results[0].get("percentile", 0.0))
                    return {
                        "epss_score": round(epss_val * 100, 2),  # as percentage
                        "percentile": round(percentile_val * 100, 1),
                        "date": results[0].get("date"),
                        "live": True,
                    }
    except Exception as exc:
        logger.warning("Failed to query FIRST.org EPSS API for %s: %s", cve_id, exc)
    return {"epss_score": 0.0, "percentile": 0.0, "date": None, "live": False}


def generate_remedy(
    cve_id: str,
    software_name: str | None,
    operating_system: str | None,
    cisa_action: str | None,
) -> dict[str, Any]:
    """1. The Cure: Patch, CLI command, workaround, and firewall containment."""
    sw = (software_name or "").lower()
    os_name = (operating_system or "").lower()

    if "nginx" in sw or "cve-2023-44487" in cve_id.lower():
        return {
            "title": "Upgrade Nginx & Disable Vulnerable HTTP/2 Rapid Stream Cancellations",
            "cisa_mandate": cisa_action or "Apply vendor mitigations per CISA Alert AA23-289A or update to latest release.",
            "patch_command": "sudo apt-get update && sudo apt-get --only-upgrade install nginx -y",
            "workaround": "Disable HTTP/2: Replace 'listen 443 ssl http2;' with 'listen 443 ssl;' in /etc/nginx/nginx.conf and reload with 'sudo nginx -s reload'.",
            "firewall_rule": "iptables -A INPUT -p tcp --dport 443 -m limit --limit 100/minute -j ACCEPT",
            "verification_step": "Run 'nginx -v' to verify version >= 1.25.3 or inspect HTTP/2 headers using curl.",
        }
    elif "postgres" in sw or "cve-2023-39417" in cve_id.lower() or "cve-2024-10979" in cve_id.lower():
        return {
            "title": "Patch PostgreSQL Superuser Privilege Escalation & SQL Injection",
            "cisa_mandate": cisa_action or "Apply PostgreSQL security update to mitigate extension injection vulnerabilities.",
            "patch_command": "sudo apt-get update && sudo apt-get --only-upgrade install postgresql-16 -y",
            "workaround": "Revoke extension installation permissions: REVOKE CREATE ON SCHEMA public FROM PUBLIC;",
            "firewall_rule": "iptables -A INPUT -p tcp --dport 5432 ! -s 192.168.1.0/24 -j DROP",
            "verification_step": "Execute 'SELECT version();' in psql to confirm patch level >= 16.1.",
        }
    elif "dirty pipe" in cve_id.lower() or "cve-2022-0847" in cve_id.lower() or "linux" in os_name:
        return {
            "title": "Update Linux Kernel to Neutralize Dirty Pipe Privilege Escalation",
            "cisa_mandate": cisa_action or "Apply vendor Linux kernel security patches immediately.",
            "patch_command": "sudo apt-get update && sudo apt-get install --install-recommends linux-generic -y && sudo reboot",
            "workaround": "Restrict local unprivileged user account logins and enable auditd monitoring on /etc/passwd.",
            "firewall_rule": "Block SSH access (port 22) except from authorized IT admin jump hosts.",
            "verification_step": "Run 'uname -r' and verify kernel is >= 5.16.11 or 5.15.25.",
        }
    elif "cisco" in sw or "cve-2023-20198" in cve_id.lower() or "ios" in sw:
        return {
            "title": "Disable Web UI Feature & Apply Cisco IOS XE Security Update",
            "cisa_mandate": cisa_action or "Immediately disable the HTTP/HTTPS Server feature on internet-facing devices.",
            "patch_command": "configure terminal\nno ip http server\nno ip http secure-server\nend\nwrite memory",
            "workaround": "Ensure Cisco Web Management UI is disabled across all untrusted external network interfaces.",
            "firewall_rule": "access-list 100 deny tcp any any eq 80\naccess-list 100 deny tcp any any eq 443",
            "verification_step": "Verify 'show running-config | include ip http' outputs empty/disabled.",
        }
    elif "zerologon" in cve_id.lower() or "cve-2020-1472" in cve_id.lower() or "windows" in os_name:
        return {
            "title": "Install Microsoft Security Update KB4571694 & Enforce Secure RPC",
            "cisa_mandate": cisa_action or "Apply Microsoft Zerologon emergency security updates across all Domain Controllers.",
            "patch_command": "Install-WindowsUpdate -KBArticleID KB4571694 -AcceptAll -AutoReboot",
            "workaround": "Set registry key: HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Netlogon\\Parameters\\FullSecureChannelProtection = 1",
            "firewall_rule": "Block incoming RPC/SMB ports 135, 139, and 445 on perimeter firewalls.",
            "verification_step": "Check Event Viewer Event ID 5829 (Netlogon secure channel connection warnings).",
        }
    elif "log4j" in sw or "cve-2021-44228" in cve_id.lower():
        return {
            "title": "Upgrade Log4j to Version 2.17.1+ or Disable JNDI Message Lookups",
            "cisa_mandate": cisa_action or "Apply vendor updates or disable JNDI lookup functionality per CISA ED 22-02.",
            "patch_command": "export LOG4J_FORMAT_MSG_NO_LOOKUPS=true",
            "workaround": "Add -Dlog4j2.formatMsgNoLookups=true to Java application startup environment arguments.",
            "firewall_rule": "Egress filter outbound LDAP (389, 636) and RMI (1099) requests from internal production servers.",
            "verification_step": "Run 'grep -i log4j' across application jars to confirm version >= 2.17.1.",
        }
    elif "ssh" in sw or "cve-2024-6387" in cve_id.lower():
        return {
            "title": "Upgrade OpenSSH Server to Version >= 9.8p1 (Neutralize RegreSSHion)",
            "cisa_mandate": cisa_action or "Update OpenSSH daemon to latest vendor security package.",
            "patch_command": "sudo apt-get update && sudo apt-get --only-upgrade install openssh-server -y",
            "workaround": "Set 'LoginGraceTime 0' in /etc/ssh/sshd_config and restart sshd (eliminates the signal race condition).",
            "firewall_rule": "ufw allow from 192.168.1.0/24 to any port 22 proto tcp",
            "verification_step": "Run 'ssh -V' to confirm OpenSSH version 9.8p1 or patched vendor release.",
        }
    else:
        return {
            "title": f"Upgrade {software_name or 'software component'} to Latest Security Release",
            "cisa_mandate": cisa_action or "Apply vendor patch or mitigations per standard vulnerability management cycle.",
            "patch_command": f"sudo apt-get update && sudo apt-get --only-upgrade install {software_name or 'package'} -y",
            "workaround": "Restrict network exposure using firewall access control lists (ACLs).",
            "firewall_rule": "iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT",
            "verification_step": "Verify service logs for absence of exploit payloads.",
        }


def generate_what_if_not_cured(
    cve_id: str,
    software_name: str | None,
    cvss_score: float | None,
    description: str,
    epss_score: float,
    is_cisa_exploited: bool,
) -> dict[str, Any]:
    """2. What happens if not cured: Technical threat vector & exploit mechanism."""
    sw = (software_name or "").lower()

    if "cve-2023-44487" in cve_id.lower() or "nginx" in sw:
        exploit_mechanism = "Attackers initiate and immediately reset hundreds of thousands of HTTP/2 streams per second. The server spends all CPU cycles processing resets, resulting in total resource exhaustion and daemon crash."
        attacker_capability = "Remote unauthenticated Denial of Service (DoS) capable of knocking production web servers offline from a single consumer computer."
    elif "cve-2023-39417" in cve_id.lower() or "cve-2024-10979" in cve_id.lower() or "postgres" in sw:
        exploit_mechanism = "Malformed SQL statements inside extension loading scripts bypass privilege checks, enabling an authenticated attacker to execute shell commands as the postgres operating system user."
        attacker_capability = "Database Superuser takeover, full arbitrary SQL injection, database dump, and host filesystem manipulation."
    elif "cve-2022-0847" in cve_id.lower() or "dirty pipe" in cve_id.lower():
        exploit_mechanism = "A flaw in the Linux kernel pipe buffer flags allows unprivileged processes to write into read-only page cache pages, allowing arbitrary file overwriting (such as injecting root credentials into /etc/passwd)."
        attacker_capability = "Instant zero-click local privilege escalation from unprivileged standard user account to absolute root control."
    elif "cve-2023-20198" in cve_id.lower() or "cisco" in sw:
        exploit_mechanism = "An unauthenticated remote attacker submits malicious HTTP requests to the Cisco Web UI, creating a new user account with privilege level 15 (highest network administrative tier)."
        attacker_capability = "Full perimeter router takeover, network traffic interception, packet sniffing, and routing manipulation."
    elif "cve-2020-1472" in cve_id.lower() or "zerologon" in cve_id.lower():
        exploit_mechanism = "Flaw in AES-CFB8 implementation inside Netlogon allows an attacker to send zeroes in authentication challenges to reset the Domain Controller computer account password."
        attacker_capability = "Immediate domain administrator takeover of the entire enterprise Active Directory domain within seconds."
    elif "cve-2021-44228" in cve_id.lower() or "log4j" in sw:
        exploit_mechanism = "Log4j JNDI lookups evaluate attacker-controlled strings (e.g. in user-agent or form fields) and load arbitrary remote Java class files from an attacker LDAP server."
        attacker_capability = "Unauthenticated Remote Code Execution (RCE) as the web application process."
    else:
        exploit_mechanism = description[:250] + ("..." if len(description) > 250 else "")
        attacker_capability = "Unauthorized system access, potential data exfiltration, and service disruption."

    return {
        "exploit_mechanism": exploit_mechanism,
        "attacker_capability": attacker_capability,
        "epss_probability": f"{epss_score:.1f}% probability of active attack in the wild",
        "weaponized_status": "CONFIRMED WEAPONIZED (CISA KEV)" if is_cisa_exploited else "HIGH EXPLOIT PROBABILITY (FIRST EPSS)" if epss_score > 20 else "STANDARD MONITORED VULNERABILITY",
        "severity_level": "CRITICAL RISK" if (cvss_score or 0) >= 9 else "HIGH RISK" if (cvss_score or 0) >= 7 else "MEDIUM RISK",
    }


def generate_consequences(
    department: str | None,
    asset_type: str | None,
    asset_name: str,
    cvss_score: float | None,
) -> dict[str, Any]:
    """
    3. Multi-Industry Business, Legal, and Operational Consequences.
    Dynamically identifies domain context (Banking/Fintech, E-Commerce, Manufacturing,
    Cloud/IT Infrastructure, Healthcare, or Corporate Enterprise) based on asset metadata.
    """
    dept = (department or "").lower()
    atype = (asset_type or "").lower()
    name = asset_name.lower()
    combined_context = f"{dept} {atype} {name}"

    # 1. Banking, Fintech, & Financial Services
    if any(k in combined_context for k in ["fintech", "payment", "bank", "treasury", "ledger", "card", "billing", "audit", "account"]):
        domain_cat = "Banking & Financial Services"
        primary_impact = (
            "Compromise of core financial transactions and balance integrity. Threat actors could intercept or "
            "forge wire transfers, manipulate general ledger entries, or tamper with customer payment records."
        )
        operational_impact = (
            "Payment gateway and transaction settlement queues suspended; reconciliation processes frozen; "
            "emergency revocation and reissuance of merchant signing keys."
        )
        legal_regulatory = (
            "Severe PCI-DSS compliance sanctions, Gramm-Leach-Bliley Act (GLBA) and SOX Section 404 audit failures, "
            "mandatory disclosure to SEC/CFPB within 4 business days, and card brand non-compliance fines up to $100,000/month."
        )
        financial_cost = (
            "Estimated $3.5M+ in potential fraudulent transaction exposure, forensic audit retainers, "
            "card reissuance costs, and regulatory penalty fines."
        )

    # 2. E-Commerce & Customer Retail
    elif any(k in combined_context for k in ["ecommerce", "e-commerce", "store", "cart", "shop", "order", "retail", "crm"]):
        domain_cat = "E-Commerce & Digital Commerce"
        primary_impact = (
            "Direct compromise of customer shopping pipeline and order database. Vulnerable to credit card e-skimming "
            "(Magecart attacks), customer credential harvesting, and customer order history exfiltration."
        )
        operational_impact = (
            "Checkout portal outage and cart abandonment during critical sales periods; automated inventory sync halted; "
            "order fulfillment delays across supply warehouses."
        )
        legal_regulatory = (
            "GDPR Article 83 and CCPA consumer privacy statutory penalties (up to 4% of annual global revenue), "
            "FTC consent decrees, and mandatory customer breach notifications."
        )
        financial_cost = (
            "Estimated $50,000 - $180,000 lost revenue per hour of transaction downtime, plus litigation defense retainers."
        )

    # 3. Industrial Manufacturing, SCADA & Logistics
    elif any(k in combined_context for k in ["scada", "plc", "factory", "plant", "manufacturing", "industrial", "iot", "sensor", "assembly", "warehouse", "logistics"]):
        domain_cat = "Manufacturing & Industrial Automation"
        primary_impact = (
            "Physical operational technology (OT) compromise. Malicious actors could override safety shutoff limits, "
            "spoof sensor metrics, or abruptly stop automated assembly line machinery."
        )
        operational_impact = (
            "Immediate emergency stoppage of production floor lines; factory shift downtime; physical inspection and recalibration "
            "of industrial equipment prior to safe restart."
        )
        legal_regulatory = (
            "OSHA workplace safety investigation, EPA environmental non-compliance inquiries if containment sensors fail, "
            "and contractual breach of delivery penalties with commercial partners."
        )
        financial_cost = (
            "Estimated $1.2M - $3.8M in idle plant overhead, unfulfilled vendor delivery penalties, and physical machinery diagnostic expenses."
        )

    # 4. Core IT, Cloud, Identity & Network Infrastructure
    elif any(k in combined_context for k in ["identity", "auth", "active directory", "domain controller", "ad", "firewall", "router", "vpn", "gateway", "kubernetes", "cloud", "server", "infrastructure", "network"]):
        domain_cat = "Enterprise Identity & Infrastructure"
        primary_impact = (
            "Perimeter boundary compromise and complete domain privilege escalation. Attackers establish persistent remote access "
            "beacons and move laterally across corporate subnets to capture enterprise secrets."
        )
        operational_impact = (
            "Network segment quarantine, company-wide forced credential/MFA revocation, and temporary disconnection "
            "of remote VPN tunnels and internal admin portals."
        )
        legal_regulatory = (
            "CISA Federal Incident Reporting (CIRCIA) mandatory 72-hour notice, SOC 2 Type II trust criteria violation, "
            "and enterprise SLA breach liabilities."
        )
        financial_cost = (
            "Enterprise ransomware extortion demands historically exceeding $3M - $7M, plus third-party forensic triage fees."
        )

    # 5. Healthcare & Clinical Systems (Preserved for clinical/hospital environments)
    elif any(k in combined_context for k in ["icu", "patient", "ehr", "emr", "pacs", "radiology", "pharmacy", "clinic", "hospital", "medical", "nurse"]):
        domain_cat = "Healthcare & Clinical Systems"
        primary_impact = (
            "Direct threat to patient safety and clinical workflows. Telemetry feeds, EHR records, and diagnostic "
            "imaging systems become unavailable during emergency treatments."
        )
        operational_impact = (
            "Clinical units forced to switch to manual paper records, slowing patient intake by over 400%; diversion of incoming acute cases."
        )
        legal_regulatory = (
            "Major HIPAA breach notification to US HHS Office for Civil Rights (OCR) triggering mandatory public notification "
            "and fines up to $1,500,000 per violation."
        )
        financial_cost = (
            "Estimated $2.4M+ in clinical downtime, ambulance diversion losses, and mandatory patient credit monitoring programs."
        )

    # 6. Corporate & General Business Operations (Universal Fallback)
    else:
        domain_cat = "Corporate Enterprise Operations"
        primary_impact = (
            "Unauthorized administrative access, business data exfiltration, or lateral malware staging across corporate assets."
        )
        operational_impact = (
            "Host isolation from internal network; employee workstation re-imaging; disruption of email and internal collaboration tools."
        )
        legal_regulatory = (
            "State-level data breach notification requirements (within 30-45 days), corporate audit inquiries, and internal compliance remediation."
        )
        financial_cost = (
            "Remediation labor costs, overtime, forensic triage, and business disruption estimated at $350,000 - $850,000."
        )

    return {
        "domain_category": domain_cat,
        "primary_impact": primary_impact,
        "clinical_impact": primary_impact,  # Backward compatibility alias
        "operational_impact": operational_impact,
        "legal_regulatory": legal_regulatory,
        "financial_cost": financial_cost,
    }


async def build_complete_action_profile(
    cve_id: str,
    software_name: str | None,
    operating_system: str | None,
    department: str | None,
    asset_type: str | None,
    asset_name: str,
    cvss_score: float | None,
    description: str,
) -> dict[str, Any]:
    """Orchestrate all 3 parts into a unified security action profile."""
    # 1. Fetch live telemetry
    cisa_details = await get_cisa_kev_details(cve_id)
    epss_info = await get_live_epss(cve_id)
    is_cisa_exploited = cisa_details is not None

    cisa_action = cisa_details.get("required_action") if cisa_details else None
    due_date = cisa_details.get("due_date") if cisa_details else None

    # 2. Build 3 distinct components
    remedy = generate_remedy(cve_id, software_name, operating_system, cisa_action)
    remedy["due_date"] = due_date

    what_if = generate_what_if_not_cured(
        cve_id, software_name, cvss_score, description, epss_info["epss_score"], is_cisa_exploited
    )
    what_if["epss_percentile"] = epss_info["percentile"]

    consequences = generate_consequences(department, asset_type, asset_name, cvss_score)

    return {
        "cve_id": cve_id,
        "asset_name": asset_name,
        "software": software_name or "System",
        "cvss_score": cvss_score,
        "remedy": remedy,
        "what_if_not_cured": what_if,
        "consequences": consequences,
    }
