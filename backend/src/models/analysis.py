"""Analysis request and history models."""

from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Date, Text

from src.models.base import Base


class AnalysisRequest(Base):
    """Analysis request log."""

    __tablename__ = "analysis_requests"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True)
    symbol = Column(String(50), nullable=False)
    market = Column(String(10), nullable=False)  # a, hk, us, futures
    period = Column(String(20), nullable=False)
    result = Column(Text, nullable=True)
    status = Column(String(20), default="pending")  # pending, completed, failed
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    error_message = Column(Text, nullable=True)


class AnalysisHistory(Base):
    """Persisted analysis history for user/device result recall."""

    __tablename__ = "analysis_histories"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=True, index=True)
    device_id = Column(String(255), nullable=True, index=True)
    symbol = Column(String(50), nullable=False, index=True)
    market = Column(String(10), nullable=False)  # a, hk, us, futures
    period = Column(String(20), nullable=False)
    result = Column(Text, nullable=False)
    analysis_date = Column(Date, nullable=False, index=True)
    analyzed_at = Column(DateTime, default=datetime.utcnow, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    is_favorited = Column(Boolean, default=False)
    is_pro_trial = Column(Boolean, default=False, nullable=False)
