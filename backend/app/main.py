from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.db.database import Base, engine
import app.models  # noqa: F401 - ensure all ORM models are registered
from app.routes.assets import router as asset_router
from app.routes.vulnerabilities import router as vuln_router
from app.routes.vulnerabilities import assessment_router
from app.routes.vulnerabilities import asset_vuln_router
from app.routes.risks import router as risk_router
from app.routes.ml import router as ml_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure tables exist in SQLite/PostgreSQL
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title="CyberSentra — Hospital Cyber-Risk Platform API",
    description="Phase 1–3 (Asset Inventory, Vulnerability Assessment, Risk Engine) + Phase 7 (ML)",
    version="4.0.0",
    lifespan=lifespan,
)

cors_origins = [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(asset_router)
app.include_router(vuln_router)
app.include_router(assessment_router)
app.include_router(asset_vuln_router)
app.include_router(risk_router)
app.include_router(ml_router)


@app.get("/")
def health_check():
    return {
        "status": "running",
        "message": "CyberSentra Hospital Cyber-Risk Platform API",
        "version": "3.0.0",
        "phase": "Phase 1 + Phase 2 + Phase 3",
        "docs": "/docs",
    }


@app.get("/health")
def health():
    return {"status": "ok"}
