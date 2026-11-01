import io
from datetime import datetime, timezone
from typing import Any

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    KeepTogether,
    HRFlowable,
)
from sqlalchemy.orm import Session

from app.models.asset import Asset, AssetDependency
from app.models.vulnerability import Vulnerability, AssetVulnerability
from app.models.risk import RiskAssessment
from app.models.gap import InfrastructureGap
from app.services.risk_engine import assess_dependency_impact


def generate_pdf_report(db: Session) -> bytes:
    """
    Generates a genuine, publication-grade enterprise Cyber-Risk Assessment PDF Report
    using saved database records across all assets, gaps, vulnerabilities, and risk scores.
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        leftMargin=36,
        rightMargin=36,
        topMargin=36,
        bottomMargin=36,
    )

    styles = getSampleStyleSheet()

    # Color definitions
    navy_primary = colors.HexColor("#0f172a")
    maroon_accent = colors.HexColor("#800020")
    cyan_accent = colors.HexColor("#0284c7")
    slate_subtext = colors.HexColor("#475569")
    border_color = colors.HexColor("#cbd5e1")
    bg_light = colors.HexColor("#f8fafc")

    title_style = ParagraphStyle(
        "DocTitle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=20,
        leading=24,
        textColor=navy_primary,
    )

    subtitle_style = ParagraphStyle(
        "DocSubtitle",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=10,
        leading=14,
        textColor=slate_subtext,
    )

    h1_style = ParagraphStyle(
        "SectionH1",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=12,
        leading=16,
        textColor=navy_primary,
        spaceBefore=12,
        spaceAfter=6,
    )

    body_style = ParagraphStyle(
        "BodyDark",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8.5,
        leading=12,
        textColor=colors.HexColor("#1e293b"),
    )

    badge_style_high = ParagraphStyle(
        "BadgeHigh",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=8,
        leading=10,
        textColor=colors.HexColor("#991b1b"),
    )

    table_header_style = ParagraphStyle(
        "TableHeader",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=8,
        leading=10,
        textColor=colors.white,
    )

    table_cell_style = ParagraphStyle(
        "TableCell",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=7.5,
        leading=9.5,
        textColor=colors.HexColor("#1e293b"),
    )

    story: list[Any] = []

    # ── HEADER & META ─────────────────────────────────────────────────────────
    now_utc = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

    header_table = Table(
        [
            [
                Paragraph("<b>CYBERSENTRA</b> — CRITICAL INFRASTRUCTURE ASSESSMENT", title_style),
                Paragraph(f"<b>CLASSIFICATION:</b> CONFIDENTIAL<br/><b>DATE:</b> {now_utc}", subtitle_style),
            ]
        ],
        colWidths=[4.2 * inch, 2.8 * inch],
    )
    header_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (1, 0), (1, 0), "RIGHT"),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 8))
    story.append(HRFlowable(width="100%", thickness=1.5, color=maroon_accent, spaceBefore=0, spaceAfter=10))

    # ── QUERY ACTUAL SAVED RECORDS ────────────────────────────────────────────
    assets = db.query(Asset).all()
    risks = db.query(RiskAssessment).all()
    gaps = db.query(InfrastructureGap).all()
    vuln_matches = db.query(AssetVulnerability).all()

    total_assets = len(assets)
    assessed_count = len(risks)
    avg_score = round(sum(r.risk_score for r in risks) / len(risks), 1) if risks else 0.0
    crit_count = sum(1 for r in risks if r.risk_score >= 80.0)
    high_count = sum(1 for r in risks if 60.0 <= r.risk_score < 80.0)
    open_gaps_count = sum(1 for g in gaps if g.status != "Resolved")
    high_gaps_count = sum(1 for g in gaps if g.severity == "HIGH" and g.status != "Resolved")
    total_vulns = len(vuln_matches)

    # ── SECTION 1: EXECUTIVE SCORECARD ────────────────────────────────────────
    story.append(Paragraph("1. Executive Cyber-Risk Scorecard", h1_style))
    scorecard_data = [
        [
            Paragraph("<b>Monitored Assets</b>", table_cell_style),
            Paragraph("<b>Fleet Average Risk</b>", table_cell_style),
            Paragraph("<b>Critical Risks (≥80)</b>", table_cell_style),
            Paragraph("<b>High Risks (60–79)</b>", table_cell_style),
            Paragraph("<b>Active Infrastructure Gaps</b>", table_cell_style),
            Paragraph("<b>Confirmed CVE Findings</b>", table_cell_style),
        ],
        [
            Paragraph(f"<font size=12><b>{total_assets}</b></font>", table_cell_style),
            Paragraph(f"<font size=12 color='#800020'><b>{avg_score} / 100</b></font>", table_cell_style),
            Paragraph(f"<font size=12 color='#b91c1c'><b>{crit_count}</b></font>", table_cell_style),
            Paragraph(f"<font size=12 color='#c2410c'><b>{high_count}</b></font>", table_cell_style),
            Paragraph(f"<font size=12 color='#b45309'><b>{open_gaps_count}</b> ({high_gaps_count} High)</font>", table_cell_style),
            Paragraph(f"<font size=12><b>{total_vulns}</b></font>", table_cell_style),
        ],
    ]
    scorecard_tbl = Table(scorecard_data, colWidths=[1.15 * inch] * 6)
    scorecard_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), bg_light),
        ("GRID", (0, 0), (-1, -1), 0.5, border_color),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(scorecard_tbl)
    story.append(Spacer(1, 10))

    # ── SECTION 2: ASSET INVENTORY & RISK POSTURE ─────────────────────────────
    story.append(Paragraph("2. Monitored Critical Infrastructure Assets", h1_style))
    asset_rows = [[
        Paragraph("Asset Name", table_header_style),
        Paragraph("Type", table_header_style),
        Paragraph("Criticality", table_header_style),
        Paragraph("Exposure", table_header_style),
        Paragraph("Department", table_header_style),
        Paragraph("Risk Score", table_header_style),
        Paragraph("Level", table_header_style),
    ]]

    # Map latest risk score by asset_id
    risk_map = {r.asset_id: r for r in risks}

    for a in assets[:15]:  # Display up to 15 assets on summary table
        r = risk_map.get(a.id)
        score_str = f"{r.risk_score:.1f}" if r else "Unassessed"
        level_str = r.risk_level if r else "Pending"
        crit_color = "#b91c1c" if a.criticality == "Critical" else ("#c2410c" if a.criticality == "High" else "#1e293b")

        asset_rows.append([
            Paragraph(f"<b>{a.asset_name}</b>", table_cell_style),
            Paragraph(a.asset_type, table_cell_style),
            Paragraph(f"<font color='{crit_color}'><b>{a.criticality}</b></font>", table_cell_style),
            Paragraph(a.exposure, table_cell_style),
            Paragraph(a.department or "Operations", table_cell_style),
            Paragraph(score_str, table_cell_style),
            Paragraph(f"<b>{level_str}</b>", table_cell_style),
        ])

    asset_tbl = Table(asset_rows, colWidths=[1.7 * inch, 0.9 * inch, 0.85 * inch, 0.9 * inch, 1.15 * inch, 0.75 * inch, 0.75 * inch])
    asset_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), navy_primary),
        ("GRID", (0, 0), (-1, -1), 0.5, border_color),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, bg_light]),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    story.append(asset_tbl)
    story.append(Spacer(1, 10))

    # ── SECTION 3: INFRASTRUCTURE GAP ANALYSIS ────────────────────────────────
    story.append(Paragraph("3. Pre-Assessment Infrastructure Gaps (Missing Evidence)", h1_style))
    story.append(Paragraph(
        "<i>Gaps represent missing, unverified, or unsupported inventory telemetry. They compromise accurate risk scoring but do not constitute confirmed active exploits.</i>",
        subtitle_style,
    ))
    story.append(Spacer(1, 4))

    gap_rows = [[
        Paragraph("Severity", table_header_style),
        Paragraph("Gap Finding", table_header_style),
        Paragraph("Category", table_header_style),
        Paragraph("Affected Asset", table_header_style),
        Paragraph("Status", table_header_style),
    ]]

    for g in gaps[:12]:  # Display top 12 gaps
        sev_color = "#b91c1c" if g.severity == "HIGH" else ("#c2410c" if g.severity == "MEDIUM" else "#475569")
        gap_rows.append([
            Paragraph(f"<font color='{sev_color}'><b>{g.severity}</b></font>", table_cell_style),
            Paragraph(f"<b>{g.gap_title}</b>", table_cell_style),
            Paragraph(g.category, table_cell_style),
            Paragraph(g.asset.asset_name if g.asset else f"ID {g.asset_id}", table_cell_style),
            Paragraph(g.status, table_cell_style),
        ])

    gap_tbl = Table(gap_rows, colWidths=[0.8 * inch, 2.5 * inch, 1.4 * inch, 1.4 * inch, 0.9 * inch])
    gap_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), maroon_accent),
        ("GRID", (0, 0), (-1, -1), 0.5, border_color),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, bg_light]),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    story.append(gap_tbl)
    story.append(Spacer(1, 10))

    # ── SECTION 4: VULNERABILITY FINDINGS & THREAT INTEL ───────────────────────
    story.append(Paragraph("4. Confirmed Vulnerability Findings & Threat Intelligence", h1_style))
    vuln_rows = [[
        Paragraph("CVE Identifier", table_header_style),
        Paragraph("Affected Asset", table_header_style),
        Paragraph("Severity", table_header_style),
        Paragraph("CVSS", table_header_style),
        Paragraph("Matched Software", table_header_style),
        Paragraph("Match Method", table_header_style),
    ]]

    for av in vuln_matches[:12]:
        v = av.vulnerability
        cve_str = v.cve_id if v else "CVE-UNKNOWN"
        cvss_str = f"{v.cvss_score:.1f}" if v and v.cvss_score else "N/A"
        sev_str = v.severity if v and v.severity else "MEDIUM"
        v_color = "#b91c1c" if sev_str in ("CRITICAL", "HIGH") else "#1e293b"

        vuln_rows.append([
            Paragraph(f"<b>{cve_str}</b>", table_cell_style),
            Paragraph(av.asset.asset_name if av.asset else f"ID {av.asset_id}", table_cell_style),
            Paragraph(f"<font color='{v_color}'><b>{sev_str}</b></font>", table_cell_style),
            Paragraph(cvss_str, table_cell_style),
            Paragraph(f"{av.matched_software} {av.matched_version or ''}", table_cell_style),
            Paragraph(av.match_method, table_cell_style),
        ])

    if len(vuln_rows) == 1:
        vuln_rows.append([
            Paragraph("No confirmed vulnerability matches in database", table_cell_style),
            Paragraph("-", table_cell_style),
            Paragraph("-", table_cell_style),
            Paragraph("-", table_cell_style),
            Paragraph("-", table_cell_style),
            Paragraph("-", table_cell_style),
        ])

    vuln_tbl = Table(vuln_rows, colWidths=[1.3 * inch, 1.6 * inch, 0.9 * inch, 0.6 * inch, 1.6 * inch, 1.0 * inch])
    vuln_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), navy_primary),
        ("GRID", (0, 0), (-1, -1), 0.5, border_color),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, bg_light]),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    story.append(vuln_tbl)
    story.append(Spacer(1, 10))

    # ── SECTION 5: DEPENDENCY BLAST-RADIUS & REMEDIATION ───────────────────────
    story.append(Paragraph("5. Critical Dependency Impact & Actionable Remediation", h1_style))
    impact_items = []
    for a in assets:
        if a.criticality in ("Critical", "High") or (risk_map.get(a.id) and risk_map[a.id].risk_score >= 70.0):
            impact = assess_dependency_impact(a, db)
            if impact.get("downstream_assets"):
                impact_items.append((a, impact))

    if impact_items:
        impact_rows = [[
            Paragraph("Critical Asset", table_header_style),
            Paragraph("Blast Radius", table_header_style),
            Paragraph("Direct Downstream Services Impacted", table_header_style),
            Paragraph("Recommended Triage Action", table_header_style),
        ]]
        for a, imp in impact_items[:6]:
            downstream = ", ".join(imp["downstream_assets"][:4])
            recs = imp["recommendations"][0] if imp["recommendations"] else "Apply emergency security baseline patch."
            impact_rows.append([
                Paragraph(f"<b>{a.asset_name}</b> ({a.criticality})", table_cell_style),
                Paragraph(f"{imp['blast_radius']} asset(s)", table_cell_style),
                Paragraph(downstream or "Isolated", table_cell_style),
                Paragraph(recs, table_cell_style),
            ])
        imp_tbl = Table(impact_rows, colWidths=[1.8 * inch, 0.9 * inch, 2.3 * inch, 2.0 * inch])
        imp_tbl.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), navy_primary),
            ("GRID", (0, 0), (-1, -1), 0.5, border_color),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, bg_light]),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ]))
        story.append(imp_tbl)
    else:
        story.append(Paragraph("No cascading multi-hop outages detected across current dependency mappings.", body_style))

    story.append(Spacer(1, 10))

    # ── SECTION 6: LIMITATIONS & SYSTEM SIGN-OFF ──────────────────────────────
    story.append(Paragraph("6. Assessment Limitations & Integrity Statement", h1_style))
    limitations_text = (
        "<b>AUDIT DISCLAIMER:</b> Risk calculations are derived deterministically based on NIST NVD CVE data, "
        "EPSS exploit probabilities, CISA Known Exploited Vulnerabilities catalog entries, and recorded network topologies. "
        "Assets flagged with 'Pre-Assessment Gaps' carry inherent uncertainty; lack of a CVE finding does not imply zero risk. "
        "All remediation recommendations must undergo validation in an isolated staging environment before production rollout."
    )
    story.append(Paragraph(limitations_text, subtitle_style))
    story.append(Spacer(1, 14))

    signoff_table = Table(
        [
            [
                Paragraph("<b>Generated By:</b> CyberSentra AI Platform Engine v4.2.0", subtitle_style),
                Paragraph(f"<b>Certified Timestamp:</b> {now_utc}", subtitle_style),
            ]
        ],
        colWidths=[3.5 * inch, 3.5 * inch],
    )
    story.append(signoff_table)

    # Build PDF document
    doc.build(story)
    buffer.seek(0)
    return buffer.getvalue()

