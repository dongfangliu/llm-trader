from datetime import date

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from src.models.xbot import XBotPrediction
from src.services.xbot.result_service import (
    _apply_settlement,
    settle_prediction_items_with_prices,
    settlement_display_fields,
)


def _prediction(
    *,
    symbol: str = "HOLD1",
    target_date: date = date(2026, 5, 8),
    direction: str = "hold",
    status: str = "approved",
    close_price: float = 100.0,
    target_price: float | None = 103.0,
    stop_loss: float | None = 97.0,
) -> XBotPrediction:
    return XBotPrediction(
        symbol=symbol,
        market="a",
        symbol_name=f"{symbol} Corp",
        hot_rank=1,
        prediction_date=date(2026, 5, 7),
        target_date=target_date,
        predicted_direction=direction,
        confidence=82.0,
        close_price=close_price,
        target_price=target_price,
        stop_loss=stop_loss,
        analysis_summary="技术面震荡，按收盘区间验证。",
        status=status,
    )


def test_hold_settlement_uses_close_band_not_intraday_wicks():
    pred = _prediction()

    assert _apply_settlement(pred, 100.2, high=108.0, low=92.0) is True

    assert pred.is_correct is True
    assert pred.actual_change_pct == 0.2
    fields = settlement_display_fields(pred)
    assert fields["settlement_verdict_label"] == "区间命中"
    assert fields["settlement_rule_label"] == "收盘区间"
    assert fields["settlement_band_low"] == 97.0
    assert fields["settlement_band_high"] == 103.0


def test_hold_settlement_includes_band_edges():
    low_edge = _prediction()
    high_edge = _prediction()

    _apply_settlement(low_edge, 97.0)
    _apply_settlement(high_edge, 103.0)

    assert low_edge.is_correct is True
    assert high_edge.is_correct is True


def test_hold_settlement_miss_when_close_leaves_band():
    pred = _prediction()

    _apply_settlement(pred, 103.01)

    assert pred.is_correct is False
    fields = settlement_display_fields(pred)
    assert fields["settlement_verdict_label"] == "区间失效"


def test_hold_settlement_falls_back_to_two_percent_band():
    pred = _prediction(target_price=None, stop_loss=None)

    _apply_settlement(pred, 101.99)
    assert pred.is_correct is True

    _apply_settlement(pred, 102.01)
    assert pred.is_correct is False


@pytest.fixture
async def db_session():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(XBotPrediction.__table__.create)

    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as session:
        yield session

    await engine.dispose()


@pytest.mark.asyncio
async def test_explicit_batch_resettlement_matches_by_id(db_session):
    older = _prediction(symbol="DUPL", target_date=date(2026, 5, 8), status="settled")
    newer = _prediction(symbol="DUPL", target_date=date(2026, 5, 11), status="settled")
    db_session.add_all([older, newer])
    await db_session.commit()
    await db_session.refresh(older)
    await db_session.refresh(newer)

    settled, missing, skipped = await settle_prediction_items_with_prices(db_session, [{
        "id": older.id,
        "market": "a",
        "symbol": "DUPL",
        "target_date": "2026-05-08",
        "close": 104.0,
    }])

    assert settled == 1
    assert missing == []
    assert skipped == []
    assert older.actual_close == 104.0
    assert older.is_correct is False
    assert newer.actual_close is None
