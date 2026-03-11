"""Tests for POST /api/admin/reset-all endpoint."""
import pytest
from httpx import AsyncClient, ASGITransport
from src.api.main import app
from src.database.db import settings

ADMIN_HEADERS = {"x-admin-token": settings.admin_token or "test-token"}


@pytest.mark.asyncio
async def test_reset_all_requires_admin_token():
    """POST /api/admin/reset-all returns 403/503 without valid token."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/admin/reset-all", headers={"x-admin-token": "wrong"})
    assert resp.status_code in (403, 503)


@pytest.mark.asyncio
async def test_reset_all_returns_deleted_counts():
    """POST /api/admin/reset-all succeeds and returns deleted counts dict."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/admin/reset-all", headers=ADMIN_HEADERS)
    # 503 = admin token not configured in test env, otherwise must be 200
    if resp.status_code == 503:
        pytest.skip("Admin token not configured")
    assert resp.status_code == 200
    body = resp.json()
    assert "deleted" in body
    deleted = body["deleted"]
    for key in ("users", "device_subscriptions", "analysis_requests", "analysis_history", "usage_logs"):
        assert key in deleted
        assert isinstance(deleted[key], int)
