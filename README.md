# Cyber-Risk Platform — PS03

A working prototype for critical-infrastructure cyber-risk assessment. The starter environment uses a simulated hospital asset inventory and supports:

- Asset CRUD and CSV import
- Software inventory per asset
- NVD CVE lookup/synchronisation (optional live integration)
- Conservative product/version vulnerability matching
- Explainable, deterministic baseline risk scoring
- Risk ranking and dashboard summaries
- ML training script kept separate from the application

> **Important:** This is a decision-support prototype, not a production vulnerability scanner or a validated predictor of future incidents. NVD matching can be incomplete. A "no match" result does not prove an asset is secure. Use only authorised inventory and network data. Do not scan systems without explicit permission.

## Architecture

- `frontend/`: React + TypeScript + Vite
- `backend/`: FastAPI + SQLAlchemy + Pydantic
- Database: SQLite by default for a zero-configuration demo; PostgreSQL supported through `DATABASE_URL`
- Vulnerability source: NVD CVE API v2.0
- ML: standalone training script in `backend/app/risk_engine/ml_train.py`; not loaded by the application

## Requirements

- Python 3.10+
- Node.js 18+
- npm

## 1. Start the backend

```bash
cd backend
python -m venv .venv

# Windows
.venv\Scripts\activate
# macOS/Linux
source .venv/bin/activate

pip install -e ".[dev]"
cp .env.example .env   # Windows: copy .env.example .env
uvicorn app.main:app --reload
```

API docs: http://127.0.0.1:8000/docs

The default database is `sqlite:///./cyber_risk.db`. Tables are created automatically on startup for convenience. Alembic migrations are also included.

To use PostgreSQL, set for example:
```env
DATABASE_URL=postgresql+psycopg://postgres:password@localhost:5432/cyber_risk
```

Optional NVD API key:
```env
NVD_API_KEY=your_key
```
The application works without an API key, but NVD rate limits are stricter. See https://nvd.nist.gov/developers/request-an-api-key.

## 2. Start the frontend

In another terminal:

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. The Vite dev server proxies `/api` to the backend.

If you run the frontend elsewhere, set `VITE_API_BASE_URL` to your backend URL.

## 3. Load the demo assets

The frontend has a **Load demo data** action. It imports `dataset/hospital_assets.csv` through the backend endpoint. You can also upload your own CSV using the same column headers.

CSV headers:
`asset_name,asset_type,ip_address,operating_system,software_name,software_version,criticality,exposure,department,environment`

A single CSV row creates an asset and its primary software record. For multiple software products on one asset, add software through the asset detail/API after import or extend the CSV schema.

## 4. Vulnerability assessment

1. Open an asset.
2. Use **Assess vulnerabilities** to query NVD by software keyword.
3. The backend stores CVE records and associates only conservative matches where product/CPE/version evidence is available.
4. Review each result's match status and evidence.

NVD's API does not guarantee that every product query returns complete CPE/version data. Ambiguous records are marked `needs_verification`; the system does not silently treat keyword matches as confirmed vulnerabilities.

## 5. Risk scoring

The baseline engine is deterministic and explainable. It considers:
- highest confirmed CVSS base score
- exploitability evidence (when CVSS v3/v4 vector metrics are available)
- asset exposure
- asset criticality

The score is a prioritisation heuristic, not a probability of compromise. See `docs/risk-methodology.md`.

## 6. ML training script (separate / not integrated)

The script is at:
`backend/app/risk_engine/ml_train.py`

It expects a labelled CSV containing historical examples and a binary target column `incident` (0/1). See:
`dataset/historical_risk_training_template.csv`

Example:
```bash
cd backend
python -m app.risk_engine.ml_train \
  --data ../dataset/your_labelled_history.csv \
  --target incident \
  --output artifacts/risk_model.joblib
```

The template contains headers only. Do not train on invented labels and present the result as real-world predictive performance. Use temporally separated train/test data and assess class imbalance, leakage, precision, recall, ROC-AUC and calibration before using any model operationally.

## 7. Run tests

```bash
cd backend
pytest
```

## 8. Folder structure

```text
cyber-risk-platform/
├── frontend/
│   ├── src/
│   ├── public/
│   └── package.json
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── core/
│   │   ├── db/
│   │   ├── models/
│   │   ├── schemas/
│   │   ├── routes/
│   │   ├── services/
│   │   └── risk_engine/
│   ├── alembic/
│   ├── tests/
│   └── pyproject.toml
├── dataset/
├── docs/
├── .gitignore
└── README.md
```

## Known limitations / next steps

- Authentication and role-based access are not included; add them before multi-user deployment.
- NVD matching is deliberately conservative and should be reviewed by a security analyst.
- Asset dependency mapping and what-if simulation are not included in this first build; they are the next major product phase.
- No automatic network scanning is enabled. If you later add Nmap, restrict it to explicitly authorised ranges and require operator confirmation.
- Do not expose this demo API directly to the public internet.
