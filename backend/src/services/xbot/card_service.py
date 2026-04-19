"""Call the Nuxt OG card API to generate PNG image cards."""

import asyncio
import os
from typing import Optional
from loguru import logger
import httpx

from src.models.xbot import XBotPrediction

# Nuxt frontend URL (internal Docker networking)
_FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://frontend:3000")
_CARD_ENDPOINT = f"{_FRONTEND_URL}/api/og/card"

_DIRECTION_LABELS = {
    "up": "看涨",
    "down": "看跌",
    "hold": "震荡",
}


async def generate_prediction_card(
    prediction: XBotPrediction,
    product_url: str = "",
    disclaimer: str = "⚠️ 仅供参考，非投资建议",
) -> Optional[bytes]:
    """Generate prediction card PNG. Returns PNG bytes or None on failure."""
    payload = {
        "type": "prediction",
        "symbol": prediction.symbol,
        "symbol_name": prediction.symbol_name,
        "market": prediction.market.upper(),
        "hot_rank": prediction.hot_rank,
        "prediction_date": str(prediction.prediction_date),
        "direction": prediction.predicted_direction,
        "confidence": prediction.confidence,
        "target_price": prediction.target_price,
        "stop_loss": prediction.stop_loss,
        "summary": prediction.analysis_summary or "",
        "market_diagnosis": prediction.market_diagnosis or "",
        "opportunity_assessment": prediction.opportunity_assessment or "",
        "risk_analysis": prediction.risk_analysis or "",
        "execution_plan": prediction.execution_plan or "",
        "product_url": product_url,
        "disclaimer": disclaimer,
    }
    return await _post_card(payload)


async def generate_result_card(
    prediction: XBotPrediction,
    accuracy_7d: str,
    accuracy_30d: str,
    product_url: str = "",
) -> Optional[bytes]:
    """Generate result card PNG. Returns PNG bytes or None on failure."""
    payload = {
        "type": "result",
        "symbol": prediction.symbol,
        "symbol_name": prediction.symbol_name,
        "market": prediction.market.upper(),
        "hot_rank": prediction.hot_rank,
        "prediction_date": str(prediction.prediction_date),
        "target_date": str(prediction.target_date),
        "predicted_direction": prediction.predicted_direction,
        "confidence": prediction.confidence,
        "actual_change_pct": prediction.actual_change_pct,
        "is_correct": prediction.is_correct,
        "accuracy_7d": accuracy_7d,
        "accuracy_30d": accuracy_30d,
        "product_url": product_url,
    }
    return await _post_card(payload)


async def generate_prediction_card_set(
    prediction: XBotPrediction,
    product_url: str = "",
    disclaimer: str = "⚠️ 仅供参考，非投资建议",
    accuracy_7d: str = "—",
    accuracy_7d_pct: int = 0,
) -> dict:
    """Concurrently generate 5 cards: promise + data×4. Returns dict keyed by variant name."""
    base = {
        "symbol": prediction.symbol,
        "symbol_name": prediction.symbol_name,
        "market": prediction.market.upper(),
        "hot_rank": prediction.hot_rank,
        "prediction_date": str(prediction.prediction_date),
        "target_date": str(prediction.target_date) if prediction.target_date else None,
        "direction": prediction.predicted_direction,
        "confidence": prediction.confidence,
        "close_price": prediction.close_price,
        "target_price": prediction.target_price,
        "stop_loss": prediction.stop_loss,
        "accuracy_7d": accuracy_7d,
        "accuracy_7d_pct": accuracy_7d_pct,
        "product_url": product_url,
    }
    variants = ["promise", "data_conf", "data_price", "data_heat", "data_record"]
    results = await asyncio.gather(*[
        _post_card({**base, "variant": v}) for v in variants
    ], return_exceptions=True)
    return {
        k: (r if isinstance(r, bytes) else None)
        for k, r in zip(variants, results)
    }


async def generate_result_card_set(
    prediction: XBotPrediction,
    accuracy_7d: str = "—",
    accuracy_7d_pct: int = 0,
    accuracy_30d: str = "—",
    product_url: str = "",
) -> dict:
    """Concurrently generate 5 cards: proof + data×4. Returns dict keyed by variant name."""
    base = {
        "symbol": prediction.symbol,
        "symbol_name": prediction.symbol_name,
        "market": prediction.market.upper(),
        "hot_rank": prediction.hot_rank,
        "prediction_date": str(prediction.prediction_date),
        "target_date": str(prediction.target_date) if prediction.target_date else None,
        "direction": prediction.predicted_direction,
        "predicted_direction": prediction.predicted_direction,
        "confidence": prediction.confidence,
        "close_price": prediction.close_price,
        "target_price": prediction.target_price,
        "stop_loss": prediction.stop_loss,
        "actual_change_pct": prediction.actual_change_pct,
        "is_correct": prediction.is_correct,
        "accuracy_7d": accuracy_7d,
        "accuracy_7d_pct": accuracy_7d_pct,
        "accuracy_30d": accuracy_30d,
        "product_url": product_url,
    }
    variants = ["proof", "data_conf", "data_price", "data_heat", "data_record"]
    results = await asyncio.gather(*[
        _post_card({**base, "variant": v}) for v in variants
    ], return_exceptions=True)
    return {
        k: (r if isinstance(r, bytes) else None)
        for k, r in zip(variants, results)
    }


async def _post_card(payload: dict) -> Optional[bytes]:
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(_CARD_ENDPOINT, json=payload)
            resp.raise_for_status()
            return resp.content
    except httpx.HTTPStatusError as e:
        logger.error(f"Card API HTTP error {e.response.status_code}: {e.response.text[:200]}")
        return None
    except Exception as e:
        logger.error(f"Card generation failed: {e}")
        return None
