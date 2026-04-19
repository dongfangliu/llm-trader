"""Models package — imports all models so they register with Base.metadata."""

from src.models.base import Base  # noqa: F401
from src.models.user import User  # noqa: F401
from src.models.device import Device  # noqa: F401
from src.models.analysis import AnalysisRequest, AnalysisHistory  # noqa: F401
from src.models.subscription import AfdianOrder  # noqa: F401
from src.models.market import MarketBar, SymbolName  # noqa: F401
from src.models.settings import SystemSetting  # noqa: F401
from src.models.logs import UsageLog, IpUsageLog  # noqa: F401
from src.models.xbot import XBotPrediction  # noqa: F401

__all__ = [
    "Base",
    "User",
    "Device",
    "AnalysisRequest",
    "AnalysisHistory",
    "AfdianOrder",
    "MarketBar",
    "SymbolName",
    "SystemSetting",
    "UsageLog",
    "IpUsageLog",
    "XBotPrediction",
]
