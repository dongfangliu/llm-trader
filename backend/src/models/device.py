"""Device subscription model."""

from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime

from src.models.base import Base


class Device(Base):
    """Current subscription tier bound to a device id."""

    __tablename__ = "device_subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(String(255), nullable=False, unique=True, index=True)
    subscription_tier = Column(String(50), default="free")
    expires_at = Column(DateTime, nullable=True)  # None = free tier; set on paid activation
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    is_banned = Column(Boolean, default=False, nullable=False)
    has_had_pro_trial = Column(Boolean, default=False, nullable=False)
