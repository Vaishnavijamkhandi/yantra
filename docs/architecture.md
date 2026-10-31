# Architecture

## Component flow

1. Asset intake: manual CRUD or CSV import.
2. Asset/software persistence: SQLAlchemy models in SQLite or PostgreSQL.
3. Vulnerability synchronisation: NVD API v2.0 keyword search, with records cached locally.
4. Matching: compare the asset software's product/version with available CPE criteria. Exact or range-compatible matches may be confirmed; ambiguous matches require verification.
5. Risk engine: deterministic baseline score and factor explanations.
6. Dashboard: aggregates stored assessments and ranks assets.

## Backend boundaries

- `routes/`: HTTP contract only
- `services/`: persistence workflows and external API integration
- `risk_engine/`: pure scoring and ML experimentation
- `models/`: SQLAlchemy persistence models
- `schemas/`: Pydantic request/response validation

## Security and operational notes

- Keep NVD keys in environment variables.
- Set CORS origins explicitly for deployment.
- The demo uses SQLite by default; PostgreSQL is supported.
- Add authentication, authorisation, audit logging, backups, rate limiting and secrets management before production use.
- Treat all imported inventory as untrusted input.
- This prototype does not scan or modify infrastructure.
