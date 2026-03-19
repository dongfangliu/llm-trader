from pydantic import BaseModel
from typing import Optional, Any

class ApiError(BaseModel):
    code: str      # e.g. "trial_expired", "quota_exceeded", "device_banned"
    message: str   # user-readable description

class SuccessResponse(BaseModel):
    success: bool = True
    message: str = "OK"
