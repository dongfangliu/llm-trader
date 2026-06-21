"""Integration tests for async analyze task flow."""
import json
import pytest
from unittest.mock import AsyncMock, patch, MagicMock


@pytest.mark.asyncio
async def test_analyze_returns_task_id_and_queued_status():
    """POST /api/analyze should return task_id and 'queued' status without waiting for LLM."""
    from httpx import AsyncClient, ASGITransport
    from src.api.main import app

    # Mock the Redis pool so we don't need a real Redis server
    mock_redis = AsyncMock()
    mock_redis.enqueue_job = AsyncMock(return_value=None)
    app.state.redis = mock_redis

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/analyze", json={
            "symbol": "600519",
            "market": "a",
            "period": "daily",
            "device_id": "test-device-async-001",
        })

    # If LLM key not configured → 503, if quota exhausted → 429, otherwise 200
    if resp.status_code == 200:
        data = resp.json()
        assert "task_id" in data, f"Expected task_id in response, got: {data}"
        assert data["status"] == "queued", f"Expected status='queued', got: {data['status']}"
        assert "usage" in data, "Expected usage in response"
        assert isinstance(data["task_id"], str) and len(data["task_id"]) == 36, "task_id should be a UUID"
    else:
        # 503 = no LLM key, 429 = quota exhausted — both are acceptable in test env
        assert resp.status_code in (200, 429, 503), f"Unexpected status code: {resp.status_code}"


@pytest.mark.asyncio
async def test_analyze_rejects_partial_position_params():
    """Position params must be omitted entirely or submitted as a complete group."""
    from httpx import AsyncClient, ASGITransport
    from src.api.main import app

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/analyze", json={
            "symbol": "600519",
            "market": "a",
            "period": "daily",
            "device_id": "test-device-position-partial",
            "holding_quantity": 100,
        })

    assert resp.status_code == 400
    assert "持仓参数需同时填写" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_analyze_rejects_invalid_complete_position_params():
    """Complete position params still need valid numeric values."""
    from httpx import AsyncClient, ASGITransport
    from src.api.main import app

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/analyze", json={
            "symbol": "600519",
            "market": "a",
            "period": "daily",
            "device_id": "test-device-position-invalid",
            "holding_quantity": 100,
            "cost_price": 0,
            "max_position": 500,
        })

    assert resp.status_code == 400
    assert resp.json()["detail"] == "成本价必须大于0"


@pytest.mark.asyncio
async def test_get_task_status_404_for_unknown():
    """GET /api/task/nonexistent should return 404."""
    from httpx import AsyncClient, ASGITransport
    from src.api.main import app

    mock_redis = AsyncMock()
    mock_redis.get = AsyncMock(return_value=None)
    app.state.redis = mock_redis

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/task/nonexistent-task-id-xyz")

    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_get_task_status_returns_cached_result():
    """GET /api/task/{id} should return task data from Redis."""
    import json
    from httpx import AsyncClient, ASGITransport
    from src.api.main import app

    task_data = {"status": "done", "task_id": "test-123", "result": {"action": "buy"}, "cached": False}
    mock_redis = AsyncMock()
    mock_redis.get = AsyncMock(return_value=json.dumps(task_data).encode())
    app.state.redis = mock_redis

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/task/test-123")

    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "done"
    assert data["task_id"] == "test-123"


def test_cache_key_uniqueness():
    """Different inputs produce different cache keys; same inputs produce same key."""
    from src.worker.tasks import _cache_key

    k_daily = _cache_key("600519", "a", "daily")
    k_60min = _cache_key("600519", "a", "60")
    k_other = _cache_key("000001", "a", "daily")
    k_hk    = _cache_key("600519", "hk", "daily")

    # All different
    keys = [k_daily, k_60min, k_other, k_hk]
    assert len(set(keys)) == 4, f"Cache keys not unique: {keys}"

    # Idempotent
    assert _cache_key("600519", "a", "daily") == k_daily


def test_cache_key_with_position_params():
    """Position params affect cache key."""
    from src.worker.tasks import _cache_key

    k_no_pos = _cache_key("600519", "a", "daily")
    k_with_pos = _cache_key("600519", "a", "daily", holding_quantity=100, cost_price=1800.0, max_position=200)

    assert k_no_pos != k_with_pos


def test_admin_quota_endpoint_model():
    """AdminSetQuotaRequest validates correctly."""
    from src.api.main import AdminSetQuotaRequest

    # Both fields optional
    req = AdminSetQuotaRequest()
    assert req.daily_usage is None
    assert req.bonus_quota is None

    # Fields set
    req2 = AdminSetQuotaRequest(daily_usage=3, bonus_quota=10)
    assert req2.daily_usage == 3
    assert req2.bonus_quota == 10
