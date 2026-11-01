from __future__ import annotations

import os
import json
import logging
import urllib.request
import urllib.error
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.database import get_db
from app.models.asset import Asset
from app.models.risk import RiskAssessment
from app.models.vulnerability import Vulnerability

logger = logging.getLogger(__name__)

router = APIRouter()


class ChatMessage(BaseModel):
    role: str  # "user" or "assistant" / "model"
    content: str


class ChatRequest(BaseModel):
    message: str
    history: List[ChatMessage] = []
    context: Optional[dict] = None


class ChatResponse(BaseModel):
    reply: str
    model: str = "gemini-3.8-flash"


def build_system_context(db: Session) -> str:
    """Gathers fleet overview context so the AI assistant has real-time awareness."""
    try:
        total_assets = db.query(Asset).count()
        critical_assets = db.query(Asset).filter(Asset.criticality == "Critical").count()
        high_risks = (
            db.query(RiskAssessment)
            .filter(RiskAssessment.risk_level.in_(["Critical", "High"]))
            .count()
        )
        total_cves = db.query(Vulnerability).count()
        return (
            f"\n[CURRENT FLEET LIVE METRICS]\n"
            f"- Ingested Fleet: {total_assets} critical infrastructure assets\n"
            f"- Mission-Critical Tier 1 Assets: {critical_assets}\n"
            f"- High/Critical Risk Findings: {high_risks} active assessments\n"
            f"- Seeded CVE Signatures: {total_cves} CVEs (CISA KEV + NVD aligned)\n"
        )
    except Exception as e:
        logger.warning(f"Failed to gather system context: {e}")
        return "\n[FLEET METRICS]: Live metrics temporarily unavailable.\n"


def generate_local_fallback(message: str) -> str:
    """Provides a deterministic expert response if the external API is offline or unreachable."""
    msg = message.lower()
    if "cve-2023-20198" in msg:
        return (
            "**CVE-2023-20198 (Cisco IOS XE Web UI Privilege Escalation - CVSS 10.0)**\n\n"
            "- **Threat**: Active CISA KEV exploitation. Grants unauthenticated remote attackers root administrator privileges.\n"
            "- **Recommended Remediation**:\n"
            "  1. Disable HTTP Server feature on all internet-facing interfaces (`no ip http server`).\n"
            "  2. Apply Cisco's official fixed software release immediately.\n"
            "  3. Check system logs for unauthorized user accounts created under local credentials."
        )
    if "cisa" in msg or "kev" in msg:
        return (
            "**CISA Known Exploited Vulnerabilities (KEV) Catalog**:\n\n"
            "CISA KEV lists vulnerabilities that are confirmed to be weaponized in the wild against public and private infrastructure. "
            "In CyberSentra, any asset matched against a CISA KEV is weighted with **100% Threat Exploitability**, automatically triggering urgent triage and a 24-hour remediation requirement."
        )
    if "epss" in msg:
        return (
            "**EPSS (Exploit Prediction Scoring System)**:\n\n"
            "EPSS estimates the probability (0.0 to 1.0) that a software vulnerability will be actively exploited in the wild within the next 30 days. "
            "CyberSentra combines EPSS percentile data with CVSS base severity to distinguish actively targeted vulnerabilities from theoretical flaws."
        )
    if "risk" in msg or "calculate" in msg or "formula" in msg:
        return (
            "**CyberSentra Multidimensional Risk Formula**:\n\n"
            "Risk Score (0–100) = (0.40 × Severity) + (0.20 × Exploitability) + (0.20 × Exposure) + (0.20 × Criticality)\n\n"
            "- **Severity (40%)**: Highest CVSS v3.1 base score + compounding log penalty for multiple CVEs.\n"
            "- **Exploitability (20%)**: CISA KEV alert presence and EPSS probability.\n"
            "- **Exposure (20%)**: External internet-facing (100) vs internal segmented (35) vs isolated (10).\n"
            "- **Criticality (20%)**: Clinical/Operational asset tier (Critical = 100, High = 75, Med = 45, Low = 20)."
        )
    return (
        "**CyberSentra AI Copilot Guidance**:\n\n"
        "I am ready to assist with your critical infrastructure posture. You can ask me to:\n"
        "- Triage specific CVEs and recommend vendor mitigation playbooks.\n"
        "- Explain the multi-factor risk score calculation for any asset.\n"
        "- Suggest network microsegmentation and air-gap strategies.\n"
        "- Draft executive incident-response summaries for audit readiness."
    )


@router.post("", response_model=ChatResponse)
@router.post("/", response_model=ChatResponse)
async def chat_with_copilot(
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Enterprise AI Copilot endpoint powered by Google Gemini.
    Answers critical infrastructure risk, vulnerability, and remediation queries.
    """
    try:
        data = await request.json()
    except Exception:
        raw = await request.body()
        try:
            data = json.loads(raw.decode("utf-8")) if raw else {}
        except Exception:
            data = {}

    user_msg = (data.get("message") or "").strip()
    if not user_msg:
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    history_data = data.get("history") or []
    history: List[ChatMessage] = []
    for h in history_data:
        if isinstance(h, dict):
            history.append(
                ChatMessage(
                    role=h.get("role", "user"),
                    content=h.get("content", ""),
                )
            )

    api_key = settings.GEMINI_API_KEY or os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return ChatResponse(
            reply=generate_local_fallback(user_msg),
            model="cybersentra-local-expert",
        )

    system_context = build_system_context(db)
    system_instruction = (
        "You are CyberSentra AI, an enterprise-grade AI security copilot and risk advisor "
        "for Critical Infrastructure (healthcare, industrial ICS/SCADA, enterprise network enclaves). "
        "You assist security analysts, hospital IT directors, and infrastructure engineers.\n"
        "Guidelines:\n"
        "1. Give direct, authoritative, structured answers with markdown formatting (bullet points, bold highlights).\n"
        "2. Prioritize operational safety, patient/grid safety, network microsegmentation, and vendor-certified patching.\n"
        "3. Reference real standards: CVSS v3.1, CISA KEV, EPSS, NIST CSF, IEC 62443, HIPAA, and NIS2.\n"
        "4. Be concise and actionable.\n"
        f"{system_context}"
    )

    # Prepare Gemini contents payload
    contents = []
    # Add conversation history
    for item in history[-6:]:  # Keep recent context window
        role = "user" if item.role in ["user", "human"] else "model"
        contents.append({"role": role, "parts": [{"text": item.content}]})

    # Add current message with system instruction
    prompt_text = f"{system_instruction}\n\nUser Question: {user_msg}" if len(contents) == 0 else user_msg
    contents.append({"role": "user", "parts": [{"text": prompt_text}]})

    payload = {
        "contents": contents,
        "generationConfig": {
            "temperature": 0.3,
            "maxOutputTokens": 1024,
        },
    }

    # Try preferred models in sequence (gemini-3.5-flash is ultra-fast ~2s)
    models_to_try = ["gemini-3.5-flash", "gemini-3.8-flash", "gemini-flash-lite-latest"]
    for model_name in models_to_try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
        data = json.dumps(payload).encode("utf-8")
        req_obj = urllib.request.Request(
            url,
            data=data,
            headers={"Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(req_obj, timeout=15) as response:
                result = json.loads(response.read().decode("utf-8"))
                candidates = result.get("candidates", [])
                if candidates:
                    parts = candidates[0].get("content", {}).get("parts", [])
                    if parts:
                        reply_text = parts[0].get("text", "")
                        return ChatResponse(reply=reply_text, model=model_name)
        except urllib.error.HTTPError as http_err:
            logger.warning(f"Gemini API model {model_name} HTTP {http_err.code}: {http_err.reason}")
            continue
        except Exception as exc:
            logger.warning(f"Gemini API model {model_name} failed: {exc}")
            continue

    # Graceful fallback to deterministic expert advisor if network or quota blocks
    logger.info("Using local CyberSentra expert fallback.")
    return ChatResponse(
        reply=generate_local_fallback(user_msg),
        model="cybersentra-local-expert",
    )
