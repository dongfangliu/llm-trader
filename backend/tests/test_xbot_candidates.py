from types import SimpleNamespace

import pandas as pd
import pytest


def test_normalize_candidate_symbols():
    from src.services.xbot.hot_stocks_service import normalize_candidate_symbol

    assert normalize_candidate_symbol("SZ000066", "a") == ("a", "000066")
    assert normalize_candidate_symbol("SH601991", "a") == ("a", "601991")
    assert normalize_candidate_symbol("BJ430001", "a") == ("a", "430001")
    assert normalize_candidate_symbol("000001", "a") == ("a", "000001")
    assert normalize_candidate_symbol("HK00700", "hk") == ("hk", "00700")
    assert normalize_candidate_symbol("700", "hk") == ("hk", "00700")
    assert normalize_candidate_symbol("00700", "hk") == ("hk", "00700")


@pytest.mark.asyncio
async def test_a_share_hot_stocks_normalize_before_filter(monkeypatch):
    import sys
    from src.services.xbot.hot_stocks_service import get_hot_stocks

    df = pd.DataFrame([
        {"股票名称": "中国长城", "股票代码": "SZ000066", "最新价": 10.0},
        {"股票名称": "大唐发电", "股票代码": "SH601991", "最新价": 4.0},
        {"股票名称": "低价股", "股票代码": "SZ000001", "最新价": 1.0},
    ])
    monkeypatch.setitem(
        sys.modules,
        "akshare",
        SimpleNamespace(stock_hot_rank_em=lambda: df),
    )

    rows, diagnostics = await get_hot_stocks(count=5, min_price=5.0, with_diagnostics=True)

    assert [row["symbol"] for row in rows] == ["000066"]
    assert diagnostics["requested"] == 3
    assert diagnostics["returned"] == 1
    assert diagnostics["filtered"] == 2
    assert diagnostics["filter_reasons"]["below_min_price"] == 2


class _FakeScalars:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows


class _FakeResult:
    def __init__(self, rows):
        self._rows = rows

    def scalars(self):
        return _FakeScalars(self._rows)


class _FakeDb:
    async def get(self, model, key):
        if isinstance(key, dict) and key.get("symbol") == "000066":
            return SimpleNamespace(name="中国长城")
        return None

    async def execute(self, stmt):
        return _FakeResult([SimpleNamespace(market="a", symbol="000066", status="pending")])


@pytest.mark.asyncio
async def test_manual_candidate_uses_symbol_name_and_marks_duplicate():
    from src.api.routers.xbot import ManualCandidateRequest, add_manual_candidate

    response = await add_manual_candidate(
        body=ManualCandidateRequest(market="a", symbol="SZ000066"),
        db=_FakeDb(),
        _=True,
    )

    candidate = response["candidate"]
    assert candidate["market"] == "a"
    assert candidate["symbol"] == "000066"
    assert candidate["name"] == "中国长城"
    assert candidate["already_generated"] is True
    assert candidate["existing_status"] == "pending"
