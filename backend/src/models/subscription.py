"""Afdian order / subscription model."""

from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime

from src.models.base import Base


class AfdianOrder(Base):
    """Tracks processed Afdian orders to prevent double-activation."""

    __tablename__ = "afdian_orders"

    id = Column(Integer, primary_key=True, index=True)
    out_trade_no = Column(String(255), nullable=False, unique=True, index=True)
    device_id = Column(String(255), nullable=False, index=True)
    plan_id = Column(String(255), nullable=True)
    tier = Column(String(50), nullable=False)
    total_amount = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
