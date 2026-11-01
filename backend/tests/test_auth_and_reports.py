import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi import HTTPException

from app.db.database import Base
from app.models.user import User
from app.models.asset import Asset
from app.models.gap import InfrastructureGap
from app.models.risk import RiskAssessment
from app.schemas.auth import LoginRequest, PasswordChangeRequest
from app.services.auth_service import (
    hash_password,
    verify_password,
    create_access_token,
    decode_access_token,
    seed_default_users,
)
from app.routes.auth import login, change_password
from app.services.report_service import generate_pdf_report
from app.routes.reports import get_reports_summary


@pytest.fixture
def test_db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    db = Session()
    try:
        yield db
    finally:
        db.close()


def test_password_hashing_and_verification():
    raw_pwd = "SuperSecurePassword123!"
    hashed = hash_password(raw_pwd)
    assert hashed.startswith("pbkdf2_sha256$")
    assert verify_password(raw_pwd, hashed) is True
    assert verify_password("WrongPassword!", hashed) is False


def test_seed_default_users(test_db):
    seed_default_users(test_db)
    users = test_db.query(User).all()
    assert len(users) == 2
    emails = {u.email for u in users}
    assert "admin@cybersentra.io" in emails
    assert "analyst@cybersentra.io" in emails

    admin = next(u for u in users if u.email == "admin@cybersentra.io")
    assert admin.role == "admin"
    assert verify_password("CyberSentra@Admin2026!", admin.hashed_password) is True


def test_token_creation_and_decoding():
    payload = {"sub": "42", "email": "test@cybersentra.io", "role": "analyst"}
    token = create_access_token(payload)
    decoded = decode_access_token(token)
    assert decoded["sub"] == "42"
    assert decoded["email"] == "test@cybersentra.io"
    assert decoded["role"] == "analyst"


def test_login_success(test_db):
    seed_default_users(test_db)
    req = LoginRequest(email="admin@cybersentra.io", password="CyberSentra@Admin2026!")
    res = login(req, db=test_db)
    assert res.token_type == "bearer"
    assert len(res.access_token) > 20
    assert res.user.email == "admin@cybersentra.io"
    assert res.user.role == "admin"


def test_login_invalid_credentials(test_db):
    seed_default_users(test_db)
    req = LoginRequest(email="admin@cybersentra.io", password="InvalidPassword!")
    with pytest.raises(HTTPException) as exc_info:
        login(req, db=test_db)
    assert exc_info.value.status_code == 401


def test_pdf_report_generation(test_db):
    # Seed sample assets and gaps
    asset = Asset(
        asset_name="Core Power Grid Substation Controller",
        asset_type="IoT",
        criticality="Critical",
        exposure="Internal",
        department="Power Distribution",
        environment="Production",
        ip_address="10.50.1.1",
        operating_system="VxWorks RTOS",
    )
    test_db.add(asset)
    test_db.commit()

    gap = InfrastructureGap(
        asset_id=asset.id,
        gap_title="Unmapped Industrial Communication Protocols",
        category="ICS/OT Coverage",
        gap_type="missing_ot_protocol",
        severity="HIGH",
        reason="No fieldbus telemetry",
        recommendation="Document Modbus TCP ports",
        status="Open",
        fingerprint="fp12345",
    )
    test_db.add(gap)
    test_db.commit()

    pdf_bytes = generate_pdf_report(test_db)
    assert isinstance(pdf_bytes, bytes)
    assert len(pdf_bytes) > 1000
    assert pdf_bytes.startswith(b"%PDF-")


def test_reports_summary_route(test_db):
    summary = get_reports_summary(db=test_db)
    assert summary["status"] == "ready"
    assert "PDF" in summary["report_format"]


def test_chat_copilot_route(test_db):
    from fastapi.testclient import TestClient
    from app.main import app
    client = TestClient(app)
    # 1. Normal JSON POST
    res = client.post("/api/chat", json={"message": "What is CVE-2023-20198?"})
    assert res.status_code == 200
    data = res.json()
    assert "reply" in data
    assert len(data["reply"]) > 20

    # 2. Resilient POST without json headers (ensures 422 never happens)
    res_raw = client.post("/api/chat", content=b'{"message":"Explain EPSS"}', headers={"Content-Type": "text/plain"})
    assert res_raw.status_code == 200



