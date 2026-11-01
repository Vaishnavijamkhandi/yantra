# Architecture Overview

> Complete, in-depth architectural blueprint is available in [CYBERSENTRA_SYSTEM_ARCHITECTURE.md](./CYBERSENTRA_SYSTEM_ARCHITECTURE.md).

## 1. High-Level Architecture

CyberSentra is structured as a decoupled, modern multi-tier platform:

```
[ Frontend: React 19 + TypeScript + TailwindCSS ]
                     │  (REST / JSON API)
                     ▼
[ Backend: FastAPI + Pydantic v2 + SQLAlchemy 2.0 ]
   ├── Analytical Engines:
   │    ├── Explainable Risk Engine (40% Sev, 20% Exploit, 20% Exp, 20% Crit)
   │    ├── Deterministic BFS Graph Incident Impact Simulator
   │    ├── Infrastructure Gap Heuristics Analyzer
   │    ├── Automated Ingestion & Assessment Pipeline
   │    └── CyberSentra AI Security Copilot (Google Gemini + Local Expert)
   ▼
[ Persistence: Neon Cloud PostgreSQL / SQLite via Psycopg 3 ]
```

## 2. Core Functional Layers

1. **Asset Intake & Ingestion Pipeline**: Universal CSV column mapping with pre-flight validation. Auto-triggers vulnerability matching, gap analysis, and risk scoring upon commit.
2. **Deterministic Risk Prioritization**: Multi-factor formulation combining CVSS severity, threat exploitability (EPSS), network exposure, and operational mission criticality.
3. **Live Incident Impact Simulator**: Deterministic BFS traversal over directed functional dependencies (`asset_dependencies`). Models asset compromise, ransomware spread, service outages, and quarantine isolation with interactive SVG playback.
4. **Interactive Remediation Twin**: What-If simulator on the dashboard calculating real-time risk score deltas for vendor patching and zero-trust microsegmentation.
5. **AI Copilot**: Context-injected cybersecurity advisor generating compliance playbooks (IEC 62443, NIST CSF, HIPAA).

Refer to [CYBERSENTRA_SYSTEM_ARCHITECTURE.md](./CYBERSENTRA_SYSTEM_ARCHITECTURE.md) for full database schemas, algorithm pseudocode, and API routing specifications.
