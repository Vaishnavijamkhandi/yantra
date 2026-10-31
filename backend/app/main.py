from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes.assets import router as asset_router
from app.routes.vulnerabilities import router as vuln_router
from app.routes.vulnerabilities import assessment_router
from app.routes.vulnerabilities import asset_vuln_router

app = FastAPI(
    title="YantraX — Hospital Asset Management API",
    description="Phase 1 + Phase 2: Asset Inventory & Vulnerability Assessment",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(asset_router)
app.include_router(vuln_router)
app.include_router(assessment_router)
app.include_router(asset_vuln_router)


@app.get("/")
def health_check():
    return {
        "status": "running",
        "message": "YantraX Hospital Asset Management API",
        "version": "2.0.0",
        "phase": "Phase 1 + Phase 2",
        "docs": "/docs",
    }
