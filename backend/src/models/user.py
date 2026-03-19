"""User model."""

from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text

from src.models.base import Base


class User(Base):
    """Registered user account."""

    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    openid = Column(String(255), unique=True, index=True, nullable=True)  # legacy / guest device id
    username = Column(String(100), nullable=True)
    email = Column(String(255), unique=True, index=True, nullable=True)
    hashed_password = Column(String(255), nullable=True)
    subscription_tier = Column(String(50), default="free")  # free, basic, premium
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Usage tracking
    daily_usage = Column(Integer, default=0)
    last_usage_date = Column(DateTime, default=datetime.utcnow)

    # User API Key (encrypted storage)
    api_key = Column(Text, nullable=True)

    # Email verification
    email_verified = Column(Boolean, default=False)
    email_verification_token = Column(String(255), nullable=True, index=True)
    email_verification_expires = Column(DateTime, nullable=True)

    # Invite & bonus
    invite_code = Column(String(16), nullable=True, unique=True, index=True)
    bonus_quota = Column(Integer, default=0)
    used_invite_code = Column(String(16), nullable=True)  # non-null = already redeemed once
    has_had_pro_trial = Column(Boolean, default=False, nullable=False)
    is_banned = Column(Boolean, default=False, nullable=False)

    # Position analysis tracking (basic tier daily limit)
    daily_position_usage = Column(Integer, default=0)
    last_position_date = Column(DateTime, nullable=True)

    # Subscription expiry for account-linked paid tiers (set when activating Afdian order)
    subscription_expires_at = Column(DateTime, nullable=True)

    # Device linking — last device_id used to log in
    last_device_id = Column(String(255), nullable=True)

    # Admin flag (new column added in rewrite)
    is_admin = Column(Boolean, default=False)
