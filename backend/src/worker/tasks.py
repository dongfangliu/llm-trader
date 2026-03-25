"""arq task definitions — runs in the worker process."""
import copy
import json
import hashlib
import logging
import re
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


def _build_position_advice(
    action: str,
    current_price: float,
    holding_quantity,
    cost_price,
    max_position,
) -> dict:
    quantity = holding_quantity or 0
    if not max_position or max_position <= 0:
        max_position = quantity if quantity > 0 else None
    ratio = (quantity / max_position) if max_position else None

    if ratio is not None and ratio >= 0.85:
        suggested_action = "sell"
        suggested_quantity = max(1, int(quantity * 0.25)) if quantity > 0 else 0
        reason = "仓位已接近上限，建议适度减仓控制风险"
    elif action == "buy" and quantity > 0 and ratio is not None and ratio < 0.5:
        suggested_action = "buy"
        suggested_quantity = max(1, int((max_position - quantity) * 0.2)) if max_position else max(1, int(quantity * 0.2))
        reason = "当前仓位偏低，可按计划小幅加仓"
    elif action == "sell" and quantity > 0:
        suggested_action = "sell"
        suggested_quantity = max(1, int(quantity * 0.2))
        reason = "信号偏弱，建议分批减仓"
    else:
        suggested_action = "hold"
        suggested_quantity = 0
        reason = "仓位与信号匹配，继续观察"

    return {
        "current_holding": quantity,
        "cost_price": cost_price,
        "max_position": max_position,
        "suggested_action": suggested_action,
        "suggested_quantity": suggested_quantity,
        "reason": reason,
        "current_price": current_price,
    }


def _normalize_result(
    raw_result: dict,
    current_price: float,
    holding_quantity=None,
    cost_price=None,
    max_position=None,
) -> dict:
    """Inline equivalent of main.py _normalize_result (no req object needed)."""
    action = (raw_result or {}).get("action")
    signal = (raw_result or {}).get("signal", "neutral")
    action_map = {
        "buy": "buy",
        "sell": "sell",
        "hold": "hold",
        "open_long": "buy",
        "close_long": "sell",
        "open_short": "sell",
        "close_short": "buy",
    }
    action = action_map.get(str(action).lower(), action)
    if action == "adjust_position":
        target_position = int((raw_result or {}).get("target_position", holding_quantity) or 0)
        action = "buy" if target_position > int(holding_quantity or 0) else (
            "sell" if target_position < int(holding_quantity or 0) else "hold"
        )
    if action not in {"buy", "sell", "hold"}:
        action = {"bullish": "buy", "bearish": "sell", "neutral": "hold"}.get(signal, "hold")
    confidence_raw = float((raw_result or {}).get("confidence", 50))
    confidence = int(confidence_raw if confidence_raw > 1 else confidence_raw * 100)
    target_price = (
        (raw_result or {}).get("target_price")
        or (raw_result or {}).get("take_profit")
        or (raw_result or {}).get("entry_price")
        or current_price
    )
    stop_loss = (raw_result or {}).get("stop_loss") or current_price * 0.97
    reasons = []
    if isinstance((raw_result or {}).get("reasons"), list):
        reasons.extend([str(x) for x in (raw_result or {}).get("reasons", []) if x])
    if (raw_result or {}).get("analysis"):
        reasons.append((raw_result or {}).get("analysis"))
    if (raw_result or {}).get("reasoning"):
        reasons.append((raw_result or {}).get("reasoning"))
    if (raw_result or {}).get("market_diagnosis"):
        reasons.append((raw_result or {}).get("market_diagnosis"))
    if (raw_result or {}).get("opportunity_assessment"):
        reasons.append((raw_result or {}).get("opportunity_assessment"))
    if (raw_result or {}).get("risk_analysis"):
        reasons.append((raw_result or {}).get("risk_analysis"))
    if (raw_result or {}).get("execution_plan"):
        reasons.append((raw_result or {}).get("execution_plan"))
    position_advice = _build_position_advice(action, current_price, holding_quantity, cost_price, max_position)
    return {
        "action": action,
        "signal": signal,
        "confidence": confidence,
        "target_price": float(target_price),
        "stop_loss": float(stop_loss),
        "reason": reasons[0] if reasons else "基于技术指标综合判断",
        "reasons": reasons[:6] if reasons else ["基于技术指标综合判断"],
        "market_diagnosis": str((raw_result or {}).get("market_diagnosis", "") or ""),
        "opportunity_assessment": str((raw_result or {}).get("opportunity_assessment", "") or ""),
        "risk_analysis": str((raw_result or {}).get("risk_analysis", "") or ""),
        "execution_plan": str((raw_result or {}).get("execution_plan", "") or ""),
        "opportunity_quality": str((raw_result or {}).get("opportunity_quality", "") or ""),
        "risk_factors": [str(x) for x in ((raw_result or {}).get("risk_factors") or []) if x],
        "position_advice": position_advice,
    }


def _mask_result_for_free_tier(result: dict) -> dict:
    """Mask specific numeric fields for free-tier users."""
    masked = copy.deepcopy(result)

    def mask_prices(text: str) -> str:
        text = re.sub(r'\b\d+\.\d+\b', '██', str(text))
        text = re.sub(r'\b[1-9]\d{2,}\b', '██', text)
        return text

    masked["target_price"] = None
    masked["stop_loss"] = None
    masked["confidence"] = None
    masked["risk_analysis"] = mask_prices(masked.get("risk_analysis", ""))
    masked["execution_plan"] = mask_prices(masked.get("execution_plan", ""))
    reasons = masked.get("reasons", [])
    if len(reasons) > 2:
        masked["reasons"] = reasons[:2] + ["████████（升级解锁完整研判）"]
    masked["reason"] = masked["reasons"][0] if masked["reasons"] else masked.get("reason", "")
    masked["_masked"] = True
    return masked


async def _save_analysis_history_in_worker(
    symbol: str,
    market: str,
    period: str,
    result_payload: dict,
    user_id: Optional[int],
    device_id: Optional[str],
    is_pro_trial: bool = False,
) -> None:
    """Save analysis history to DB using a fresh async session."""
    from src.database.db import async_session, AnalysisHistory
    analyzed_at = datetime.utcnow()
    history = AnalysisHistory(
        user_id=user_id,
        device_id=(device_id or "").strip() or None,
        symbol=symbol,
        market=market,
        period=period,
        result=json.dumps(result_payload, ensure_ascii=False),
        analysis_date=analyzed_at.date(),
        analyzed_at=analyzed_at,
        is_pro_trial=is_pro_trial,
    )
    async with async_session() as db:
        db.add(history)
        await db.commit()


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
    subscription: str = "free",
    usage_mode: str = "device",
    user_id: Optional[int] = None,
    device_id: Optional[str] = None,
    ohlcv_bars: Optional[list] = None,
    is_pro_trial: bool = False,
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
            # Apply free-tier masking even on cache hits
            # cached_result["result"] is the full api_result envelope; mask inner "result" field
            if subscription == "free" and "result" in cached_result:
                cached_envelope = cached_result["result"]
                if isinstance(cached_envelope, dict) and "result" in cached_envelope:
                    import copy as _copy
                    cached_envelope = _copy.deepcopy(cached_envelope)
                    cached_envelope["result"] = _mask_result_for_free_tier(cached_envelope["result"])
                    cached_result = dict(cached_result)
                    cached_result["result"] = cached_envelope
                else:
                    # Legacy flat shape fallback
                    cached_result["result"] = _mask_result_for_free_tier(cached_result["result"])
            payload = {"status": "done", "task_id": task_id, "cached": True, **cached_result}
            await redis.set(f"task:{task_id}", json.dumps(payload), ex=3600)
            # Save history even on cache hits so every analysis request is recorded
            try:
                await _save_analysis_history_in_worker(
                    symbol=symbol,
                    market=market,
                    period=period,
                    result_payload=cached_result.get("result", cached_result),
                    user_id=user_id,
                    device_id=device_id,
                    is_pro_trial=is_pro_trial,
                )
            except Exception as hist_err:
                logger.warning("Failed to save history on cache hit (non-fatal): %s", hist_err)
            return payload

        # --- Path A: 优先使用客户端传来的 OHLCV 数据 ---
        import asyncio
        df = None
        data_source = "akshare"  # 记录数据来源，用于日志监控

        if ohlcv_bars and len(ohlcv_bars) >= 20:
            try:
                import pandas as pd
                rows = [
                    {
                        "datetime": pd.Timestamp(b["d"]).value,
                        "open": float(b["o"]),
                        "high": float(b["h"]),
                        "low": float(b["l"]),
                        "close": float(b["c"]),
                        "volume": float(b.get("v", 0)),
                    }
                    for b in ohlcv_bars
                ]
                raw_df = pd.DataFrame(rows).sort_values("datetime").reset_index(drop=True)
                raw_df = raw_df.dropna(subset=["open", "high", "low", "close"])
                if len(raw_df) >= 20:
                    from src.services.data.data_service import _calculate_indicators, _db_write_bars
                    df = _calculate_indicators(raw_df)
                    data_source = "client"
                    logger.info(
                        "[客户端数据] %s:%s period=%s 使用客户端 %d 根K线 (任务 %s)",
                        market, symbol, period, len(df), task_id,
                    )
                    # 后台异步写入 DB，不阻塞分析
                    asyncio.ensure_future(_db_write_bars(raw_df, symbol, market, period))
                else:
                    logger.warning(
                        "[客户端数据] %s:%s 清洗后仅剩 %d 根，不足20根，降级 akshare",
                        market, symbol, len(raw_df),
                    )
            except Exception as exc:
                logger.warning(
                    "[客户端数据] %s:%s 解析失败，降级服务端拉取: %s",
                    market, symbol, exc,
                )
                df = None
        else:
            if ohlcv_bars is not None:
                logger.info(
                    "[客户端数据] %s:%s 收到 %d 根 (不足20)，降级 akshare",
                    market, symbol, len(ohlcv_bars),
                )
            else:
                logger.info("[客户端数据] %s:%s 无客户端数据，走 akshare", market, symbol)

        # --- Path B: 服务端 akshare 拉取（降级兜底）---
        if df is None or df.empty:
            from src.services.data.data_service import fetch_market_data

            df = await fetch_market_data(
                symbol=symbol,
                market=market,
                period=period,
                start_date=None,
                end_date=None,
            )
            data_source = "akshare"
            if df is not None and not df.empty:
                logger.info(
                    "[AKShare] %s:%s period=%s 拉取 %d 根K线 (任务 %s)",
                    market, symbol, period, len(df), task_id,
                )

        if df is None or df.empty:
            await _set_status("failed", error=f'未找到 "{symbol}" 的市场数据')
            return {"status": "failed", "error": f'未找到 "{symbol}" 的市场数据'}

        # --- LLM analysis ---
        from src.services.llm.llm_service import analyze_with_llm
        from src.database.db import settings as _settings

        provider = _settings.llm_provider
        api_key = _settings.llm_api_key
        base_url = _settings.llm_base_url
        model = _settings.llm_model
        max_tokens = _settings.llm_max_tokens
        temperature = _settings.llm_temperature

        result = await analyze_with_llm(
            df=df,
            symbol=symbol,
            provider=provider,
            api_key=api_key,
            base_url=base_url,
            model=model,
            max_tokens=max_tokens,
            temperature=temperature,
            user_context={
                "holding_quantity": holding_quantity,
                "cost_price": cost_price,
                "max_position": max_position,
            },
        )

        latest_price = float(df.iloc[-1]["close"])

        # --- Normalize the raw LLM result ---
        normalized = _normalize_result(
            raw_result=result,
            current_price=latest_price,
            holding_quantity=holding_quantity,
            cost_price=cost_price,
            max_position=max_position,
        )

        # --- Get symbol name for data envelope ---
        from src.services.data.name_service import get_symbol_name as _get_symbol_name
        symbol_name = await _get_symbol_name(symbol, market)

        # --- Get latest date from DataFrame index ---
        latest_date = str(df.index[-1]) if hasattr(df.index, '__len__') else str(df.iloc[-1].name)

        analyzed_at_iso = datetime.utcnow().isoformat()

        # --- Build full api_result envelope (matches synchronous endpoint shape) ---
        api_result = {
            "success": True,
            "result": normalized,
            "data": {
                "symbol": symbol,
                "name": symbol_name,
                "market": market,
                "latest_price": latest_price,
                "latest_date": latest_date,
            },
            "usage": {},  # usage is provided by the queued response, not the task
        }

        # --- Apply free-tier masking ---
        if subscription == "free":
            api_result_display = dict(api_result)
            api_result_display["result"] = _mask_result_for_free_tier(normalized)
        else:
            api_result_display = api_result

        # Store in cache (store unmasked api_result so paid users get full data on cache hit)
        from src.worker.redis_client import cache_ttl
        cache_payload = {
            "result": api_result,
            "latest_price": latest_price,
            "analyzed_at": analyzed_at_iso,
        }
        await redis.set(ck, json.dumps(cache_payload), ex=cache_ttl(period))

        # --- Save analysis history to DB ---
        try:
            await _save_analysis_history_in_worker(
                symbol=symbol,
                market=market,
                period=period,
                result_payload=api_result,
                user_id=user_id,
                device_id=device_id,
                is_pro_trial=is_pro_trial,
            )
        except Exception as hist_err:
            logger.warning("Failed to save analysis history (non-fatal): %s", hist_err)

        # --- 记录数据来源统计计数（用于管理后台监控）---
        try:
            today = datetime.utcnow().strftime("%Y-%m-%d")
            counter_key = f"stats:datasource:{data_source}:{today}"
            await redis.incr(counter_key)
            await redis.expire(counter_key, 7 * 86400)  # 保留 7 天
        except Exception:
            pass  # 统计失败不影响主流程

        # Store task result (with masking applied for the requesting user)
        done_payload = {
            "status": "done",
            "task_id": task_id,
            "cached": False,
            "result": api_result_display,
            "latest_price": latest_price,
            "analyzed_at": analyzed_at_iso,
            "data_source": data_source,  # "client" | "akshare"
        }
        await redis.set(f"task:{task_id}", json.dumps(done_payload), ex=3600)
        return done_payload

    except Exception as exc:
        logger.exception("analyze_task failed: %s", exc)
        await _set_status("failed", error=str(exc))
        return {"status": "failed", "error": str(exc)}
