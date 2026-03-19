"""Usage log models."""

from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, Date, UniqueConstraint

from src.models.base import Base


class UsageLog(Base):
    """Device usage log (privacy-first, only stores device id and counters)."""

    __tablename__ = "usage_logs"
    __table_args__ = (UniqueConstraint("device_id", "date", name="uq_usage_logs_device_date"),)

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(String(255), nullable=False, index=True)
    date = Column(Date, nullable=False, index=True)
    count = Column(Integer, default=0)
    position_count = Column(Integer, default=0)
    subscription = Column(String(50), default="free")  # free, basic, premium
    created_at = Column(DateTime, default=datetime.utcnow)


class IpUsageLog(Base):
    """IP-based daily usage counter — prevents guest quota reset via localStorage clearing."""

    __tablename__ = "ip_usage_logs"
    __table_args__ = (UniqueConstraint("ip_address", "date", name="uq_ip_usage_logs_ip_date"),)

    id = Column(Integer, primary_key=True, index=True)
    ip_address = Column(String(64), nullable=False, index=True)
    date = Column(Date, nullable=False, index=True)
    count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
