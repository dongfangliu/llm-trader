"""Gradio UI — LLM Trading Strategy Analyzer.

Provides a single-bar "latest strategy" analysis interface.
Run with:
    python run_ui.py
or:
    python -m src.ui.app
"""
from __future__ import annotations

import sys
import traceback
from pathlib import Path
from typing import Any, Dict, List, Tuple

import gradio as gr
import pandas as pd
import yaml
from loguru import logger

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.ui.runner import (
    load_preset_providers,
    load_trading_params,
    load_tq_credentials,
    run_analysis,
)

# ---------------------------------------------------------------------------
# Action display helpers
# ---------------------------------------------------------------------------

ACTION_EMOJI: Dict[str, str] = {
    "open_long":  "🟢 开多",
    "open_short": "🔴 开空",
    "close_long": "⬜ 平多",
    "close_short": "⬜ 平空",
    "adjust_position": "🔄 调仓",
    "hold": "⏸️ 观望",
}


# ---------------------------------------------------------------------------
# Provider helpers
# ---------------------------------------------------------------------------

def _provider_choices() -> List[str]:
    presets = load_preset_providers()
    return list(presets.keys()) + ["自定义"]


def on_provider_select(provider_name: str) -> Tuple[str, str, str]:
    """Auto-fill API key / Base URL / model when user picks a preset."""
    if provider_name == "自定义":
        return "", "", ""
    presets = load_preset_providers()
    cfg = presets.get(provider_name) or {}
    tp = load_trading_params()
    model = (
        (tp.get("llm") or {}).get("provider_overrides", {}).get(provider_name, {}).get("model")
        or (tp.get("llm") or {}).get("model", "")
    )
    return cfg.get("api_key", ""), cfg.get("base_url", ""), model


# ---------------------------------------------------------------------------
# Visibility toggle for data source
# ---------------------------------------------------------------------------

def toggle_source(data_source: str):
    """Show/hide source-specific field groups and update position unit labels."""
    is_ak = data_source == "akshare"
    is_tq = not is_ak
    if is_ak:
        pos_upd = gr.update(label="当前持仓（股数）", info="填入持有的股票数量，0 = 空仓（股票不支持做空）")
        max_upd = gr.update(label="最大持仓（股）")
    else:
        pos_upd = gr.update(label="当前持仓（手数）", info="正数 = 多头，负数 = 空头，0 = 空仓")
        max_upd = gr.update(label="最大持仓（手）")
    return (
        gr.update(visible=is_ak),   # akshare_group
        gr.update(visible=is_tq),   # tqsdk_kline_group
        gr.update(visible=is_tq),   # futures_params_acc
        gr.update(visible=is_tq),   # tq_creds_acc
        pos_upd,                    # initial_position
        max_upd,                    # max_position
    )


# ---------------------------------------------------------------------------
# Core analysis callback
# ---------------------------------------------------------------------------

def run_ui_analysis(
    # Data source
    data_source: str,
    symbol: str,
    # AKShare-specific
    market: str,
    period: str,
    history_days: int,
    # TqSDK-specific
    decision_period: int,
    auxiliary_periods: str,
    # Engine
    mode: str,
    # LLM config
    llm_provider: str,
    api_key: str,
    base_url: str,
    llm_model: str,
    max_tokens: int,
    timeout: int,
    temperature: float,
    # Initial position
    initial_position: int,
    entry_price: float,
    # Risk/trading params
    initial_capital: float,
    max_position: int,
    confidence_threshold: float,
    # Futures params
    margin_ratio: float,
    contract_multiplier: int,
    commission_per_lot: float,
    slippage_ticks: int,
    # TqSDK credentials
    tq_username: str,
    tq_password: str,
    tq_use_sim: bool,
) -> Tuple[str, str, str, pd.DataFrame, str]:
    """Called when the user clicks ▶ 开始分析."""
    symbol = symbol.strip()
    if not symbol:
        return "❌ 请填写品种代码", "", "", pd.DataFrame(), "❌ 品种代码不能为空"

    logger.info(f"[UI] run_ui_analysis started: source={data_source} symbol={symbol} mode={mode}")

    effective_provider = llm_provider if llm_provider != "自定义" else "openai"

    params: Dict[str, Any] = {
        "data_source": data_source,
        "symbol": symbol,
        # AKShare
        "market": market,
        "period": period,
        "history_days": int(history_days),
        # TqSDK
        "decision_period": int(decision_period) if decision_period else 240,
        "auxiliary_periods": auxiliary_periods.strip(),
        # Engine
        "mode": mode,
        # LLM
        "llm_config": {
            "provider": effective_provider,
            "api_key": api_key.strip(),
            "base_url": base_url.strip(),
            "model": llm_model.strip(),
            "max_tokens": int(max_tokens),
            "timeout": int(timeout),
            "temperature": float(temperature),
        },
        # Position
        "initial_position": int(initial_position or 0),
        "entry_price": float(entry_price or 0.0),
        # Risk
        "initial_capital": float(initial_capital),
        "max_position": int(max_position),
        "confidence_threshold": float(confidence_threshold),
        # Futures
        "margin_ratio": float(margin_ratio),
        "contract_multiplier": int(contract_multiplier or 1),
        "commission_per_lot": float(commission_per_lot or 0.0),
        "slippage_ticks": int(slippage_ticks or 0),
        # TqSDK creds
        "tqsdk_config": {
            "username": tq_username.strip(),
            "password": tq_password,
            "use_sim": tq_use_sim,
        },
    }

    try:
        result = run_analysis(params)
        logger.info(f"[UI] run_analysis completed, keys={list(result.keys())}")
    except BaseException as exc:
        err_detail = traceback.format_exc()
        logger.error(f"[UI] run_analysis raised: {exc}\n{err_detail}")
        return (
            f"❌ 分析出错\n\n```\n{exc}\n```",
            "",
            f"```\n{err_detail}\n```",
            pd.DataFrame(),
            f"❌ 出错: {exc}",
        )

    decision = result.get("decision")
    row = result.get("row")
    df = result.get("df")

    if decision is None:
        return "⚠️ 未获取到决策结果", "", "", pd.DataFrame(), "⚠️ 决策为空"

    # Wrap ALL rendering in one big try/except so Gradio never hangs on an error
    try:
        # ── 决策摘要 ─────────────────────────────────────────────────────────────
        action_label = ACTION_EMOJI.get(decision.action, decision.action)
        raw_conf = decision.confidence or 0.0
        conf_pct = raw_conf * 100 if raw_conf <= 1.0 else raw_conf
        conf_bar = "█" * int(conf_pct // 10) + "░" * (10 - int(conf_pct // 10))

        summary_lines = [
            f"## {action_label}",
            f"**置信度**: {conf_pct:.1f}%  `{conf_bar}`",
        ]
        if decision.position_size:
            unit = "股" if data_source == "akshare" else "手"
            summary_lines.append(f"**操作{unit}数**: {decision.position_size} {unit}")
        if decision.market_regime:
            summary_lines.append(f"**市场状态**: {decision.market_regime}")
        if decision.opportunity_quality:
            summary_lines.append(f"**机会质量**: {decision.opportunity_quality}")
        if decision.stop_loss:
            summary_lines.append(f"**止损价**: {decision.stop_loss:.2f}")
        if decision.take_profit:
            summary_lines.append(f"**止盈价**: {decision.take_profit:.2f}")
        if decision.risk_factors:
            summary_lines.append("**风险因素**: " + " · ".join(decision.risk_factors))

        summary_md = "\n\n".join(summary_lines)

        # ── 技术指标快照 ──────────────────────────────────────────────────────────
        if row is not None:
            def _fmt(v, d: int = 2) -> str:
                try:
                    fv = float(v)
                    return "N/A" if fv != fv else f"{fv:.{d}f}"
                except Exception:
                    return "N/A"

            close = row.get("close", float("nan"))
            ma10  = row.get("ma10",  float("nan"))
            ma30  = row.get("ma30",  float("nan"))
            try:
                trend = "📈 多头排列" if float(ma10) > float(ma30) else "📉 空头排列"
            except Exception:
                trend = "—"

            indicators_md = "\n".join([
                "| 指标 | 数值 |",
                "|------|------|",
                f"| 收盘价 | **{_fmt(close)}** |",
                f"| MA10 | {_fmt(ma10)} |",
                f"| MA30 | {_fmt(ma30)} |",
                f"| MA60 | {_fmt(row.get('ma60', float('nan')))} |",
                f"| MA趋势 | {trend} |",
                f"| RSI(14) | {_fmt(row.get('rsi', float('nan')), 1)} |",
                f"| ATR(14) | {_fmt(row.get('atr', float('nan')))} |",
                f"| MACD | {_fmt(row.get('macd', float('nan')))} |",
                f"| MACD DEA | {_fmt(row.get('macd_dea', float('nan')))} |",
                f"| MACD Bar | {_fmt(row.get('macd_bar', float('nan')))} |",
            ])
        else:
            indicators_md = "无数据"

        # ── LLM 推理过程 ──────────────────────────────────────────────────────────
        reasoning_parts: List[str] = []
        if decision.rationale:
            reasoning_parts.append("**📌 信号依据**\n\n" + "\n".join(f"- {r}" for r in decision.rationale))
        if decision.market_diagnosis:
            reasoning_parts.append(f"**🔍 第一步：市场诊断**\n\n{decision.market_diagnosis}")
        if decision.opportunity_assessment:
            reasoning_parts.append(f"**💡 第二步：机会评估**\n\n{decision.opportunity_assessment}")
        if decision.risk_analysis:
            reasoning_parts.append(f"**⚖️ 第三步：风险分析**\n\n{decision.risk_analysis}")
        if decision.execution_plan:
            reasoning_parts.append(f"**📝 第四步：执行方案**\n\n{decision.execution_plan}")

        reasoning_md = "\n\n---\n\n".join(reasoning_parts) if reasoning_parts else "（量化模式无 LLM 推理）"

        # ── 最近 K 线表格 ─────────────────────────────────────────────────────────
        kline_df = pd.DataFrame()
        if df is not None and not df.empty:
            recent = df.tail(20).copy()
            # Try to build a readable time column
            time_col_built = False
            if "datetime" in recent.columns:
                try:
                    from tqsdk import tafunc
                    recent["时间"] = recent["datetime"].apply(
                        lambda x: tafunc.time_to_datetime(int(x)).strftime("%Y-%m-%d %H:%M")
                    )
                    time_col_built = True
                except Exception:
                    pass
                if not time_col_built:
                    try:
                        recent["时间"] = pd.to_datetime(recent["datetime"], unit="ns").dt.strftime("%Y-%m-%d")
                        time_col_built = True
                    except Exception:
                        pass
            if not time_col_built and "timestamp" in recent.columns:
                try:
                    recent["时间"] = pd.to_datetime(recent["timestamp"]).dt.strftime("%Y-%m-%d %H:%M")
                    time_col_built = True
                except Exception:
                    pass
            if not time_col_built:
                recent["时间"] = recent.index.astype(str)

            cols_order = ["时间", "open", "high", "low", "close", "volume",
                          "ma10", "ma30", "ma60", "rsi", "atr", "macd"]
            available = [c for c in cols_order if c in recent.columns]
            numeric_cols = [c for c in available if c != "时间"]
            for c in numeric_cols:
                recent[c] = pd.to_numeric(recent[c], errors="coerce")
            kline_df = recent[available].reset_index(drop=True)
            kline_df[numeric_cols] = kline_df[numeric_cols].round(2)

        logger.info(f"[UI] formatting complete, returning results")
        return summary_md, indicators_md, reasoning_md, kline_df, "✅ 分析完成"

    except BaseException as fmt_exc:
        fmt_tb = traceback.format_exc()
        return (
            summary_md if "summary_md" in dir() else f"决策: {decision.action}",
            "",
            f"⚠️ 渲染结果时出错:\n```\n{fmt_tb}\n```",
            pd.DataFrame(),
            f"⚠️ 渲染错误: {fmt_exc}",
        )


# ---------------------------------------------------------------------------
# UI builder
# ---------------------------------------------------------------------------

def build_ui() -> gr.Blocks:
    provider_choices = _provider_choices()
    tp = load_trading_params()
    tq_creds = load_tq_credentials()

    llm_defaults   = tp.get("llm") or {}
    trading_def    = tp.get("trading") or {}
    decision_def   = tp.get("decision") or {}

    default_provider = provider_choices[0] if provider_choices else "自定义"
    raw_conf = decision_def.get("confidence_threshold", 70)
    default_conf = raw_conf / 100.0 if raw_conf > 1 else raw_conf

    with gr.Blocks(title="LLM 交易策略分析器") as demo:
        gr.Markdown(
            "# 🤖 LLM 交易策略分析器\n"
            "**单次最新K线策略分析**（非回测）— 配置好参数后点击「开始分析」获得 AI 交易建议。"
        )

        with gr.Row(equal_height=False):
            # ── LEFT: Configuration ──────────────────────────────────────────
            with gr.Column(scale=1, min_width=340):

                # ── Data source & symbol ────────────────────────────────────
                with gr.Accordion("📊 数据源 & 品种", open=True):
                    data_source = gr.Radio(
                        choices=["akshare", "tqsdk"],
                        value="akshare",
                        label="数据源",
                        info="AKShare = 股票（无需账户）  |  TqSDK = 期货（需账户）",
                    )
                    symbol = gr.Textbox(
                        label="品种代码",
                        value=trading_def.get("symbol", "600519"),
                        placeholder="A股: 600519  港股: 00700  美股: AAPL  期货: KQ.m@CZCE.SA",
                    )

                    # AKShare-specific fields
                    with gr.Group(visible=True) as akshare_group:
                        with gr.Row():
                            market = gr.Dropdown(
                                choices=["a", "hk", "us"],
                                value="a",
                                label="市场",
                                info="A股 / 港股 / 美股",
                            )
                            period = gr.Dropdown(
                                choices=["daily", "15", "30", "60"],
                                value="daily",
                                label="K线周期",
                            )
                        history_days = gr.Slider(
                            minimum=30, maximum=365, value=90, step=10,
                            label="历史K线天数",
                        )

                    # TqSDK-specific fields
                    with gr.Group(visible=False) as tqsdk_kline_group:
                        with gr.Row():
                            decision_period = gr.Number(
                                label="决策周期（分钟）",
                                value=240,
                                precision=0,
                                info="主决策时间框架，如 15/60/240/1440",
                            )
                            auxiliary_periods = gr.Textbox(
                                label="辅助周期（逗号分隔）",
                                value="",
                                placeholder="如 60,240  或  240,1440",
                                info="多周期联合分析，留空为单周期",
                            )

                # ── Initial position ────────────────────────────────────────
                with gr.Accordion("📋 初始持仓（可选）", open=False):
                    gr.Markdown(
                        "_股票: 填入持有的股票数量（股），不支持做空。_\n\n"
                        "_期货: 正数 = 多头手数，负数 = 空头手数，0 = 空仓。_\n\n"
                        "_设置初始持仓时必须同时填写开仓价格，LLM 才能正确计算浮盈。_"
                    )
                    with gr.Row():
                        initial_position = gr.Number(
                            label="当前持仓（股数）",
                            value=0,
                            precision=0,
                            info="填入持有的股票数量，0 = 空仓（股票不支持做空）",
                        )
                        entry_price = gr.Number(
                            label="开仓价格",
                            value=0.0,
                            info="初始持仓的建仓均价，0表示无持仓",
                        )

                # ── Decision engine ─────────────────────────────────────────
                with gr.Accordion("🔧 决策引擎", open=True):
                    mode = gr.Radio(
                        choices=["quant_only", "llm_direct"],
                        value="llm_direct",
                        label="决策模式",
                        info=(
                            "quant_only = MA金叉+RSI  |  "
                            "llm_direct = 纯LLM"
                        ),
                    )

                # ── LLM model config ────────────────────────────────────────
                with gr.Accordion("🤖 AI 模型配置", open=True):
                    llm_provider = gr.Dropdown(
                        choices=provider_choices,
                        value=default_provider,
                        label="预设方案",
                        info="从 api_keys.yaml 读取；选「自定义」手动填写",
                    )
                    api_key = gr.Textbox(
                        label="API Key", type="password", placeholder="sk-...",
                    )
                    base_url = gr.Textbox(
                        label="Base URL",
                        placeholder="https://api.deepseek.com  （OpenAI 官方可留空）",
                    )
                    llm_model = gr.Textbox(
                        label="模型名",
                        value=llm_defaults.get("model", ""),
                        placeholder="deepseek-reasoner / gpt-4o / claude-3-5-sonnet-20241022",
                    )
                    with gr.Row():
                        max_tokens = gr.Number(
                            label="Max Tokens",
                            value=llm_defaults.get("max_tokens", 5000),
                            precision=0,
                        )
                        timeout_sec = gr.Number(
                            label="超时(秒)",
                            value=llm_defaults.get("timeout", 240),
                            precision=0,
                        )
                    temperature = gr.Slider(
                        0.0, 2.0,
                        value=llm_defaults.get("temperature", 1.0),
                        step=0.1,
                        label="Temperature",
                    )

                # ── Futures-specific params (TqSDK only) ────────────────────
                with gr.Accordion("📉 期货专项参数", open=False, visible=False) as futures_params_acc:
                    gr.Markdown("_以下参数仅用于期货（TqSDK）模式，供 LLM 计算保证金占用和盈亏。_")
                    with gr.Row():
                        margin_ratio = gr.Slider(
                            0.05, 0.5, value=0.18, step=0.01,
                            label="保证金比例",
                            info="默认 18%（CZCE 商品期货典型值）",
                        )
                        contract_multiplier = gr.Number(
                            label="合约乘数（元/点）",
                            value=20,
                            precision=0,
                            info="如纯碱 SA = 20 吨/手",
                        )
                    with gr.Row():
                        commission_per_lot = gr.Number(
                            label="手续费（元/手）",
                            value=3.0,
                            info="单边手续费，0 表示从 TqSDK 自动获取",
                        )
                        slippage_ticks = gr.Number(
                            label="滑点（Tick）",
                            value=1,
                            precision=0,
                            info="每次交易的预估滑点跳数",
                        )

                # ── Risk & trading params ───────────────────────────────────
                with gr.Accordion("📈 风险 & 交易参数", open=False):
                    with gr.Row():
                        initial_capital = gr.Number(
                            label="初始资金",
                            value=trading_def.get("initial_capital", 100_000),
                        )
                        max_position = gr.Number(
                            label="最大持仓（股）",
                            value=trading_def.get("max_position", 100),
                            precision=0,
                        )
                    confidence_threshold = gr.Slider(
                        0.0, 1.0, value=default_conf, step=0.05,
                        label="置信度阈值（LLM决策最低置信度，低于此值转为观望）",
                    )

                # ── TqSDK credentials ───────────────────────────────────────
                with gr.Accordion("🔑 TqSDK 账户（期货数据源）", open=False, visible=False) as tq_creds_acc:
                    tq_username = gr.Textbox(
                        label="用户名", value=tq_creds.get("username", ""),
                    )
                    tq_password = gr.Textbox(
                        label="密码", type="password",
                        value=tq_creds.get("password", ""),
                    )
                    tq_use_sim = gr.Checkbox(label="使用模拟账户", value=True)

                # ── Run button ──────────────────────────────────────────────
                gr.Markdown("---")
                run_btn = gr.Button("▶  开始分析", variant="primary", size="lg")
                status_text = gr.Textbox(
                    label="状态", interactive=False,
                    value="等待分析…", max_lines=2,
                )

            # ── RIGHT: Results ───────────────────────────────────────────────
            with gr.Column(scale=1, min_width=400):

                with gr.Accordion("📋 决策摘要", open=True):
                    summary_out = gr.Markdown(value="_等待分析…_")

                with gr.Accordion("📈 技术指标快照", open=True):
                    indicators_out = gr.Markdown(value="_等待分析…_")

                with gr.Accordion("💬 LLM 推理过程", open=True):
                    reasoning_out = gr.Markdown(value="_等待分析…_")

                with gr.Accordion("📊 最近 K 线（最后20根）", open=False):
                    kline_out = gr.Dataframe(
                        headers=None, interactive=False, wrap=False,
                    )

        # ── Event wiring ─────────────────────────────────────────────────────

        # Toggle source-specific field groups and position unit labels
        data_source.change(
            fn=toggle_source,
            inputs=[data_source],
            outputs=[akshare_group, tqsdk_kline_group, futures_params_acc, tq_creds_acc,
                     initial_position, max_position],
        )

        # Apply initial source state on page load
        demo.load(
            fn=toggle_source,
            inputs=[data_source],
            outputs=[akshare_group, tqsdk_kline_group, futures_params_acc, tq_creds_acc,
                     initial_position, max_position],
        )

        # Auto-fill LLM fields when preset changes
        llm_provider.change(
            fn=on_provider_select,
            inputs=[llm_provider],
            outputs=[api_key, base_url, llm_model],
        )

        # Fill LLM fields on page load
        demo.load(
            fn=on_provider_select,
            inputs=[llm_provider],
            outputs=[api_key, base_url, llm_model],
        )

        # Main analysis button — all inputs in declaration order
        run_btn.click(
            fn=run_ui_analysis,
            inputs=[
                data_source, symbol,
                market, period, history_days,
                decision_period, auxiliary_periods,
                mode,
                llm_provider, api_key, base_url, llm_model,
                max_tokens, timeout_sec, temperature,
                initial_position, entry_price,
                initial_capital, max_position, confidence_threshold,
                margin_ratio, contract_multiplier, commission_per_lot, slippage_ticks,
                tq_username, tq_password, tq_use_sim,
            ],
            outputs=[summary_out, indicators_out, reasoning_out, kline_out, status_text],
            show_progress="full",
        )

    return demo


# ---------------------------------------------------------------------------
# Direct run
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="LLM 交易策略分析器 UI")
    parser.add_argument("--port", type=int, default=7860, help="监听端口")
    parser.add_argument("--host", default="0.0.0.0", help="监听地址")
    parser.add_argument("--share", action="store_true", help="生成 Gradio 公网分享链接")
    args = parser.parse_args()

    demo = build_ui()
    demo.launch(
        server_name=args.host,
        server_port=args.port,
        share=args.share,
        show_error=True,
        theme=gr.themes.Soft(),
    )

