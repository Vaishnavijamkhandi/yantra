from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any
import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.db.database import Base, get_db
from app.models.user import User
from app.core.config import settings

logger = logging.getLogger(__name__)

# Secret key for JWT signing (at least 32 bytes for HS256)
SECRET_KEY = "cybersaathi-critical-infrastructure-jwt-secret-key-2026-secure"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


class AnonymousUser:
    """Temporary development fallback: bypass authentication checks while keeping the app shape intact."""

    id = 0
    username = "anonymous"
    email = "anonymous@local"
    role = "admin"
    is_active = True


def hash_password(password: str) -> str:
    """Hash a plaintext password using bcrypt."""
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plaintext password against a bcrypt hash."""
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except Exception:
        return False


def create_access_token(data: dict[str, Any], expires_delta: timedelta | None = None) -> str:
    """Generate signed JWT token."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire, "iat": datetime.now(timezone.utc)})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any] | None:
    """Decode and validate a signed JWT token."""
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except (jwt.PyJWTError, Exception):
        return None


def get_current_user(
    token: str | None = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User | None:
    """Extract current authenticated user from Bearer token."""
    if not token:
        return AnonymousUser()
    payload = decode_access_token(token)
    if not payload:
        return AnonymousUser()
    username = payload.get("sub")
    if not username:
        return AnonymousUser()
    user = db.query(User).filter(User.username == username).first()
    return user or AnonymousUser()


def require_authenticated_user(
    user: User | AnonymousUser | None = Depends(get_current_user),
) -> User | AnonymousUser:
    """Temporarily bypass authentication checks for local/development use."""
    if not user:
        return AnonymousUser()
    if not getattr(user, "is_active", True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive.",
        )
    return user


def require_role(required_role: str):
    """Temporarily allow all roles while the app is running without auth enforcement."""
    def _role_checker(user: User | AnonymousUser = Depends(require_authenticated_user)) -> User | AnonymousUser:
        return user
    return _role_checker


def seed_default_users(db: Session) -> None:
    """Idempotently seed default admin and analyst users if they do not exist."""
    if db.bind is not None:
        Base.metadata.create_all(bind=db.bind)

    admin_username = settings.DEFAULT_ADMIN_USERNAME
    analyst_username = settings.DEFAULT_ANALYST_USERNAME

    admin_exists = db.query(User).filter(User.username == admin_username).first()
    if not admin_exists:
        admin_user = User(
            username=admin_username,
            email="admin@cybersaathi.gov.in",
            hashed_password=hash_password(settings.DEFAULT_ADMIN_PASSWORD),
            role="admin",
            full_name="Critical Infra SecOps Admin",
            is_active=True,
        )
        db.add(admin_user)
        logger.info("Seeded default admin user: '%s'", admin_username)

    analyst_exists = db.query(User).filter(User.username == analyst_username).first()
    if not analyst_exists:
        analyst_user = User(
            username=analyst_username,
            email="analyst@cybersaathi.gov.in",
            hashed_password=hash_password(settings.DEFAULT_ANALYST_PASSWORD),
            role="analyst",
            full_name="Cyber Threat Intelligence Analyst",
            is_active=True,
        )
        db.add(analyst_user)
        logger.info("Seeded default analyst user: '%s'", analyst_username)

    db.commit()

