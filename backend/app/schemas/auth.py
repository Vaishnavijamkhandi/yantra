from datetime import datetime
from typing import Optional, Literal
from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, description="User email address")
    password: str = Field(min_length=6, description="User password")


class UserResponse(BaseModel):
    id: int
    email: str
    full_name: str
    role: Literal["admin", "analyst"]
    is_active: bool
    last_login: Optional[datetime] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class UserCreate(BaseModel):
    email: str = Field(min_length=3)
    password: str = Field(min_length=8)
    full_name: str
    role: Literal["admin", "analyst"] = "analyst"


class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)
