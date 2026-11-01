from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.db.database import Base, engine, SessionLocal
import app.models  # noqa: F401 - ensure all ORM models are registered
from app.services.auth_service import seed_default_users
from app.routes.auth import router as auth_router
from app.routes.assets import router as asset_router
from app.routes.vulnerabilities import router as vuln_router
from app.routes.vulnerabilities import assessment_router
from app.routes.vulnerabilities import asset_vuln_router
from app.routes.risks import router as risk_router
from app.routes.ml import router as ml_router
from app.routes.gaps import router as gap_router
from app.routes.reports import router as report_router
from app.routes.chat import router as chat_router
from app.routes.simulations import router as simulations_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure tables exist in SQLite/PostgreSQL
    try:
        Base.metadata.create_all(bind=engine)
        # Seed production-grade role accounts if empty
        with SessionLocal() as db:
            seed_default_users(db)
    except Exception:
        pass
    yield


app = FastAPI(
    title="CyberSentra — Enterprise Cyber-Risk Platform API",
    description="Unified Enterprise Cyber-Risk Platform: Asset Inventory, Gap Analysis, Assessments, Risk & Remediation, Reports, Settings",
    version="5.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
    ],
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(asset_router)
app.include_router(gap_router)
app.include_router(vuln_router)
app.include_router(assessment_router)
app.include_router(asset_vuln_router)
app.include_router(risk_router)
app.include_router(ml_router)
app.include_router(report_router)
app.include_router(chat_router, prefix="/api/chat", tags=["AI Copilot"])
app.include_router(simulations_router, prefix="/api/simulations", tags=["Incident Simulation"])


@app.get("/")
def health_check():
    return {
        "status": "running",
        "message": "CyberSentra Enterprise Cyber-Risk Platform API",
        "version": "3.0.0",
        "phase": "Final Consolidated Enterprise Cyber-Risk Platform",
        "docs": "/docs",
    }


@app.get("/health")
def health():
    return {"status": "ok"}
