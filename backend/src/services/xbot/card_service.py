"""Call the Nuxt OG card API to generate PNG image cards."""

import asyncio
import os
from typing import Optional
from loguru import logger
import httpx

from src.models.xbot import XBotPrediction
from src.services.xbot.prediction_service import summarize_prediction

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
        "summary": summarize_prediction(prediction),
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
    accuracy_all: str,
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
        "accuracy_all": accuracy_all,
        "product_url": product_url,
    }
    return await _post_card(payload)


async def generate_prediction_card_set(
    prediction: XBotPrediction,
    product_url: str = "",
    brand_name: str = "",
    accuracy_all: str = "—",
) -> dict:
    """Concurrently generate 2 cards: promise + data_record. Returns dict keyed by variant name."""
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
        "summary": summarize_prediction(prediction),
        "accuracy_all": accuracy_all,
        "product_url": product_url,
        "brand_name": brand_name or None,
    }
    variants = ["promise", "data_record"]
    results = await asyncio.gather(*[
        _post_card({**base, "variant": v}) for v in variants
    ], return_exceptions=True)
    return {
        k: (r if isinstance(r, bytes) else None)
        for k, r in zip(variants, results)
    }


async def generate_result_card_set(
    prediction: XBotPrediction,
    accuracy_all: str = "—",
    product_url: str = "",
    brand_name: str = "",
) -> dict:
    """Concurrently generate 2 cards: proof + data_record. Returns dict keyed by variant name."""
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
        "summary": summarize_prediction(prediction),
        "actual_change_pct": prediction.actual_change_pct,
        "is_correct": prediction.is_correct,
        "accuracy_all": accuracy_all,
        "product_url": product_url,
        "brand_name": brand_name or None,
    }
    variants = ["proof", "data_record"]
    results = await asyncio.gather(*[
        _post_card({**base, "variant": v}) for v in variants
    ], return_exceptions=True)
    return {
        k: (r if isinstance(r, bytes) else None)
        for k, r in zip(variants, results)
    }


async def generate_summary_card(
    predictions: list,
    market: str,
    settle_date: str,
    accuracy_all: str = "—",
    product_url: str = "",
    brand_name: str = "",
) -> Optional[bytes]:
    """Generate a market-summary settlement card (one card for all stocks in one market).

    Args:
        predictions: List of XBotPrediction ORM objects (must all be same market, already settled)
        market: 'a' or 'hk'
        settle_date: YYYY-MM-DD string
        accuracy_all: e.g. '21/30'
        product_url: for footer
        brand_name: for footer
    """
    items = []
    for pred in predictions:
        items.append({
            "symbol": pred.symbol,
            "symbol_name": pred.symbol_name,
            "predicted_direction": pred.predicted_direction,
            "actual_change_pct": pred.actual_change_pct,
            "is_correct": pred.is_correct,
        })

    payload = {
        "variant": "summary",
        "symbol": "",
        "symbol_name": "",
        "market": market.upper(),
        "summary_market": market.upper(),
        "summary_date": settle_date,
        "prediction_date": settle_date,
        "accuracy_all": accuracy_all,
        "product_url": product_url,
        "brand_name": brand_name or None,
        "summary_items": items,
    }
    return await _post_card(payload)


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
