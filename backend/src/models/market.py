"""Market data models."""

from datetime import datetime
from sqlalchemy import Column, Integer, BigInteger, String, Float, DateTime, UniqueConstraint

from src.models.base import Base


class MarketBar(Base):
    """OHLCV bar cached from external data sources.

    The ``bar_ts`` attribute maps to the DB column named ``datetime`` so that
    SELECT results convert cleanly to the same DataFrame schema used throughout
    the codebase (datetime, open, high, low, close, volume).
    """

    __tablename__ = "market_bars"
    __table_args__ = (
        UniqueConstraint("symbol", "market", "period", "datetime", name="uq_market_bars_key"),
    )

    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String(50), nullable=False, index=True)
    market = Column(String(10), nullable=False, index=True)   # a, hk, us, futures
    period = Column(String(20), nullable=False, index=True)   # daily, 1, 5, 15, 30, 60
    # nanosecond int64 timestamp — DB column is "datetime" to match DataFrame convention
    bar_ts = Column("datetime", BigInteger, nullable=False, index=True)
    open = Column(Float, nullable=False)
    high = Column(Float, nullable=False)
    low = Column(Float, nullable=False)
    close = Column(Float, nullable=False)
    volume = Column(Float, nullable=True, default=0.0)
    fetched_at = Column(DateTime, default=datetime.utcnow)


class SymbolName(Base):
    """Persistent symbol → display-name mapping.

    Populated by name_service bulk refreshes and on-demand analyze calls so that
    names survive server restarts and are available even before AKShare bulk
    fetch completes.
    """

    __tablename__ = "symbol_names"

    symbol = Column(String(50), primary_key=True)
    market = Column(String(10), primary_key=True)
    name = Column(String(255), nullable=False, default="")
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
