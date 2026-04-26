import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pandas as pd
import pytest


class FakeDb:
    def __init__(self, rows=None):
        self.rows = rows or {}
        self.added = []
        self.committed = False

    async def get(self, model, key):
        return self.rows.get(key)

    def add(self, row):
        self.added.append(row)
        self.rows[row.key] = row

    async def commit(self):
        self.committed = True


def test_normalize_timeout_seconds_bounds():
    from src.services.llm.llm_service import (
        DEFAULT_LLM_TIMEOUT_SECONDS,
        MAX_LLM_TIMEOUT_SECONDS,
        MIN_LLM_TIMEOUT_SECONDS,
        normalize_timeout_seconds,
    )

    assert normalize_timeout_seconds(None) == DEFAULT_LLM_TIMEOUT_SECONDS
    assert normalize_timeout_seconds("bad") == DEFAULT_LLM_TIMEOUT_SECONDS
    assert normalize_timeout_seconds(1) == MIN_LLM_TIMEOUT_SECONDS
    assert normalize_timeout_seconds(999999) == MAX_LLM_TIMEOUT_SECONDS
    assert normalize_timeout_seconds("420") == 420


def test_admin_default_settings_include_llm_timeout():
    from src.api.routers.admin import _build_default_settings
    from src.config import settings

    data = _build_default_settings()

    assert data["llm"]["timeout_seconds"] == settings.llm_timeout_seconds


@pytest.mark.asyncio
async def test_public_config_overlays_llm_timeout():
    from src.api.routers.config import get_config

    db = FakeDb({
        "llm": SimpleNamespace(value=json.dumps({"timeout_seconds": 420}))
    })

    data = await get_config(db=db)

    assert data["analyze_timeout_seconds"] == 420


@pytest.mark.asyncio
async def test_admin_update_settings_normalizes_timeout():
    from src.api.routers.admin import admin_update_settings

    db = FakeDb()

    resp = await admin_update_settings(body={"llm": {"timeout_seconds": 999999}}, db=db, _=True)

    assert resp["success"] is True
    assert db.committed is True
    saved = json.loads(db.rows["llm"].value)
    assert saved["timeout_seconds"] == 1800


@pytest.mark.asyncio
async def test_xbot_prediction_passes_timeout_to_llm():
    from src.services.xbot.prediction_service import _analyze_stock

    df = pd.DataFrame(
        [{"open": 10.0, "high": 11.0, "low": 9.5, "close": 10.5, "volume": 1000}]
    )

    with patch("src.services.data.data_service.fetch_market_data", AsyncMock(return_value=df)), \
         patch(
             "src.services.llm.llm_service.get_llm_config_from_db",
             AsyncMock(
                 return_value={
                     "provider": "openai",
                     "api_key": "test-key",
                     "base_url": "https://api.example.com/v1",
                     "model": "demo-model",
                     "max_tokens": 1024,
                     "temperature": 0.3,
                     "timeout_seconds": 420,
                     "thinking_enabled": True,
                     "thinking_effort": "max",
                 }
             ),
         ), \
         patch(
             "src.services.llm.llm_service.analyze_with_llm",
             AsyncMock(
                 return_value={
                     "action": "buy",
                     "confidence": 80,
                     "target_price": 12.0,
                     "stop_loss": 9.0,
                     "analysis": "ok",
                 }
             ),
         ) as analyze_mock:
        await _analyze_stock(
            symbol="600519",
            market="a",
            symbol_name="贵州茅台",
            hot_rank=1,
            prediction_date=pd.Timestamp("2026-04-26").date(),
            target_date=pd.Timestamp("2026-04-27").date(),
        )

    kwargs = analyze_mock.await_args.kwargs
    assert kwargs["timeout"] == 420
    assert kwargs["thinking_enabled"] is True
    assert kwargs["thinking_effort"] == "max"
