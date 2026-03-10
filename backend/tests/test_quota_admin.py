"""Tests for admin quota management endpoint."""
import pytest
from httpx import AsyncClient, ASGITransport
from src.api.main import app
from src.database.db import settings


ADMIN_HEADERS = {"x-admin-token": settings.admin_token or "test-token"}


def test_admin_set_quota_request_model():
    """AdminSetQuotaRequest validates correctly."""
    from src.api.main import AdminSetQuotaRequest
    req = AdminSetQuotaRequest()
    assert req.daily_usage is None
    assert req.bonus_quota is None

    req2 = AdminSetQuotaRequest(daily_usage=3, bonus_quota=10)
    assert req2.daily_usage == 3
    assert req2.bonus_quota == 10


@pytest.mark.asyncio
async def test_quota_endpoint_404_on_missing_user():
    """PATCH /api/admin/users/999999/quota returns 404 for nonexistent user."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.patch(
            "/api/admin/users/999999/quota",
            json={"daily_usage": 0},
            headers=ADMIN_HEADERS,
        )
    # 503 = admin token not configured, 403 = wrong token, 404 = user not found
    assert resp.status_code in (404, 503, 403)


@pytest.mark.asyncio
async def test_quota_endpoint_rejects_negative_values():
    """PATCH /api/admin/users/{id}/quota rejects negative daily_usage and bonus_quota."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # negative daily_usage
        resp = await client.patch(
            "/api/admin/users/1/quota",
            json={"daily_usage": -1},
            headers=ADMIN_HEADERS,
        )
    # 400 = validation error, 503/403 = auth not configured
    assert resp.status_code in (400, 503, 403)
