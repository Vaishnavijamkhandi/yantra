# CyberSentra (Yantra) — Architecture Decisions & Progress Tracker

**Repository**: [https://github.com/Vaishnavijamkhandi/yantra](https://github.com/Vaishnavijamkhandi/yantra)  
**Branch**: `master` (Tracked & Synced with `origin/master`)  
**Project Domain**: Critical Infrastructure Cyber-Risk Assessment Platform (Hospital Target Environment)  
**Status**: Milestone 1 & 2 Completed; Phase 3 & 4 Architecture Under Review  

---

## 1. Project Sync & Current State

The workspace is synchronized with the remote GitHub repository (`Vaishnavijamkhandi/yantra`):
* **Commit `42f6758`**: Phase 1: Hospital Asset Management System — initial implementation
* **Commit `099f3c5`**: Phase 2: Vulnerability Assessment with NVD API sync and matching engine
* **Commit `ece4dd7`**: Initialized curated demo dataset and asset-software relationships

### Current Active Architecture:
* **Backend**: FastAPI + SQLAlchemy + SQLite/PostgreSQL
  * Routes: `/api/assets`, `/api/vulnerabilities`, `/api/assessment`
  * Services: `normalizer.py` (CPE alias dictionary), `nvd_collector.py` (NVD API 2.0 collector), `matcher.py` (2-pass matching), `seed_data.py`
* **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS + React Router v7
  * Pages: `Dashboard.tsx`, `AssetInventory.tsx`, `AssetDetail.tsx`, `Assessment.tsx`, `Vulnerabilities.tsx`
  * Components: `Navbar.tsx`, `AssetForm.tsx`, `CsvUpload.tsx`

---

## 2. Key Architecture Decisions (ADRs)

### ADR-001: NVD CVE API 2.0 Delta Sync Strategy
* **Problem**: Real-time NVD queries hit 429 rate limits (5 req/30s without API key). Naive caching misses newly added CVEs (e.g. React 19.2 has Vulnerability A today, Vulnerability B published tomorrow).
* **Decision**:
  * Use NVD API 2.0 incremental parameters `lastModStartDate` and `lastModEndDate`.
  * Store sync metadata (`software_sync_state`) per CPE prefix.
  * When assessing an asset past its TTL, query NVD only for records modified *after* `last_synced_at`.
  * Upsert deltas into local database; run matching in-memory/in-database.

### ADR-002: Adaptive Tiered TTL (Sync Window Justification)
* **Problem**: On what basis is the 12h or 24h sync window defined?
* **Decision**:
  1. **NIST Publication Cadence**: NIST publishes batch updates every 2 to 4 hours; querying more frequently burns quota with zero new data.
  2. **Rate Limit Math**: 200 software products take 20 minutes to scan without an API key. A 24-hour cycle consumes only 1.3% of the daily quota, leaving 98.7% for user queries.
  3. **Tiered Staleness**:
     - **Internet-Facing / High Criticality**: **6 to 12 Hours** (perimeter defense).
     - **Internal Critical Systems (ICU / EHR)**: **12 to 24 Hours**.
     - **Internal / Workstations / Isolated**: **24 to 48 Hours**.
  4. **Event Overrides**: New asset creation, version modifications, and manual analyst "Force Re-check" clicks bypass the TTL immediately.

### ADR-003: CPE Normalization & Tokenized Version Comparator
* **Problem**: User friendly names (`Canonical OpenSSH 8.9p1`) do not match NVD CPE (`openbsd:openssh:8.9:p1`). Naive `.split('.')` breaks on letter suffixes like `p1`.
* **Decision**:
  * `normalizer.py` maps vendor/software aliases to canonical CPE names.
  * Tokenized version parser separates numeric parts and suffixes `[(8, ''), (9, 'p1')]` to accurately evaluate `versionStartIncluding` and `versionEndExcluding`.

---

## 3. Blueprint: Phase 3 — Explainable Risk Scoring Engine

### 1. Scoring Methodology & Mathematical Formulation
Risk score is a transparent 0–100 heuristic:
$$\text{Risk Score} = (w_{\text{sev}} \times \text{Severity}) + (w_{\text{exp}} \times \text{Exploitability}) + (w_{\text{net}} \times \text{Exposure}) + (w_{\text{crit}} \times \text{Criticality})$$

* **Default Weights**: $w_{\text{sev}} = 0.40$, $w_{\text{exp}} = 0.20$, $w_{\text{net}} = 0.20$, $w_{\text{crit}} = 0.20$ (Configurable).
* **Compounding Severity**: Rather than just the highest CVSS, additional confirmed CVEs add a diminishing logarithmic penalty:
  $$\text{Severity} = \min\left(100.0, (\max(\text{CVSS}) \times 10) + \min(15.0, 3.0 \times \ln(N))\right)$$
* **CISA KEV Integration**: If a matched CVE is listed in CISA KEV (actively exploited), set Exploitability to 100 with an urgent indicator flag.
* **Uncertainty Baseline (Zero-Match Assets)**:
  $$\text{Score} = (0.25 \times \text{Exposure}) + (0.35 \times \text{Criticality}) + 10.0\text{ (Uncertainty Floor)}$$
  Evidence coverage is marked as `limited_evidence`.

### 2. Risk Categories
* **Critical**: $80.0 - 100.0$ (Immediate remediation required)
* **High**: $60.0 - 79.9$ (Remediation within 7 days)
* **Medium**: $30.0 - 59.9$ (Scheduled maintenance)
* **Low**: $0.0 - 29.9$ (Routine monitoring)

### 3. Database Schema: `risk_assessments`
* `id`: Integer Primary Key
* `asset_id`: Integer ForeignKey(`assets.id`, CASCADE)
* `risk_score`: Float (0–100)
* `risk_level`: String (`Critical`, `High`, `Medium`, `Low`)
* `factors`: JSON (`{"severity": 85.0, "exploitability": 70.0, "exposure": 65.0, "criticality": 100.0, "cve_count": 3, "cisa_kev_present": true}`)
* `explanation`: Text (Clear human-readable breakdown)
* `evidence_coverage`: String (`confirmed_matches`, `limited_evidence`, `no_matches`)
* `recommendations`: JSON List of remediation steps
* `assessed_at`: DateTime (UTC)

---

## 4. Blueprint: Phase 4 — Advanced Risk Prioritisation Dashboard

### 1. KPI Metric Cards
* **Total Registered Assets**: Count of all infrastructure nodes.
* **Assets with Confirmed CVEs**: Count of assets with at least one active match.
* **Critical & High Risk Assets**: Assets requiring immediate operator attention.
* **Average Fleet Risk Score**: Macro security posture metric.
* **Actively Exploited (CISA KEV) Count**: Immediate active threat warnings.

### 2. Visualizations
1. **Risk Distribution (Bar Chart)**: Count of assets across Critical, High, Medium, Low.
2. **Department Risk Breakdown (Horizontal Bar Chart)**: Comparing ICU vs Pharmacy vs Radiology vs IT Operations.
3. **Asset Criticality Distribution (Donut Chart)**: Spread of asset criticality ratings.
4. **Historical Risk Trend (Line Chart)**: Fleet average score tracked over time.

### 3. Priority Queue Table
* Dynamic multi-column sorting (by Risk Score, Criticality, Exposure, Matched CVE count).
* Instant search and multi-tag filtering (by Department, Exposure, Risk Level).
* Visual badges with color indicators.

### 4. Asset Detail Drawer (Interactive Slide-Over)
* Deep dive into contributing factors (Radar or Bar chart of the 4 vectors).
* Full list of confirmed CVEs with CVSS scores and direct NVD links.
* Actionable, vendor-specific remediation advice.
* What-if preview ("If you patch OpenSSH, your risk drops from 88 to 34").

---

## 5. End-to-End Roadmap

1. **Phase 1**: Asset Inventory Management ✅ *(Implemented in `yantra`)*
2. **Phase 2**: Vulnerability Assessment Engine ✅ *(Implemented in `yantra`)*
3. **Phase 3**: Explainable Risk Scoring Engine 🟡 *(Architecture Designed; Ready for Review)*
4. **Phase 4**: Advanced Prioritisation Dashboard 🟡 *(Architecture Designed; Ready for Review)*
5. **Phase 5**: Digital Twin of Hospital Infrastructure (React Flow Graph) ⏳ *(Planned)*
6. **Phase 6**: Attack Path & Cascading Blast Radius Simulation ⏳ *(Planned)*
7. **Phase 7**: ML Risk Evaluation (Random Forest vs Gradient Boosting) ⏳ *(Planned)*
8. **Phase 8**: Remediation Management (Tasks, SLAs, Verification) ⏳ *(Planned)*
9. **Phase 9**: RBAC & Authentication (JWT, Roles) ⏳ *(Planned)*
10. **Phase 10**: Testing & QA (Pytest & Frontend component tests) ⏳ *(Planned)*
11. **Phase 11**: Deployment (Docker, Docker Compose, CI/CD) ⏳ *(Planned)*
