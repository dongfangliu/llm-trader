"""System settings model."""

from datetime import datetime
from sqlalchemy import Column, String, Text, DateTime

from src.models.base import Base


class SystemSetting(Base):
    """Runtime-configurable system settings stored as JSON blobs, one row per section."""

    __tablename__ = "system_settings"

    key = Column(String(128), primary_key=True)
    value = Column(Text, nullable=False, default="{}")
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
