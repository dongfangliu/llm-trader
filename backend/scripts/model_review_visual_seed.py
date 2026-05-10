"""Seed deterministic model-review records for local Playwright visual checks.

This script is intentionally guarded. It only runs when
MODEL_REVIEW_VISUAL_SEED=1 is present in the process environment.
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
from datetime import date, datetime, timedelta

from sqlalchemy import delete

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from src.database.new_db import async_session, init_db
from src.models.xbot import XBotPrediction


SEED_SYMBOLS = ("VSPEND", "VSAWAIT", "VSHIT", "VSMISS")


def _guard() -> None:
    if os.getenv("MODEL_REVIEW_VISUAL_SEED") != "1":
        raise SystemExit("Refusing to run without MODEL_REVIEW_VISUAL_SEED=1")


def _analysis(name: str, direction: str) -> dict:
    direction_text = "上行" if direction == "up" else "回落" if direction == "down" else "震荡"
    return {
        "analysis_summary": f"{name} 量价结构清晰，短线资金延续度较高，模型判断下一交易日偏{direction_text}，需按计划观察目标价和止损价。",
        "market_diagnosis": f"{name} 当前处在明确的技术面观察窗口，成交额变化与均线位置形成可追踪的短线结构。",
        "opportunity_assessment": f"若价格维持在关键均线附近，方向判断具备执行条件；若开盘快速偏离，需要降低仓位假设。",
        "risk_analysis": "主要风险来自盘中量能衰减、指数同步走弱和高开后的获利回吐，止损价用于限制错误判断的影响。",
        "execution_plan": "仅记录模型当时判断，不构成投资建议。目标日收盘后按实际涨跌自动结算，并保留原始分析文本。",
    }


def _record(
    *,
    symbol: str,
    market: str,
    name: str,
    hot_rank: int,
    prediction_date: date,
    target_date: date,
    direction: str,
    confidence: float,
    close_price: float,
    target_price: float,
    stop_loss: float,
    status: str,
    actual_close: float | None = None,
    actual_change_pct: float | None = None,
    is_correct: bool | None = None,
) -> XBotPrediction:
    return XBotPrediction(
        symbol=symbol,
        market=market,
        symbol_name=name,
        hot_rank=hot_rank,
        prediction_date=prediction_date,
        target_date=target_date,
        predicted_direction=direction,
        confidence=confidence,
        close_price=close_price,
        target_price=target_price,
        stop_loss=stop_loss,
        status=status,
        actual_close=actual_close,
        actual_change_pct=actual_change_pct,
        is_correct=is_correct,
        likes_count=0,
        retweets_count=0,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
        **_analysis(name, direction),
    )


async def cleanup() -> dict:
    _guard()
    await init_db()
    async with async_session() as db:
        result = await db.execute(delete(XBotPrediction).where(XBotPrediction.symbol.in_(SEED_SYMBOLS)))
        await db.commit()
        return {"deleted": result.rowcount or 0}


async def seed() -> dict:
    _guard()
    await cleanup()
    today = date.today()
    rows = [
        _record(
            symbol="VSPEND",
            market="a",
            name="澜石科技",
            hot_rank=1,
            prediction_date=today,
            target_date=today + timedelta(days=1),
            direction="up",
            confidence=78.0,
            close_price=42.18,
            target_price=45.60,
            stop_loss=40.25,
            status="pending",
        ),
        _record(
            symbol="VSAWAIT",
            market="hk",
            name="远衡控股",
            hot_rank=2,
            prediction_date=today,
            target_date=today + timedelta(days=1),
            direction="down",
            confidence=64.0,
            close_price=18.72,
            target_price=17.40,
            stop_loss=19.30,
            status="approved",
        ),
        _record(
            symbol="VSHIT",
            market="a",
            name="青岭能源",
            hot_rank=3,
            prediction_date=today - timedelta(days=3),
            target_date=today - timedelta(days=2),
            direction="up",
            confidence=81.0,
            close_price=12.35,
            target_price=13.10,
            stop_loss=11.82,
            status="settled",
            actual_close=13.22,
            actual_change_pct=7.04,
            is_correct=True,
        ),
        _record(
            symbol="VSMISS",
            market="hk",
            name="澄港智能",
            hot_rank=4,
            prediction_date=today - timedelta(days=4),
            target_date=today - timedelta(days=3),
            direction="up",
            confidence=69.0,
            close_price=7.82,
            target_price=8.31,
            stop_loss=7.45,
            status="settled",
            actual_close=7.58,
            actual_change_pct=-3.07,
            is_correct=False,
        ),
    ]

    async with async_session() as db:
        db.add_all(rows)
        await db.flush()
        payload = {
            "today": str(today),
            "records": [
                {
                    "id": row.id,
                    "symbol": row.symbol,
                    "market": row.market,
                    "status": row.status,
                    "prediction_date": str(row.prediction_date),
                    "admin_path": f"/admin/model-review/{row.id}",
                    "public_detail_path": f"/research/{row.market}/{row.symbol}/{row.prediction_date}",
                    "public_symbol_path": f"/research/{row.market}/{row.symbol}",
                }
                for row in rows
            ],
        }
        await db.commit()
        return payload


async def main() -> None:
    command = sys.argv[1] if len(sys.argv) > 1 else "seed"
    if command == "seed":
        result = await seed()
    elif command == "cleanup":
        result = await cleanup()
    else:
        raise SystemExit("Usage: model_review_visual_seed.py [seed|cleanup]")
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    asyncio.run(main())
