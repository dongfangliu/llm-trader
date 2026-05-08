from datetime import date

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from src.api.routers.xbot import (
    public_list_predictions,
    public_research_card,
    public_research_detail,
    public_research_symbol,
)
from src.models.settings import SystemSetting
from src.models.xbot import XBotPrediction
from src.services.xbot.result_service import get_accuracy_stats


PREDICTION_DATE = date(2026, 5, 7)
TARGET_DATE = date(2026, 5, 8)


def _prediction(
    symbol: str,
    status: str,
    hot_rank: int,
    *,
    actual_close: float | None = None,
    actual_change_pct: float | None = None,
    is_correct: bool | None = None,
) -> XBotPrediction:
    return XBotPrediction(
        symbol=symbol,
        market="a",
        symbol_name=f"{symbol} Corp",
        hot_rank=hot_rank,
        prediction_date=PREDICTION_DATE,
        target_date=TARGET_DATE,
        predicted_direction="up",
        confidence=82.0,
        close_price=10.0,
        target_price=11.5,
        stop_loss=9.2,
        analysis_summary="技术面趋势保持强势，量价配合仍需观察。",
        market_diagnosis="市场诊断内容",
        opportunity_assessment="机会评估内容",
        risk_analysis="风险分析内容",
        execution_plan="执行计划内容",
        status=status,
        actual_close=actual_close,
        actual_change_pct=actual_change_pct,
        is_correct=is_correct,
    )


@pytest.fixture
async def db_session():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(SystemSetting.__table__.create)
        await conn.run_sync(XBotPrediction.__table__.create)

    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as session:
        session.add_all([
            _prediction("AAA", "approved", 1),
            _prediction("BBB", "posted", 2),
            _prediction("CCC", "settled", 3, actual_close=11.0, actual_change_pct=10.0, is_correct=True),
            _prediction("DDD", "pending", 4),
            _prediction("EEE", "rejected", 5),
            _prediction("FFF", "approved", 6, actual_close=12.0, actual_change_pct=20.0, is_correct=True),
        ])
        await session.commit()
        yield session

    await engine.dispose()


@pytest.mark.asyncio
async def test_public_research_list_and_symbol_page_only_show_public_statuses(db_session):
    response = await public_list_predictions(limit=20, db=db_session)
    symbols = {item["symbol"] for item in response["predictions"]}

    assert symbols == {"AAA", "BBB", "CCC", "FFF"}
    assert response["accuracy"]["total"] == 1
    assert response["accuracy"]["correct"] == 1

    symbol_response = await public_research_symbol("a", "aaa", limit=20, db=db_session)
    assert [item["status"] for item in symbol_response["records"]] == ["approved"]


@pytest.mark.asyncio
async def test_public_research_detail_allows_public_statuses_and_hides_internal_statuses(db_session):
    for symbol, status in (("AAA", "approved"), ("BBB", "posted"), ("CCC", "settled")):
        response = await public_research_detail("a", symbol, str(PREDICTION_DATE), db=db_session)
        assert response["record"]["symbol"] == symbol
        assert response["record"]["status"] == status

    approved = await public_research_detail("a", "AAA", str(PREDICTION_DATE), db=db_session)
    assert approved["record"]["actual_close"] is None
    assert approved["record"]["actual_change_pct"] is None
    assert approved["record"]["is_correct"] is None

    for symbol in ("DDD", "EEE"):
        with pytest.raises(HTTPException) as exc:
            await public_research_detail("a", symbol, str(PREDICTION_DATE), db=db_session)
        assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_public_research_card_allows_unsettled_promise_but_not_proof(monkeypatch, db_session):
    async def fake_prediction_card_set(*args, **kwargs):
        return {"promise": b"promise-card"}

    async def fake_result_card_set(*args, **kwargs):
        return {"proof": b"proof-card"}

    monkeypatch.setattr(
        "src.services.xbot.card_service.generate_prediction_card_set",
        fake_prediction_card_set,
    )
    monkeypatch.setattr(
        "src.services.xbot.card_service.generate_result_card_set",
        fake_result_card_set,
    )

    promise = await public_research_card("a", "AAA", str(PREDICTION_DATE), variant="promise", db=db_session)
    assert promise.body == b"promise-card"

    with pytest.raises(HTTPException) as exc:
        await public_research_card("a", "AAA", str(PREDICTION_DATE), variant="proof", db=db_session)
    assert exc.value.status_code == 404
    assert exc.value.detail == "卡片暂不可用"

    settled_proof = await public_research_card("a", "CCC", str(PREDICTION_DATE), variant="proof", db=db_session)
    assert settled_proof.body == b"proof-card"


@pytest.mark.asyncio
async def test_accuracy_stats_only_count_settled_predictions(db_session):
    stats = await get_accuracy_stats(db_session)

    assert stats["all"]["total"] == 1
    assert stats["all"]["correct"] == 1
    assert stats["all"]["label"] == "1/1"
