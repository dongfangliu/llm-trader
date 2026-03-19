from pydantic import BaseModel
from typing import Optional, List, Any

class AdminUserOut(BaseModel):
    id: int
    email: str
    subscription_tier: str
    is_active: bool
    is_admin: bool
    is_banned: bool
    has_had_pro_trial: bool
    bonus_quota: int
    daily_usage: int
    daily_limit: int
    daily_remaining: int
    total_available: int
    created_at: str
    subscription_expires_at: Optional[str] = None

    class Config:
        from_attributes = True

class AdminUserListResponse(BaseModel):
    users: List[AdminUserOut]
    total: int
    page: int
    per_page: int

class AdminUserUpdate(BaseModel):
    subscription_tier: Optional[str] = None
    is_banned: Optional[bool] = None
    is_admin: Optional[bool] = None
    bonus_quota: Optional[int] = None
    daily_usage: Optional[int] = None

class SystemSettingUpdate(BaseModel):
    value: Any  # JSON value

class AdminDeviceOut(BaseModel):
    device_id: str
    subscription_tier: str
    has_had_pro_trial: bool
    is_banned: bool
    created_at: str
    expires_at: Optional[str] = None
