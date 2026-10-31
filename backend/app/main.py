import logging
import time
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
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

logger = logging.getLogger("api.access")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)


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


@app.middleware("http")
async def log_api_requests(request: Request, call_next):
    start_time = time.perf_counter()
    method = request.method
    path = request.url.path
    query = f"?{request.url.query}" if request.url.query else ""
    full_path = f"{path}{query}"
    client_ip = request.client.host if request.client else "unknown"

    logger.info("🚀 [API REQUEST] %s %s from %s", method, full_path, client_ip)

    try:
        response = await call_next(request)
        duration_ms = (time.perf_counter() - start_time) * 1000
        status = response.status_code
        status_icon = "✅" if status < 400 else ("⚠️" if status < 500 else "❌")
        logger.info(
            "%s [API RESPONSE] %s %s -> Status %d (took %.2fms)",
            status_icon, method, full_path, status, duration_ms
        )
        return response
    except Exception as exc:
        duration_ms = (time.perf_counter() - start_time) * 1000
        logger.error(
            "❌ [API ERROR] %s %s failed after %.2fms: %s",
            method, full_path, duration_ms, exc
        )
        raise

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
