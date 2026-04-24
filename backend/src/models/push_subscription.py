"""Web Push subscription model."""

from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, Text

from src.models.base import Base


class PushSubscription(Base):
    """Stores browser Web Push subscriptions (one row per endpoint)."""

    __tablename__ = "push_subscriptions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    endpoint = Column(Text, unique=True, nullable=False)
    p256dh = Column(Text, nullable=False)
    auth = Column(String(256), nullable=False)
    user_agent = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
