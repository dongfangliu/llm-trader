from pydantic import BaseModel
from typing import Optional, List

class ActivateRequest(BaseModel):
    order_id: str
    device_id: Optional[str] = None

class ActivationResponse(BaseModel):
    success: bool
    tier: str
    message: str

class PricingPlan(BaseModel):
    id: str
    name: str
    price: str
    period: str
    daily_limit: int
    tier: str
    features: List[str]
    afdian_link: str = ""
    is_recommended: bool = False

class PricingResponse(BaseModel):
    plans: List[PricingPlan]
    period: str
