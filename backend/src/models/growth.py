"""Growth and conversion event models."""

from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String, Text

from src.models.base import Base


class GrowthEvent(Base):
    """Append-only product funnel event.

    The payload column is stored as JSON text to keep the model portable across
    the project's SQLite and Postgres deployments.
    """

    __tablename__ = "growth_events"

    id = Column(Integer, primary_key=True, index=True)
    event_name = Column(String(80), nullable=False, index=True)
    session_id = Column(String(80), nullable=True, index=True)
    device_id = Column(String(255), nullable=True, index=True)
    user_id = Column(Integer, nullable=True, index=True)
    path = Column(String(500), nullable=True)
    landing_path = Column(String(500), nullable=True, index=True)
    referrer = Column(String(500), nullable=True)
    source = Column(String(80), nullable=True, index=True)
    market = Column(String(20), nullable=True, index=True)
    symbol = Column(String(50), nullable=True, index=True)
    payload = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
