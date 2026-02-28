"""LLM service for analysis."""

from typing import Optional, Dict, Any
from loguru import logger

try:
    from openai import AsyncOpenAI
except ImportError:
    from openai import AsyncOpenAI

try:
    from anthropic import AsyncAnthropic
except ImportError:
    AsyncAnthropic = None


# Default system prompt for stock analysis
SYSTEM_PROMPT = """你是一位专业的量化交易分析师，擅长技术分析和趋势判断。

请根据以下K线数据和技术指标，分析当前市场的技术面状态，并给出交易建议。

数据格式说明：
- ma10, ma30, ma60: 10/30/60日移动平均线
- rsi: 相对强弱指标 (14日)
- atr: 平均真实波幅 (14日)
- macd, macd_dea, macd_bar: MACD指标

请返回JSON格式的分析结果：
{
    "signal": "bullish|bearish|neutral",
    "confidence": 0-100,
    "analysis": "技术分析要点",
    "entry_price": 建议入场价,
    "stop_loss": 建议止损价,
    "take_profit": 建议止盈价,
    "risk_level": "low|medium|high",
    "reasoning": "详细分析理由"
}

注意：
- 只返回JSON，不要有其他内容
- 价格基于最新收盘价
- 严格设置止损，控制风险"""


async def analyze_with_llm(
    df,
    provider: str = "openai",
    api_key: str = "",
    base_url: str = "",
    model: str = "gpt-4o-mini",
    max_tokens: int = 2000,
    temperature: float = 0.7,
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

    Returns:
        Analysis result dict
    """
    if df.empty:
        return {"error": "No data available"}

    # Prepare market data summary
    latest = df.iloc[-1]
    recent = df.tail(20)

    # Build market data text
    data_summary = _build_data_summary(df)

    # Call LLM
    try:
        if provider == "anthropic":
            result = await _call_anthropic(
                api_key=api_key,
                model=model,
                system_prompt=SYSTEM_PROMPT,
                user_prompt=data_summary,
                max_tokens=max_tokens,
                temperature=temperature,
            )
        else:
            # Default to OpenAI compatible
            result = await _call_openai(
                api_key=api_key,
                base_url=base_url,
                model=model,
                system_prompt=SYSTEM_PROMPT,
                user_prompt=data_summary,
                max_tokens=max_tokens,
                temperature=temperature,
            )

        # Parse JSON response
        import json
        import re

        # Extract JSON from response
        json_match = re.search(r'\{[^{}]*\}', result, re.DOTALL)
        if json_match:
            # Try to find the complete JSON object
            try:
                # Find the first { and last }
                start = result.find('{')
                end = result.rfind('}') + 1
                if start >= 0 and end > start:
                    json_str = result[start:end]
                    analysis = json.loads(json_str)
                    return analysis
            except json.JSONDecodeError:
                pass

        # If parsing fails, return raw result
        return {"raw_result": result, "error": "Failed to parse JSON"}

    except Exception as e:
        logger.error(f"LLM analysis failed: {e}")
        return {"error": str(e)}


async def _call_openai(
    api_key: str,
    base_url: str,
    model: str,
    system_prompt: str,
    user_prompt: str,
    max_tokens: int,
    temperature: float,
) -> str:
    """Call OpenAI compatible API."""
    client = AsyncOpenAI(api_key=api_key, base_url=base_url or "https://api.openai.com/v1")

    response = await client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        max_tokens=max_tokens,
        temperature=temperature,
    )

    return response.choices[0].message.content


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


def _build_data_summary(df) -> str:
    """Build market data summary for LLM."""
    latest = df.iloc[-1]

    # Get recent data summary
    recent = df.tail(10)

    summary = f"""## 最新市场数据

### 基本信息
- 最新收盘价: {latest['close']:.2f}
- 开盘价: {latest['open']:.2f}
- 最高价: {latest['high']:.2f}
- 最低价: {latest['low']:.2f}
- 成交量: {latest['volume']:,.0f}

### 移动平均线
- MA10: {latest.get('ma10', 'N/A'):.2f}
- MA30: {latest.get('ma30', 'N/A'):.2f}
- MA60: {latest.get('ma60', 'N/A'):.2f}

### 技术指标
- RSI(14): {latest.get('rsi', 'N/A'):.2f}
- ATR(14): {latest.get('atr', 'N/A'):.2f}
- MACD: {latest.get('macd', 'N/A'):.4f}
- MACD Dea: {latest.get('macd_dea', 'N/A'):.4f}
- MACD Bar: {latest.get('macd_bar', 'N/A'):.4f}

### 最近10日收盘价
{recent['close'].to_string()}

### 最近10日成交量
{recent['volume'].to_string()}

请分析以上数据，给出交易建议。"""
    return summary
