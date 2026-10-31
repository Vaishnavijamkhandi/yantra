from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes.assets import router as asset_router

app = FastAPI(
    title="YantraX — Hospital Asset Management API",
    description="Phase 1: Asset Collection and Inventory",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(asset_router)


@app.get("/")
def health_check():
    return {
        "status": "running",
        "message": "YantraX Hospital Asset Management API",
        "version": "1.0.0",
        "docs": "/docs",
    }
