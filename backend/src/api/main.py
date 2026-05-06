"""Compatibility entry point for tests and legacy imports."""

from src.api.main_v2 import app
from src.api.routers.admin import AdminSetQuotaRequest

__all__ = ["app", "AdminSetQuotaRequest"]
