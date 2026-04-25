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


# Backtest-aligned system prompt
SYSTEM_PROMPT = (
    "你是经验丰富的交易分析师。"
    "请遵循用户给出的四步决策框架进行分析，并严格只输出JSON。"
)


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

    # Build backtest-aligned enhanced prompt
    prompt = _build_enhanced_prompt(df, symbol=symbol, market=market, user_context=user_context)

    # Call LLM with timeout
    try:
        import asyncio
        if provider == "anthropic":
            raw_result = await asyncio.wait_for(
                _call_anthropic(
                    api_key=api_key,
                    model=model,
                    system_prompt=SYSTEM_PROMPT,
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
                    system_prompt=SYSTEM_PROMPT,
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

    analysis = _parse_llm_json(raw_result)
    if analysis is not None:
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
    client = AsyncOpenAI(api_key=api_key, base_url=base_url or "https://api.openai.com/v1")

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
    else:
        kwargs["temperature"] = temperature

    response = await client.chat.completions.create(**kwargs)
    msg = response.choices[0].message
    if thinking_enabled and hasattr(msg, "reasoning_content") and msg.reasoning_content:
        logger.debug("DeepSeek thinking used, reasoning chars: %d", len(msg.reasoning_content))
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


def _build_enhanced_prompt(df, symbol: str = "", market: str = "a", user_context: Optional[Dict[str, Any]] = None) -> str:
    """Build backtest-style enhanced decision prompt."""
    latest = df.iloc[-1]
    recent = df.tail(10)

    close = _safe_float(latest.get("close"))
    high = _safe_float(latest.get("high"))
    low = _safe_float(latest.get("low"))
    open_price = _safe_float(latest.get("open"))
    volume = _safe_float(latest.get("volume"))
    ma10 = _safe_float(latest.get("ma10"))
    ma30 = _safe_float(latest.get("ma30"))
    ma60 = _safe_float(latest.get("ma60"))
    rsi = _safe_float(latest.get("rsi"), 50.0)
    atr = _safe_float(latest.get("atr"))
    macd = _safe_float(latest.get("macd"))
    macd_dea = _safe_float(latest.get("macd_dea"))
    macd_bar = _safe_float(latest.get("macd_bar"))

    ma_trend = "多头排列" if ma10 > ma30 else "空头排列"
    rsi_state = "超买区" if rsi > 70 else ("超卖区" if rsi < 30 else "中性区")
    macd_state = "多头" if macd > macd_dea else "空头"

    holding_qty = int(user_context.get("holding_quantity") or 0) if user_context else 0
    cost_price = _safe_float(user_context.get("cost_price") if user_context else 0)
    max_position = int(user_context.get("max_position") or 0) if user_context else 0

    if market == "futures":
        position_info = (
            f"""## 📋 当前持仓状态（期货）
- 持有数量: {holding_qty}手
- 成本价: {cost_price:.2f}元
- 当前价格: {close:.2f}元
- 最大持仓: {max_position}手
"""
            if holding_qty > 0 or cost_price > 0 or max_position > 0
            else """## 📋 当前持仓状态（期货）
- 当前无持仓（空仓）
"""
        )
        account_info = """## 💰 账户状态
- 交易品类: 期货
- 交易方向: 支持做多（open_long/close_long）和做空（open_short/close_short）
- 注意: 期货有杠杆，需严格控制仓位和止损
"""
        costs_info = """## 💸 交易成本
- 期货保证金交易，杠杆放大盈亏
- 持仓过夜有隔夜风险，注意合约到期日
"""
        system_title = f"# 期货交易决策系统 - {symbol or 'UNKNOWN'}"
        system_role = "你是一位经验丰富的期货交易员，精通技术分析与趋势判断，能够同时操作多空两个方向。"
        action_enum = "open_long|close_long|open_short|close_short|hold"
        position_unit = "手"
    else:
        position_info = (
            f"""## 📋 当前持仓状态（股票）
- 持有数量: {holding_qty}股
- 成本价: {cost_price:.2f}元
- 当前价格: {close:.2f}元
- 最大持仓: {max_position}股
"""
            if holding_qty > 0 or cost_price > 0 or max_position > 0
            else """## 📋 当前持仓状态（股票）
- 当前无持仓（空仓）
"""
        )
        account_info = """## 💰 账户状态
- 交易品类: 股票
- 交易限制: 股票只能做多，不支持做空
"""
        costs_info = """## 💸 交易成本
- 股票全额买入（无杠杆）
- 交易手续费、印花税会影响实际收益
"""
        system_title = f"# 股票交易决策系统 - {symbol or 'UNKNOWN'}"
        system_role = "你是一位经验丰富的股票投资专家，精通技术分析与择时，需要基于市场数据做出专业交易决策。"
        action_enum = "open_long|close_long|adjust_position|hold"
        position_unit = "股"

    return f"""{system_title}

{system_role}

## 📊 决策周期: 日内技术快照
- 当前价格: {close:.2f}
- MA趋势: {ma_trend} (MA10={ma10:.2f}, MA30={ma30:.2f}, MA60={ma60:.2f})
- 价格K线: 开盘{open_price:.2f} / 最高{high:.2f} / 最低{low:.2f}
- MACD: {macd_state} (MACD={macd:.4f}, DEA={macd_dea:.4f}, BAR={macd_bar:.4f})
- RSI: {rsi:.1f} ({rsi_state})
- ATR: {atr:.4f}
- 成交量: {volume:,.0f}

## 📈 最近10根收盘价
{recent['close'].to_string()}

## 📉 最近10根成交量
{recent['volume'].to_string()}

{position_info}

{account_info}

{costs_info}

---

# 🎯 决策任务
请按照专业交易员的思维框架，系统性地分析并输出交易决策。

## 第一步：市场状态诊断 🔍
- 当前市场处于什么状态？（强势趋势/温和趋势/震荡/反转）
- 主要驱动因素是什么？（价格突破/成交量确认/技术指标）
- 市场情绪如何？（恐慌/贪婪/犹豫/理性）
- 波动率处于什么状态？（扩张/收缩/正常）

## 第二步：交易机会评估 💡
- 识别到的机会是什么？（趋势跟随/均值回归/突破/观望）
- 信号强度如何？（强/中/弱）
- 确认程度如何？（多重确认/部分确认/单一信号）
- 时间窗口如何？（立即/短期观察/继续跟踪）
- 机会质量评级？（A级优质/B级良好/C级一般/D级观望）

## 第三步：风险收益分析 ⚖️
- 预期收益是多少？（目标价位和预期收益率）
- 潜在风险是多少？（止损价位和最大亏损）
- 风险收益比是否合适？当前应该激进、稳健还是保守？
- 主要风险因素有哪些？（技术风险/消息风险/流动性风险）

## 第四步：执行方案制定 📝
- 具体操作：开多/平多/开空/平空/观望
- 仓位建议：建议仓位（单位：{position_unit}）与风险敞口
- 入场时机：立即还是等待确认
- 出场计划：止损价位、止盈价位

---

# 📤 决策输出格式
请仅输出以下标准JSON格式（不要markdown）：
{{
  "action": "{action_enum}",
  "target_position": <int, 目标总持仓（仅用于adjust_position，必须>=0）>,
  "position_size": <int, 本次操作数量（单位：{position_unit}）>,
  "target_price": <float, 【必填，非null非0】根据技术分析推算的目标价格>,
  "stop_loss": <float, 【必填，非null非0】止损价格>,
  "take_profit": <float, 止盈价格>,
  "confidence": <float 0.0-1.0 或 0-100>,
  "reasons": ["关键理由1", "关键理由2", "关键理由3"],
  "market_diagnosis": "<第一步摘要>",
  "opportunity_assessment": "<第二步摘要>",
  "risk_analysis": "<第三步摘要>",
  "execution_plan": "<第四步摘要>",
  "risk_factors": ["风险1", "风险2"],
  "opportunity_quality": "A|B|C|D"
}}

重要：target_price 和 stop_loss 必须是有意义的正数，绝对不能为 null 或 0。
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
