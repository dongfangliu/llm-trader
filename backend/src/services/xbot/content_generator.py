"""Generate tweet text content for xbot predictions and results."""

from typing import Optional
from src.models.xbot import XBotPrediction

_DIRECTION_EMOJI = {"up": "📈", "down": "📉", "hold": "➡️"}
_DIRECTION_CN = {"up": "看涨", "down": "看跌", "hold": "震荡"}

_DEFAULT_PREDICTION_TEMPLATE = """{direction_emoji} AI预测 | 明日走势 {date}

📌 {name}（{symbol}）

信号：{direction_emoji} {direction_cn}
置信度：{confidence}%

{price_info}{summary_line}
{disclaimer}
🤖 免费体验完整分析 → {product_url}
{hashtags}"""

_DEFAULT_RESULT_TEMPLATE = """{result_emoji} 昨日预测结果

📌 {name}（{symbol}）
预测：{pred_emoji} {direction_cn} {confidence}%
实际：{actual_pct:+.2f}% {hit_emoji}

📊 累计胜率：{accuracy_all}（{pct_all}%）

🔮 今日预测已发布，免费体验完整AI分析
{product_url}
{hashtags}"""


def render_prediction_tweet(
    prediction: XBotPrediction,
    template: str = "",
    product_url: str = "",
    hashtags: str = "#A股 #AI选股 #股票预测",
    disclaimer: str = "⚠️ 仅供参考，非投资建议",
) -> str:
    tpl = template.strip() if template.strip() else _DEFAULT_PREDICTION_TEMPLATE
    direction = prediction.predicted_direction or "hold"
    emoji = _DIRECTION_EMOJI.get(direction, "➡️")
    cn = _DIRECTION_CN.get(direction, "震荡")
    confidence = f"{prediction.confidence:.0f}" if prediction.confidence else "—"

    price_parts = []
    if prediction.target_price:
        price_parts.append(f"目标价：¥{prediction.target_price:.2f}")
    if prediction.stop_loss:
        price_parts.append(f"止损价：¥{prediction.stop_loss:.2f}")
    price_info = "  ".join(price_parts) + "\n" if price_parts else ""

    summary_line = ""
    if prediction.analysis_summary:
        snippet = prediction.analysis_summary[:80].rstrip("。，,.")
        summary_line = f"\n\"{snippet}...\"\n"

    text = tpl.format(
        direction_emoji=emoji,
        direction_cn=cn,
        name=prediction.symbol_name,
        symbol=_format_symbol(prediction.symbol, prediction.market),
        date=str(prediction.target_date),
        confidence=confidence,
        price_info=price_info,
        summary_line=summary_line,
        disclaimer=disclaimer,
        product_url=product_url or "",
        hashtags=hashtags,
    )
    return text.strip()[:280]


def render_result_tweet(
    prediction: XBotPrediction,
    accuracy_all_label: str,
    accuracy_all_pct: int,
    template: str = "",
    product_url: str = "",
    hashtags: str = "#A股 #AI选股",
) -> str:
    tpl = template.strip() if template.strip() else _DEFAULT_RESULT_TEMPLATE
    direction = prediction.predicted_direction or "hold"
    pred_emoji = _DIRECTION_EMOJI.get(direction, "➡️")
    cn = _DIRECTION_CN.get(direction, "震荡")
    confidence = f"{prediction.confidence:.0f}" if prediction.confidence else "—"
    actual_pct = prediction.actual_change_pct or 0.0
    hit_emoji = "✅ 命中" if prediction.is_correct else "❌ 未中"
    result_emoji = "✅" if prediction.is_correct else "❌"

    text = tpl.format(
        result_emoji=result_emoji,
        name=prediction.symbol_name,
        symbol=_format_symbol(prediction.symbol, prediction.market),
        pred_emoji=pred_emoji,
        direction_cn=cn,
        confidence=confidence,
        actual_pct=actual_pct,
        hit_emoji=hit_emoji,
        accuracy_all=accuracy_all_label,
        pct_all=accuracy_all_pct,
        product_url=product_url or "",
        hashtags=hashtags,
    )
    return text.strip()[:280]


def _format_symbol(symbol: str, market: str) -> str:
    if market == "a":
        suffix = ".SH" if symbol.startswith("6") else ".SZ"
        return f"{symbol}{suffix}"
    if market == "hk":
        return f"{symbol}.HK"
    return symbol
