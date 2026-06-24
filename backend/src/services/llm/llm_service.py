"""LLM service for analysis."""

from typing import Optional, Dict, Any
import json
import re
from loguru import logger

try:
    from openai import AsyncOpenAI
except ImportError:
    from openai import AsyncOpenAI

try:
    from anthropic import AsyncAnthropic
except ImportError:
    AsyncAnthropic = None


DEFAULT_LLM_TIMEOUT_SECONDS = 300
MIN_LLM_TIMEOUT_SECONDS = 30
MAX_LLM_TIMEOUT_SECONDS = 1800
WORKER_JOB_TIMEOUT_BUFFER_SECONDS = 30


# Methodology (trend-following) system prompt
METHODOLOGY_SYSTEM_PROMPT = (
    "你是一位精通趋势跟随交易体系的资深分析师，信奉「跟随趋势、不预测趋势」。"
    "你擅长用趋势斜率、均线(MA/EMA 20/60/120)排列、抵扣价、密集成交区、"
    "破线-拐头-交叉三步转折等工具研判行情。"
    "请遵循用户给出的四步决策框架进行分析，并严格只输出JSON。"
)

# Legacy (classic four-step) system prompt
LEGACY_SYSTEM_PROMPT = (
    "你是经验丰富的交易分析师。"
    "请遵循用户给出的四步决策框架进行分析，并严格只输出JSON。"
)


def normalize_timeout_seconds(value: Any) -> int:
    """Normalize timeout config to a bounded integer number of seconds."""
    try:
        timeout = int(value)
    except (TypeError, ValueError):
        timeout = DEFAULT_LLM_TIMEOUT_SECONDS
    return max(MIN_LLM_TIMEOUT_SECONDS, min(MAX_LLM_TIMEOUT_SECONDS, timeout))


async def get_llm_config_from_db(section: str = "llm") -> dict:
    """Read LLM config from admin-configured DB settings.

    Raises RuntimeError if not configured, so callers get a clear error
    rather than silently falling back to empty/env values.
    """
    import json as _json
    from src.database.db import async_session, SystemSetting

    async with async_session() as _db:
        _row = await _db.get(SystemSetting, section)
        if not _row:
            raise RuntimeError(f"LLM 未配置 (section={section})，请在管理后台 Admin → Settings 中配置")
        cfg = _json.loads(_row.value)

    if not cfg.get("api_key"):
        raise RuntimeError(f"LLM API Key 未配置 (section={section})，请在管理后台 Admin → Settings 中配置")

    return {
        "provider": cfg.get("provider", "openai"),
        "api_key": cfg["api_key"],
        "base_url": cfg.get("base_url", ""),
        "model": cfg.get("model", ""),
        "max_tokens": int(cfg.get("max_tokens", 2400)),
        "temperature": float(cfg.get("temperature", 0.7)),
        "timeout_seconds": normalize_timeout_seconds(cfg.get("timeout_seconds")),
        "thinking_enabled": bool(cfg.get("thinking_enabled", False)),
        "thinking_effort": cfg.get("thinking_effort", "high"),
    }


async def get_methodology_mode() -> str:
    """Read admin-configured analysis methodology mode ('trend' default | 'legacy')."""
    import json as _json
    from src.database.db import async_session, SystemSetting

    async with async_session() as _db:
        row = await _db.get(SystemSetting, "methodology")
    if not row:
        return "trend"
    try:
        return _json.loads(row.value).get("mode") or "trend"
    except Exception:
        return "trend"


# Defaults for model-review LLM scheduling. Kept in one place so admin defaults,
# settings overlay, and the retry loop all stay in sync.
MODEL_REVIEW_DEFAULTS = {
    "confidence_threshold": 75.0,
    "max_attempts": 3,
    "retry_temperature_step": 0.1,
}


async def get_model_review_llm_config() -> dict:
    """Read model-review LLM config, fall back to main "llm" when set to inherit.

    Always returns three scheduler fields (threshold/max_attempts/step) — those
    apply even when inheriting the base LLM provider config.
    """
    import json as _json
    from src.database.db import async_session, SystemSetting

    async with async_session() as _db:
        row = await _db.get(SystemSetting, "llm_model_review")

    overrides: dict = {}
    inherit = True
    if row:
        try:
            overrides = _json.loads(row.value) or {}
        except Exception:
            overrides = {}
        inherit = bool(overrides.get("inherit", True))

    if inherit or not overrides.get("api_key"):
        base = await get_llm_config_from_db("llm")
    else:
        base = {
            "provider": overrides.get("provider", "openai"),
            "api_key": overrides["api_key"],
            "base_url": overrides.get("base_url", ""),
            "model": overrides.get("model", ""),
            "max_tokens": int(overrides.get("max_tokens", 2400)),
            "temperature": float(overrides.get("temperature", 0.7)),
            "timeout_seconds": normalize_timeout_seconds(overrides.get("timeout_seconds")),
            "thinking_enabled": bool(overrides.get("thinking_enabled", False)),
            "thinking_effort": overrides.get("thinking_effort", "high"),
        }

    def _clamp_threshold(v) -> float:
        try:
            f = float(v)
        except (TypeError, ValueError):
            return MODEL_REVIEW_DEFAULTS["confidence_threshold"]
        return max(0.0, min(100.0, f))

    def _clamp_attempts(v) -> int:
        try:
            i = int(v)
        except (TypeError, ValueError):
            return MODEL_REVIEW_DEFAULTS["max_attempts"]
        return max(1, min(5, i))

    def _clamp_step(v) -> float:
        try:
            f = float(v)
        except (TypeError, ValueError):
            return MODEL_REVIEW_DEFAULTS["retry_temperature_step"]
        return max(0.0, min(0.5, f))

    base["confidence_threshold"] = _clamp_threshold(
        overrides.get("confidence_threshold", MODEL_REVIEW_DEFAULTS["confidence_threshold"])
    )
    base["max_attempts"] = _clamp_attempts(
        overrides.get("max_attempts", MODEL_REVIEW_DEFAULTS["max_attempts"])
    )
    base["retry_temperature_step"] = _clamp_step(
        overrides.get("retry_temperature_step", MODEL_REVIEW_DEFAULTS["retry_temperature_step"])
    )
    return base


async def analyze_with_llm(
    df,
    symbol: str = "",
    market: str = "a",
    provider: str = "openai",
    api_key: str = "",
    base_url: str = "",
    model: str = "gpt-4o-mini",
    max_tokens: int = 2000,
    temperature: float = 0.7,
    user_context: Optional[Dict[str, Any]] = None,
    timeout: float = 90.0,
    thinking_enabled: bool = False,
    thinking_effort: str = "high",
    period: str = "daily",
    higher_tf_features: Optional[Dict[str, Any]] = None,
    methodology_mode: str = "trend",
    trend_features: Optional[Dict[str, Any]] = None,
    indicators: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Analyze market data using LLM.

    Args:
        df: DataFrame with OHLCV and indicators
        provider: "openai" or "anthropic"
        api_key: API key
        base_url: Custom API base URL (for OpenAI compatible APIs)
        model: Model name
        max_tokens: Max tokens in response
        temperature: Temperature setting
        timeout: Seconds before giving up on the LLM call

    Returns:
        Analysis result dict

    Raises:
        TimeoutError: when LLM does not respond within `timeout` seconds
        RuntimeError: when LLM response cannot be parsed as JSON
        Exception: for any other LLM-level failure
    """
    if df.empty:
        raise ValueError("No market data available for analysis")

    logger.info(
        "LLM analyze start | symbol=%s market=%s provider=%s model=%s "
        "max_tokens=%d temperature=%s thinking=%s effort=%s",
        symbol, market, provider, model, max_tokens,
        temperature if not thinking_enabled else "N/A(thinking)",
        thinking_enabled, thinking_effort if thinking_enabled else "N/A",
    )

    # Dispatch by methodology mode; prefer client-computed features, fall back to server-side.
    if methodology_mode == "legacy":
        system_prompt = LEGACY_SYSTEM_PROMPT
        prompt = _build_legacy_prompt(
            df, symbol=symbol, market=market, user_context=user_context,
            indicators=indicators,
        )
    else:
        system_prompt = METHODOLOGY_SYSTEM_PROMPT
        prompt = _build_methodology_prompt(
            df, symbol=symbol, market=market, user_context=user_context,
            period=period, higher_tf_features=higher_tf_features,
            trend_features=trend_features,
        )

    # Call LLM with timeout
    try:
        import asyncio
        if provider == "anthropic":
            raw_result = await asyncio.wait_for(
                _call_anthropic(
                    api_key=api_key,
                    model=model,
                    system_prompt=system_prompt,
                    user_prompt=prompt,
                    max_tokens=max_tokens,
                    temperature=temperature,
                ),
                timeout=timeout,
            )
        else:
            # Default to OpenAI compatible
            raw_result = await asyncio.wait_for(
                _call_openai(
                    api_key=api_key,
                    base_url=base_url,
                    model=model,
                    system_prompt=system_prompt,
                    user_prompt=prompt,
                    max_tokens=max_tokens,
                    temperature=temperature,
                    thinking_enabled=thinking_enabled,
                    thinking_effort=thinking_effort,
                ),
                timeout=timeout,
            )
    except asyncio.TimeoutError:
        logger.error("LLM analysis timed out after %.0fs for symbol=%s", timeout, symbol)
        raise TimeoutError(f"LLM 响应超时（>{timeout:.0f}秒），请稍后重试")
    except Exception as e:
        logger.error("LLM API call failed for symbol=%s: %s", symbol, e)
        raise

    if not raw_result or not raw_result.strip():
        raise RuntimeError("LLM 返回了空响应，请重试")

    logger.debug("LLM raw response | symbol=%s length=%d first_200=%s",
                 symbol, len(raw_result), raw_result[:200].replace("\n", "\\n"))

    analysis = _parse_llm_json(raw_result)
    if analysis is not None:
        logger.info("LLM analyze success | symbol=%s action=%s confidence=%s",
                    symbol, analysis.get("action"), analysis.get("confidence"))
        return analysis

    # JSON parse failed — log the raw response for debugging
    logger.warning(
        "LLM JSON parse failed for symbol=%s; raw response (first 500 chars): %s",
        symbol, raw_result[:500],
    )
    raise RuntimeError("LLM 响应格式错误（无法解析 JSON），请重试")


async def _call_openai(
    api_key: str,
    base_url: str,
    model: str,
    system_prompt: str,
    user_prompt: str,
    max_tokens: int,
    temperature: float,
    thinking_enabled: bool = False,
    thinking_effort: str = "high",
) -> str:
    """Call OpenAI compatible API."""
    effective_base_url = base_url or "https://api.openai.com/v1"
    client = AsyncOpenAI(api_key=api_key, base_url=effective_base_url)

    kwargs: Dict[str, Any] = dict(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        max_tokens=max_tokens,
    )
    if thinking_enabled:
        kwargs["extra_body"] = {
            "thinking": {"type": "enabled"},
            "reasoning_effort": thinking_effort,
        }
        logger.info("OpenAI call | base_url=%s model=%s max_tokens=%d thinking=enabled effort=%s",
                    effective_base_url, model, max_tokens, thinking_effort)
    else:
        kwargs["temperature"] = temperature
        logger.info("OpenAI call | base_url=%s model=%s max_tokens=%d temperature=%s",
                    effective_base_url, model, max_tokens, temperature)

    response = await client.chat.completions.create(**kwargs)
    msg = response.choices[0].message
    usage = getattr(response, "usage", None)
    if usage:
        logger.info("OpenAI usage | prompt_tokens=%s completion_tokens=%s total_tokens=%s",
                    getattr(usage, "prompt_tokens", "?"),
                    getattr(usage, "completion_tokens", "?"),
                    getattr(usage, "total_tokens", "?"))
    if thinking_enabled:
        reasoning = getattr(msg, "reasoning_content", None)
        if reasoning:
            logger.info("DeepSeek thinking active | reasoning_chars=%d content_chars=%d",
                        len(reasoning), len(msg.content or ""))
            logger.debug("DeepSeek reasoning preview: %s", reasoning[:300].replace("\n", "\\n"))
        else:
            logger.warning("DeepSeek thinking enabled but reasoning_content is empty — "
                           "check model name (expected deepseek-v4-pro / deepseek-reasoner)")
    return msg.content


async def _call_anthropic(
    api_key: str,
    model: str,
    system_prompt: str,
    user_prompt: str,
    max_tokens: int,
    temperature: float,
) -> str:
    """Call Anthropic API."""
    if AsyncAnthropic is None:
        raise ImportError("anthropic package not installed")

    client = AsyncAnthropic(api_key=api_key)

    response = await client.messages.create(
        model=model,
        system=system_prompt,
        messages=[{"role": "user", "content": user_prompt}],
        max_tokens=max_tokens,
        temperature=temperature,
    )

    return response.content[0].text


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _fmt(v, fmt: str = "{:.2f}", dash: str = "-") -> str:
    """格式化数值，None/NaN/不可格式化时返回占位符。"""
    try:
        if v is None:
            return dash
        return fmt.format(v)
    except (TypeError, ValueError):
        return dash


def _trend_diagnosis_block(feat: dict, *, with_classify: bool) -> str:
    """把 compute_trend_features 的输出渲染成趋势诊断文本块；None 项省略，绝不臆造。"""
    lines = []
    if with_classify and feat.get("trend_type"):
        extra = []
        if feat.get("slope_ann") is not None:
            extra.append(f"年化斜率{feat['slope_ann'] * 100:.0f}%")
        if feat.get("r2") is not None:
            extra.append(f"R2={feat['r2']:.2f}")
        suffix = f"（{', '.join(extra)}）" if extra else ""
        lines.append(f"- 趋势类型: {feat['trend_type'].split('点 ', 1)[-1]}{suffix}")
    if feat.get("alignment"):
        lines.append(
            f"- 均线排列(MA20/60/120): {feat['alignment']} "
            f"(MA20={_fmt(feat.get('ma20'))}, MA60={_fmt(feat.get('ma60'))}, MA120={_fmt(feat.get('ma120'))})"
        )
    if feat.get("ema20") is not None:
        lines.append(
            "- EMA互验(EMA20/60/120): "
            f"EMA20={_fmt(feat.get('ema20'))}, EMA60={_fmt(feat.get('ema60'))}, EMA120={_fmt(feat.get('ema120'))}"
        )
    if feat.get("ma_spread_pct") is not None:
        conv = "是(密集)" if feat.get("converged") else "否"
        lines.append(f"- 均线密集度: {feat['ma_spread_pct']:.2f}% (是否<2%密集: {conv})")
    ded = feat.get("deduction") or {}
    ded_parts = []
    for n in (20, 60, 120):
        d = ded.get(n) or ded.get(str(n)) or {}  # 兼容前端 JSON 的字符串 key
        if d.get("price") is not None:
            arrow = "将上行" if d.get("will_rise") else "将下行"
            ded_parts.append(f"MA{n}={_fmt(d['price'])}({arrow})")
    if ded_parts:
        lines.append("- 抵扣价(预测均线下一步方向): " + "; ".join(ded_parts))
    cons = feat.get("consolidation") or {}
    if cons.get("in"):
        lines.append(
            f"- 密集成交区: 已持续约{cons.get('days')}根, "
            f"箱体[{_fmt(cons.get('box_lo'))}~{_fmt(cons.get('box_hi'))}]（突破参考位）"
        )
    elif cons.get("in") is False:
        lines.append("- 密集成交区: 当前非密集")
    rev = feat.get("reversal") or {}
    rev_parts = [k for k, v in rev.items() if v]
    if rev_parts:
        lines.append(f"- 转折迹象(20均线组): 近期出现 {'、'.join(rev_parts)}")
    pb = feat.get("pullback") or {}
    pb_parts = [f"距{k.upper()} {pb[k]:+.1f}%" for k in ("ma20", "ma60", "ma120") if pb.get(k) is not None]
    if pb_parts:
        lines.append("- 回撤位: " + ", ".join(pb_parts))
    return "\n".join(lines) if lines else "- （趋势特征数据不足，暂略）"


def _build_methodology_prompt(df, symbol: str = "", market: str = "a", user_context: Optional[Dict[str, Any]] = None,
                              period: str = "daily", higher_tf_features: Optional[Dict[str, Any]] = None,
                              trend_features: Optional[Dict[str, Any]] = None) -> str:
    """Build trend-methodology multi-timeframe decision prompt.

    Prefers client-supplied ``trend_features``; falls back to server-side compute (xbot / no client).
    """
    from src.services.data.trend_features import compute_trend_features

    latest = df.iloc[-1]
    recent = df.tail(10)
    is_daily = (period == "daily")
    period_label = "日线" if is_daily else f"{period}分钟线"

    close = _safe_float(latest.get("close"))
    high = _safe_float(latest.get("high"))
    low = _safe_float(latest.get("low"))
    open_price = _safe_float(latest.get("open"))
    volume = _safe_float(latest.get("volume"))
    rsi = _safe_float(latest.get("rsi"), 50.0)
    atr = _safe_float(latest.get("atr"))
    macd = _safe_float(latest.get("macd"))
    macd_dea = _safe_float(latest.get("macd_dea"))
    macd_bar = _safe_float(latest.get("macd_bar"))

    rsi_state = "超买区" if rsi > 70 else ("超卖区" if rsi < 30 else "中性区")
    macd_state = "多头" if macd > macd_dea else "空头"

    # 主图方法论特征：优先用前端传入；否则后端自算（日线做 5 类分类，分钟线不分类避免年化失真）
    feat = trend_features or compute_trend_features(df, classify_trend=is_daily)
    trend_block = _trend_diagnosis_block(feat, with_classify=is_daily)

    # 大周期方向块：仅分钟线呈现日线大周期（周期扩散——大周期定方向）
    if not is_daily and higher_tf_features:
        higher_block = (
            "## 日线大周期方向（定方向：主图入场须顺此方向，逆势不做）\n"
            + _trend_diagnosis_block(higher_tf_features, with_classify=True)
            + "\n\n"
        )
    elif not is_daily:
        higher_block = "## 日线大周期方向\n- 大周期数据暂缺，仅按主图研判，注意防守。\n\n"
    else:
        higher_block = ""

    holding_qty = int(user_context.get("holding_quantity") or 0) if user_context else 0
    cost_price = _safe_float(user_context.get("cost_price") if user_context else 0)
    max_position = int(user_context.get("max_position") or 0) if user_context else 0

    if market == "futures":
        position_info = (
            f"""## 当前持仓状态（期货）
- 持有数量: {holding_qty}手
- 成本价: {cost_price:.2f}元
- 当前价格: {close:.2f}元
- 最大持仓: {max_position}手
"""
            if holding_qty > 0 or cost_price > 0 or max_position > 0
            else """## 当前持仓状态（期货）
- 当前无持仓（空仓）
"""
        )
        account_info = """## 账户状态
- 交易品类: 期货
- 交易方向: 支持做多（open_long/close_long）和做空（open_short/close_short）
- 注意: 期货有杠杆，需严格控制仓位和止损
"""
        costs_info = """## 交易成本
- 期货保证金交易，杠杆放大盈亏
- 持仓过夜有隔夜风险，注意合约到期日
"""
        system_title = f"# 期货交易决策系统 - {symbol or 'UNKNOWN'}"
        system_role = "你是一位经验丰富的期货交易员，精通技术分析与趋势判断，能够同时操作多空两个方向。"
        action_enum = "open_long|close_long|open_short|close_short|hold"
        position_unit = "手"
    else:
        position_info = (
            f"""## 当前持仓状态（股票）
- 持有数量: {holding_qty}股
- 成本价: {cost_price:.2f}元
- 当前价格: {close:.2f}元
- 最大持仓: {max_position}股
"""
            if holding_qty > 0 or cost_price > 0 or max_position > 0
            else """## 当前持仓状态（股票）
- 当前无持仓（空仓）
"""
        )
        account_info = """## 账户状态
- 交易品类: 股票
- 交易限制: 股票只能做多，不支持做空
"""
        costs_info = """## 交易成本
- 股票全额买入（无杠杆）
- 交易手续费、印花税会影响实际收益
"""
        system_title = f"# 股票交易决策系统 - {symbol or 'UNKNOWN'}"
        system_role = "你是一位经验丰富的股票投资专家，精通技术分析与择时，需要基于市场数据做出专业交易决策。"
        action_enum = "open_long|close_long|adjust_position|hold"
        position_unit = "股"

    return f"""{system_title}

{system_role}

{higher_block}## 主图({period_label})技术快照
- 当前价格: {close:.2f}
- 价格K线: 开盘{open_price:.2f} / 最高{high:.2f} / 最低{low:.2f}
- MACD: {macd_state} (MACD={macd:.4f}, DEA={macd_dea:.4f}, BAR={macd_bar:.4f})
- RSI: {rsi:.1f} ({rsi_state})
- ATR: {atr:.4f}
- 成交量: {volume:,.0f}

## 主图({period_label})趋势诊断（方法论量化特征，已算好，请直接采信）
{trend_block}

## 最近10根收盘价
{recent['close'].to_string()}

## 最近10根成交量
{recent['volume'].to_string()}

{position_info}

{account_info}

{costs_info}

---

# 决策任务（趋势跟随方法论）
核心信条：跟随趋势、不预测趋势；趋势的最小阻力方向就是均线运行方向；没有顶/底部构造就不会见顶/底；趋势转折必经"破线→拐头→交叉"三步。请严格按以下四步研判并输出决策。

## 第一步：趋势诊断（定方向）
- {"先依据上方【日线大周期方向】定方向，主图不得逆大周期方向交易；再看主图入场结构。" if not is_daily else "用 MA120(半年线)+长斜率定大方向，用 MA20 看入场结构。"}
- 当前趋势属哪一类（加速上涨 / 稳定上涨 / 横向整理 / 稳定下跌 / 加速下跌）？请直接用这些趋势词，不要使用「几点」之类的时钟数字表述。
- 均线是多头排列、空头排列还是纠缠？均线是否已高度密集（<2%）？是否处于密集成交区、已持续多久、箱体上下沿在哪？

## 第二步：交易机会评估（找入场）
判断当前属于以下哪类可交易场景及信号强弱：
- ①密集区末端埋伏突破：时长足够 + 均线密集<2% + 排列开始张嘴；期待突破，底线=排列被破坏。
- ②假突破反转：刚突破又快速跌回（"真突破让人追不上"）；只能标"疑似假突破"并相应反手。
- ③稳定趋势回撤入场：中长期均线平行 + 价格回撤到 MA20/60/120 + 抵扣价显示该均线方向不变 + 出现底/顶部构造{"，且与日线大方向一致(周期扩散)" if not is_daily else ""}。
- ④斜率加速行情：不追（坐轿子不抬轿子），持仓者等顶/底部构造再动。
- 给出机会质量评级（A级优质/B级良好/C级一般/D级观望）。

## 第三步：风险收益分析
- 止损=方法论"底线"：多头/空头排列被破坏、二六均线组交叉、或跌破/升破密集区箱体波谷。
- 目标=突破量度幅度（"横有多长、竖有多高"）或趋势延续目标。
- 风险收益比是否合适？主要风险因素（技术/消息/流动性）？

## 第四步：执行方案制定（落地为可执行的交易计划）
- 只在"关键性波动"（可能改变均线运行方向的位置）上动手，而非随意位置。
- 给出可执行计划：入场区间（entry_low~entry_high）、仓位建议（单位：{position_unit}）、止损价位、目标价位，以及明确的离场条件（满足哪些信号就离场）。
- execution_plan 摘要须落到"在什么价位做什么、跌破/升破什么就离场"，避免空泛的方向判断。

---

# 决策输出格式
请仅输出以下标准JSON格式（不要markdown）：
{{
  "action": "{action_enum}",
  "target_position": <int, 目标总持仓（仅用于adjust_position，必须>=0）>,
  "position_size": <int, 本次操作数量（单位：{position_unit}）>,
  "entry_low": <float, 建议入场区间下沿；若为单点可与 entry_high 相等>,
  "entry_high": <float, 建议入场区间上沿>,
  "target_price": <float, 【必填，非null非0】根据技术分析推算的目标价格>,
  "stop_loss": <float, 【必填，非null非0】止损价格>,
  "take_profit": <float, 止盈价格>,
  "max_loss_pct": <float, 严格按止损执行时本单最大亏损百分比（正数，如 5 表示 -5%）>,
  "exit_conditions": ["离场条件1（如：跌破MA20）", "离场条件2"],
  "confidence": <float 0.0-1.0 或 0-100>,
  "summary": "<必填，1句可读中文摘要，概括方向、核心理由和主要风险>",
  "reasons": ["关键理由1", "关键理由2", "关键理由3"],
  "market_diagnosis": "<第一步摘要>",
  "opportunity_assessment": "<第二步摘要>",
  "risk_analysis": "<第三步摘要>",
  "execution_plan": "<第四步摘要：可执行计划，含价位与离场动作>",
  "risk_factors": ["风险1", "风险2"],
  "opportunity_quality": "A|B|C|D"
}}

重要：每步摘要≤2句、reasons/risk_factors/exit_conditions 数组≤3项，控制长度避免截断。target_price 和 stop_loss 必须是有意义的正数，绝对不能为 null 或 0。
entry_low/entry_high/max_loss_pct/exit_conditions 尽量给出；若确实无法判断可省略（系统会兜底），但不要填 null 占位。
hold 操作时 target_price 填写当前价格附近的关键支撑或压力位。
"""


def _build_legacy_prompt(df, symbol: str = "", market: str = "a", user_context: Optional[Dict[str, Any]] = None,
                         indicators: Optional[Dict[str, Any]] = None) -> str:
    """Classic four-step decision prompt (legacy methodology).

    Prefers client-supplied ``indicators``; falls back to df columns (xbot / no client).
    """
    latest = df.iloc[-1]
    recent = df.tail(10)
    ind = indicators or {}

    def _ind(key: str, default: float = 0.0) -> float:
        v = ind.get(key) if ind else None
        if v is None:
            v = latest.get(key)
        return _safe_float(v, default)

    close = _safe_float(latest.get("close"))
    high = _safe_float(latest.get("high"))
    low = _safe_float(latest.get("low"))
    open_price = _safe_float(latest.get("open"))
    volume = _safe_float(latest.get("volume"))
    ma10 = _ind("ma10")
    ma30 = _ind("ma30")
    ma60 = _ind("ma60")
    rsi = _ind("rsi", 50.0)
    atr = _ind("atr")
    macd = _ind("macd")
    macd_dea = _ind("macd_dea")
    macd_bar = _ind("macd_bar")

    ma_trend = "多头排列" if ma10 > ma30 else "空头排列"
    rsi_state = "超买区" if rsi > 70 else ("超卖区" if rsi < 30 else "中性区")
    macd_state = "多头" if macd > macd_dea else "空头"

    holding_qty = int(user_context.get("holding_quantity") or 0) if user_context else 0
    cost_price = _safe_float(user_context.get("cost_price") if user_context else 0)
    max_position = int(user_context.get("max_position") or 0) if user_context else 0

    if market == "futures":
        position_info = (
            f"""## 当前持仓状态（期货）
- 持有数量: {holding_qty}手
- 成本价: {cost_price:.2f}元
- 当前价格: {close:.2f}元
- 最大持仓: {max_position}手
"""
            if holding_qty > 0 or cost_price > 0 or max_position > 0
            else """## 当前持仓状态（期货）
- 当前无持仓（空仓）
"""
        )
        account_info = """## 账户状态
- 交易品类: 期货
- 交易方向: 支持做多（open_long/close_long）和做空（open_short/close_short）
- 注意: 期货有杠杆，需严格控制仓位和止损
"""
        costs_info = """## 交易成本
- 期货保证金交易，杠杆放大盈亏
- 持仓过夜有隔夜风险，注意合约到期日
"""
        system_title = f"# 期货交易决策系统 - {symbol or 'UNKNOWN'}"
        system_role = "你是一位经验丰富的期货交易员，精通技术分析与趋势判断，能够同时操作多空两个方向。"
        action_enum = "open_long|close_long|open_short|close_short|hold"
        position_unit = "手"
    else:
        position_info = (
            f"""## 当前持仓状态（股票）
- 持有数量: {holding_qty}股
- 成本价: {cost_price:.2f}元
- 当前价格: {close:.2f}元
- 最大持仓: {max_position}股
"""
            if holding_qty > 0 or cost_price > 0 or max_position > 0
            else """## 当前持仓状态（股票）
- 当前无持仓（空仓）
"""
        )
        account_info = """## 账户状态
- 交易品类: 股票
- 交易限制: 股票只能做多，不支持做空
"""
        costs_info = """## 交易成本
- 股票全额买入（无杠杆）
- 交易手续费、印花税会影响实际收益
"""
        system_title = f"# 股票交易决策系统 - {symbol or 'UNKNOWN'}"
        system_role = "你是一位经验丰富的股票投资专家，精通技术分析与择时，需要基于市场数据做出专业交易决策。"
        action_enum = "open_long|close_long|adjust_position|hold"
        position_unit = "股"

    return f"""{system_title}

{system_role}

## 决策周期: 技术快照
- 当前价格: {close:.2f}
- MA趋势: {ma_trend} (MA10={ma10:.2f}, MA30={ma30:.2f}, MA60={ma60:.2f})
- 价格K线: 开盘{open_price:.2f} / 最高{high:.2f} / 最低{low:.2f}
- MACD: {macd_state} (MACD={macd:.4f}, DEA={macd_dea:.4f}, BAR={macd_bar:.4f})
- RSI: {rsi:.1f} ({rsi_state})
- ATR: {atr:.4f}
- 成交量: {volume:,.0f}

## 最近10根收盘价
{recent['close'].to_string()}

## 最近10根成交量
{recent['volume'].to_string()}

{position_info}

{account_info}

{costs_info}

---

# 决策任务
请按照专业交易员的思维框架，系统性地分析并输出交易决策。

## 第一步：市场状态诊断
- 当前市场处于什么状态？（强势趋势/温和趋势/震荡/反转）
- 主要驱动因素是什么？（价格突破/成交量确认/技术指标）
- 市场情绪如何？（恐慌/贪婪/犹豫/理性）
- 波动率处于什么状态？（扩张/收缩/正常）

## 第二步：交易机会评估
- 识别到的机会是什么？（趋势跟随/均值回归/突破/观望）
- 信号强度如何？（强/中/弱）
- 确认程度如何？（多重确认/部分确认/单一信号）
- 时间窗口如何？（立即/短期观察/继续跟踪）
- 机会质量评级？（A级优质/B级良好/C级一般/D级观望）

## 第三步：风险收益分析
- 预期收益是多少？（目标价位和预期收益率）
- 潜在风险是多少？（止损价位和最大亏损）
- 风险收益比是否合适？当前应该激进、稳健还是保守？
- 主要风险因素有哪些？（技术风险/消息风险/流动性风险）

## 第四步：执行方案制定（落地为可执行的交易计划）
- 具体操作：开多/平多/开空/平空/观望
- 入场计划：入场区间（entry_low~entry_high）与时机（立即还是等待确认）
- 仓位建议：建议仓位（单位：{position_unit}）与风险敞口
- 出场计划：止损价位、止盈价位，以及明确的离场条件（满足哪些信号就离场）

---

# 决策输出格式
请仅输出以下标准JSON格式（不要markdown）：
{{
  "action": "{action_enum}",
  "target_position": <int, 目标总持仓（仅用于adjust_position，必须>=0）>,
  "position_size": <int, 本次操作数量（单位：{position_unit}）>,
  "entry_low": <float, 建议入场区间下沿；若为单点可与 entry_high 相等>,
  "entry_high": <float, 建议入场区间上沿>,
  "target_price": <float, 【必填，非null非0】根据技术分析推算的目标价格>,
  "stop_loss": <float, 【必填，非null非0】止损价格>,
  "take_profit": <float, 止盈价格>,
  "max_loss_pct": <float, 严格按止损执行时本单最大亏损百分比（正数，如 5 表示 -5%）>,
  "exit_conditions": ["离场条件1（如：跌破MA20）", "离场条件2"],
  "confidence": <float 0.0-1.0 或 0-100>,
  "summary": "<必填，1句可读中文摘要，概括方向、核心理由和主要风险>",
  "reasons": ["关键理由1", "关键理由2", "关键理由3"],
  "market_diagnosis": "<第一步摘要>",
  "opportunity_assessment": "<第二步摘要>",
  "risk_analysis": "<第三步摘要>",
  "execution_plan": "<第四步摘要：可执行计划，含价位与离场动作>",
  "risk_factors": ["风险1", "风险2"],
  "opportunity_quality": "A|B|C|D"
}}

重要：target_price 和 stop_loss 必须是有意义的正数，绝对不能为 null 或 0。
entry_low/entry_high/max_loss_pct/exit_conditions 尽量给出；若确实无法判断可省略（系统会兜底），但不要填 null 占位。
hold 操作时 target_price 填写当前价格附近的关键支撑或压力位。
"""


def _parse_llm_json(response_text: str) -> Optional[Dict[str, Any]]:
    """Parse LLM response to JSON with markdown/comment cleanup."""
    text = response_text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        if len(lines) > 1:
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines).strip()

    text = re.sub(r"//.*?$", "", text, flags=re.MULTILINE)
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.DOTALL)

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    try:
        decoder = json.JSONDecoder()
        obj, _ = decoder.raw_decode(text)
        if isinstance(obj, dict):
            return obj
    except Exception:
        pass

    start = text.find("{")
    if start == -1:
        return None

    brace = 0
    in_string = False
    escaped = False
    for i in range(start, len(text)):
        ch = text[i]
        if escaped:
            escaped = False
            continue
        if ch == "\\":
            escaped = True
            continue
        if ch == '"':
            in_string = not in_string
            continue
        if in_string:
            continue
        if ch == "{":
            brace += 1
        elif ch == "}":
            brace -= 1
            if brace == 0:
                try:
                    obj = json.loads(text[start:i + 1])
                    if isinstance(obj, dict):
                        return obj
                except Exception:
                    return None
    return None
