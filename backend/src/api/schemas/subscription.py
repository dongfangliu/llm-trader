from pydantic import BaseModel
from typing import Optional, List

class ActivateRequest(BaseModel):
    order_id: str
    device_id: Optional[str] = None

class ActivationResponse(BaseModel):
    success: bool
    tier: str
    message: str

class FeatureItem(BaseModel):
    text: str
    tiers: List[str]

class TierConfig(BaseModel):
    daily_limit: int
    price: str = ""
    period: str = ""
    afdian_link: str = ""

class PricingResponse(BaseModel):
    features: List[FeatureItem]
    free_features: List[str] = []
    basic_features: List[str] = []
    premium_features: List[str] = []
    basic_deep_daily: int = 1
    guest: TierConfig
    free: TierConfig
    basic: TierConfig
    premium: TierConfig
