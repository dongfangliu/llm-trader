from pydantic import BaseModel
from typing import Optional
from enum import Enum

class TierEnum(str, Enum):
    free = "free"
    basic = "basic"
    premium = "premium"

class TrialStateEnum(str, Enum):
    available = "available"
    active = "active"
    expired = "expired"
    not_eligible = "not_eligible"

class RegisterRequest(BaseModel):
    email: str  # use str not EmailStr to avoid extra dependency
    password: str  # min 6 chars (validated in service)
    username: Optional[str] = None
    invite_code: Optional[str] = None
    device_id: Optional[str] = None

class LoginRequest(BaseModel):
    email: str
    password: str
    device_id: Optional[str] = None

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserOut"

class UserOut(BaseModel):
    id: int
    email: str
    is_verified: bool
    tier: str
    trial_state: str  # "available", "expired", "not_eligible"
    has_had_pro_trial: bool
    is_admin: bool
    bonus_quota: int = 0
    invite_code: Optional[str] = None
    used_invite_code: Optional[str] = None

    class Config:
        from_attributes = True

class VerifyEmailRequest(BaseModel):
    token: str

class ResendVerificationRequest(BaseModel):
    email: str

# Fix forward ref
TokenResponse.model_rebuild()
