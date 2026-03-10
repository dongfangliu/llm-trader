"""arq task definitions — runs in the worker process."""
import json
import hashlib
import logging
from datetime import datetime
from typing import Any, Optional

from arq import ArqRedis

logger = logging.getLogger(__name__)


def _position_hash(holding_quantity, cost_price, max_position) -> str:
    key = f"{holding_quantity}:{cost_price}:{max_position}"
    return hashlib.md5(key.encode()).hexdigest()[:8]


def _cache_key(symbol: str, market: str, period: str,
               holding_quantity=None, cost_price=None, max_position=None) -> str:
    pos = _position_hash(holding_quantity, cost_price, max_position)
    return f"analysis_cache:{market}:{symbol}:{period}:{pos}"


async def analyze_task(
    ctx: dict,
    task_id: str,
    symbol: str,
    market: str,
    period: str,
    history_days: int,
    holding_quantity: Optional[float],
    cost_price: Optional[float],
    max_position: Optional[float],
    llm_config: dict,
) -> dict:
    """
    arq task: fetch market data + run LLM analysis.
    Stores result in Redis under key task:{task_id}.
    Returns the result dict.
    """
    redis: ArqRedis = ctx["redis"]

    async def _set_status(status: str, **extra):
        payload = {"status": status, "task_id": task_id, **extra}
        await redis.set(f"task:{task_id}", json.dumps(payload), ex=3600)

    await _set_status("processing")

    try:
        # --- Check cache first ---
        ck = _cache_key(symbol, market, period, holding_quantity, cost_price, max_position)
        cached_raw = await redis.get(ck)
        if cached_raw:
            logger.info("cache hit: %s", ck)
            cached_result = json.loads(cached_raw)
            payload = {"status": "done", "task_id": task_id, "cached": True, **cached_result}
            await redis.set(f"task:{task_id}", json.dumps(payload), ex=3600)
            return payload

        # --- Fetch market data ---
        # fetch_market_data is a module-level async function; no class instantiation needed.
        # It manages its own DB sessions internally.
        from src.services.data.data_service import fetch_market_data

        df = await fetch_market_data(
            symbol=symbol,
            market=market,
            period=period,
            start_date=None,
            end_date=None,
        )

        if df is None or df.empty:
            await _set_status("failed", error=f'未找到 "{symbol}" 的市场数据')
            return {"status": "failed", "error": f'未找到 "{symbol}" 的市场数据'}

        # --- LLM analysis ---
        # analyze_with_llm is a module-level async function; no class instantiation needed.
        from src.services.llm.llm_service import analyze_with_llm

        result = await analyze_with_llm(
            df=df,
            symbol=symbol,
            provider=llm_config["provider"],
            api_key=llm_config["api_key"],
            base_url=llm_config["base_url"],
            model=llm_config["model"],
            max_tokens=llm_config["max_tokens"],
            temperature=llm_config["temperature"],
            user_context={
                "holding_quantity": holding_quantity,
                "cost_price": cost_price,
                "max_position": max_position,
            },
        )

        latest_price = float(df.iloc[-1]["close"])

        # Store in cache
        from src.worker.redis_client import cache_ttl
        cache_payload = {
            "result": result,
            "latest_price": latest_price,
            "analyzed_at": datetime.utcnow().isoformat(),
        }
        await redis.set(ck, json.dumps(cache_payload), ex=cache_ttl(period))

        # Store task result
        done_payload = {
            "status": "done",
            "task_id": task_id,
            "cached": False,
            **cache_payload,
        }
        await redis.set(f"task:{task_id}", json.dumps(done_payload), ex=3600)
        return done_payload

    except Exception as exc:
        logger.exception("analyze_task failed: %s", exc)
        await _set_status("failed", error=str(exc))
        return {"status": "failed", "error": str(exc)}
