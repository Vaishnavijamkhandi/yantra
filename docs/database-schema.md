# Database Schema Documentation

CyberSentra uses SQLAlchemy 2.0 ORM with PostgreSQL (e.g. Neon Cloud) and SQLite.

## Table Directory

| Table Name | Purpose | Primary Model |
| :--- | :--- | :--- |
| `assets` | Core inventory of hosts, OT controllers, servers, and routers | `Asset` |
| `asset_software` | Software packages, versions, and applications installed on assets | `AssetSoftware` |
| `vulnerabilities` | Synchronized CVE records with CVSS scores, published dates, and sources | `Vulnerability` |
| `asset_vulnerabilities` | Matches linking assets to specific CVEs with remediation statuses | `AssetVulnerability` |
| `risk_assessments` | Computed multi-factor risk scores, factor breakdowns, and recommendations | `RiskAssessment` |
| `asset_dependencies` | Directed functional dependencies ($u \to v$) for graph impact simulation | `AssetDependency` |
| `infrastructure_gaps` | Identified security coverage blind spots, legacy OS, and OT gaps | `InfrastructureGap` |
| `epss_scores` | Exploit Prediction Scoring System probabilities and percentiles | `EpssScore` |
| `ml_model_cards` | ML algorithm metrics (ROC-AUC, F1, precision, recall, training rows) | `MLModelCard` |
| `users` | Role-based user accounts (`admin`, `analyst`, `viewer`) with hashed credentials | `User` |

Detailed ER diagram and column types are available in [CYBERSENTRA_SYSTEM_ARCHITECTURE.md](./CYBERSENTRA_SYSTEM_ARCHITECTURE.md#4-database-schema-reference).
