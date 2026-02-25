"""UI Analysis Runner — bridges Gradio UI to trading engines.

Two paths:
  - AKShare: fetch_stock_data() → engine.decide(row, df, symbol)
  - TqSDK:   Backtester.analyze_latest()

LLM client is built from UI parameters (no config-file dependency).
"""
from __future__ import annotations

import sys
import traceback
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional

import pandas as pd
import yaml
from loguru import logger

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


# ---------------------------------------------------------------------------
# Config helpers
# ---------------------------------------------------------------------------

def load_preset_providers() -> Dict[str, Dict]:
    """Return providers that have an API key configured in api_keys.yaml."""
    config_path = ROOT / "config" / "api_keys.yaml"
    try:
        with open(config_path, "r", encoding="utf-8") as f:
            cfg = yaml.safe_load(f) or {}
        result = {}
        for name, conf in (cfg.get("providers") or {}).items():
            if conf and conf.get("api_key") and not str(conf["api_key"]).startswith("YOUR_"):
                result[name] = conf
        return result
    except Exception as e:
        logger.warning(f"读取 api_keys.yaml 失败: {e}")
        return {}


def load_trading_params() -> Dict:
    """Return trading_params.yaml as a dict (empty dict on error)."""
    config_path = ROOT / "config" / "trading_params.yaml"
    try:
        with open(config_path, "r", encoding="utf-8") as f:
            return yaml.safe_load(f) or {}
    except Exception:
        return {}


def load_tq_credentials() -> Dict[str, str]:
    """Return TqSDK username/password from api_keys.yaml."""
    config_path = ROOT / "config" / "api_keys.yaml"
    try:
        with open(config_path, "r", encoding="utf-8") as f:
            cfg = yaml.safe_load(f) or {}
        tq = cfg.get("tqsdk") or {}
        return {"username": tq.get("username", ""), "password": tq.get("password", "")}
    except Exception:
        return {"username": "", "password": ""}


# ---------------------------------------------------------------------------
# LLM client factory (UI-driven, no config file)
# ---------------------------------------------------------------------------

def build_llm_client(
    provider: str,
    api_key: str,
    base_url: str,
    model: str,
    max_tokens: int = 5000,
    timeout: int = 240,
    temperature: float = 1.0,
):
    """Build an LLM client directly from UI parameters."""
    if provider == "claude":
        from src.llm_engine.claude_client import ClaudeClient
        return ClaudeClient(
            api_key=api_key,
            model=model or "claude-3-5-sonnet-20241022",
            temperature=temperature,
            max_tokens=max_tokens,
            timeout=timeout,
        )
    else:
        from src.llm_engine.openai_client import OpenAIClient
        return OpenAIClient(
            api_key=api_key,
            base_url=base_url or "https://api.openai.com/v1",
            model=model or "gpt-3.5-turbo",
            temperature=temperature,
            max_tokens=max_tokens,
            timeout=timeout,
        )


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def run_analysis(params: Dict[str, Any]) -> Dict[str, Any]:
    """Dispatch to AKShare or TqSDK path. Returns a result dict."""
    data_source = params.get("data_source", "akshare")
    if data_source == "tqsdk":
        return _run_tqsdk(params)
    return _run_akshare(params)


# ---------------------------------------------------------------------------
# AKShare path
# ---------------------------------------------------------------------------

def _run_akshare(params: Dict[str, Any]) -> Dict[str, Any]:
    from src.data.akshare_fetcher import fetch_stock_data
    from src.backtest.models.decision import DecisionMode
    from src.backtest.models.position import Position
    from src.backtest.engines.quant_engine import SimpleQuantEngine
    from src.backtest.engines.llm_engine import LLMDirectEngine

    symbol = params["symbol"].strip()
    market = params.get("market", "a").lower()
    period = str(params.get("period", "daily"))
    history_days = int(params.get("history_days", 90))
    mode = DecisionMode(params.get("mode", "llm_direct"))

    end_date = datetime.now().strftime("%Y%m%d")
    start_date = (datetime.now() - timedelta(days=history_days)).strftime("%Y%m%d")

    logger.info(f"AKShare 拉取: {market.upper()} {symbol} [{period}] {start_date}~{end_date}")
    df = fetch_stock_data(symbol, market=market, period=period,
                          start_date=start_date, end_date=end_date)

    if df.empty or len(df) < 30:
        raise ValueError(f"数据不足（{len(df)} 根K线），请扩大历史天数或检查品种代码")

    row = df.iloc[-1].copy()

    # Build initial position if provided
    initial_position = int(params.get("initial_position", 0))
    entry_price_val = float(params.get("entry_price", 0.0))
    if initial_position != 0 and entry_price_val > 0:
        direction = "long" if initial_position > 0 else "short"
        initial_pos = Position(
            direction=direction,
            qty=abs(initial_position),
            entry_price=entry_price_val,
            stop=0.0,
            take=0.0,
        )
    else:
        initial_pos = None

    # Build LLM client from UI config
    llm_client = None
    if mode == DecisionMode.LLM_DIRECT:
        llm_cfg = params.get("llm_config") or {}
        if llm_cfg.get("api_key"):
            llm_client = build_llm_client(
                provider=llm_cfg.get("provider", "openai"),
                api_key=llm_cfg["api_key"],
                base_url=llm_cfg.get("base_url", ""),
                model=llm_cfg.get("model", ""),
                max_tokens=int(llm_cfg.get("max_tokens", 5000)),
                timeout=int(llm_cfg.get("timeout", 240)),
                temperature=float(llm_cfg.get("temperature", 1.0)),
            )

    max_pos = int(params.get("max_position", 100))
    initial_capital = float(params.get("initial_capital", 100_000))

    # Trade metadata for LLM context (stocks: no leverage, no futures specifics)
    trade_meta = {
        "initial_capital": initial_capital,
        "is_stock": True,
        "contract_multiplier": int(params.get("contract_multiplier", 1)),
        "commission_per_lot": float(params.get("commission_per_lot", 0.0)),
        "slippage_ticks": int(params.get("slippage_ticks", 0)),
        "tick_size": 0.01,
        "margin_ratio": float(params.get("margin_ratio", 1.0)),
    }

    if mode == DecisionMode.QUANT_ONLY:
        engine = SimpleQuantEngine(max_pos=max_pos)
        decision = engine.decide(row, df)

    else:  # llm_direct
        engine = LLMDirectEngine(max_pos=max_pos, llm_client=llm_client, trade_meta=trade_meta)
        engine.current_pos = initial_pos
        engine.current_balance = initial_capital
        decision = engine.decide(row, df, symbol)

    return {
        "decision": decision,
        "row": row,
        "df": df,
        "symbol": symbol,
        "market": market,
        "data_source": "akshare",
    }


# ---------------------------------------------------------------------------
# TqSDK path
# ---------------------------------------------------------------------------

def _run_tqsdk(params: Dict[str, Any]) -> Dict[str, Any]:
    from src.backtest.models.config import BTConfig
    from src.backtest.models.decision import DecisionMode
    from src.backtest.core.backtester import Backtester

    symbol = params["symbol"].strip()
    mode = DecisionMode(params.get("mode", "llm_direct"))

    # Parse multi-timeframe periods
    decision_period = params.get("decision_period")
    decision_period = int(decision_period) if decision_period else 240  # default 4h

    aux_raw = str(params.get("auxiliary_periods", "")).strip()
    auxiliary_periods: List[int] = []
    if aux_raw:
        try:
            auxiliary_periods = [int(p.strip()) for p in aux_raw.split(',') if p.strip()]
        except ValueError:
            logger.warning(f"辅助周期解析失败，忽略: {aux_raw!r}")

    tq_cfg = params.get("tqsdk_config") or {}
    username = tq_cfg.get("username") or None
    password = tq_cfg.get("password") or None
    use_sim = bool(tq_cfg.get("use_sim", True))

    # Patch LLMFactory so TqSDK path also honours UI-provided LLM settings
    llm_cfg = params.get("llm_config") or {}
    _restore_fn = None
    if llm_cfg.get("api_key"):
        _restore_fn = _patch_llm_factory(llm_cfg)

    try:
        cfg = BTConfig(
            symbol=symbol,
            decision_period=decision_period,
            auxiliary_periods=auxiliary_periods if auxiliary_periods else None,
            initial_capital=float(params.get("initial_capital", 50_000)),
            max_position=int(params.get("max_position", 2)),
            margin_ratio=float(params.get("margin_ratio", 0.18)),
            slippage_ticks=int(params.get("slippage_ticks", 1)),
            commission_per_lot=(
                float(params["commission_per_lot"])
                if params.get("commission_per_lot") else None
            ),
            initial_position=int(params.get("initial_position", 0)),
            entry_price=float(params.get("entry_price", 0.0)),
        )
        backtester = Backtester(cfg, mode, show_rationale=True)
        result = backtester.analyze_latest(
            username=username,
            password=password,
            use_sim=use_sim,
        )
    finally:
        if _restore_fn:
            _restore_fn()

    return {
        "decision": result.get("decision_obj"),
        "row": result.get("row"),
        "df": result.get("df"),
        "symbol": symbol,
        "data_source": "tqsdk",
        "raw_result": result,
    }


def _patch_llm_factory(llm_cfg: Dict) -> callable:
    """Monkey-patch LLMFactory.create_client to use UI credentials.

    Returns a restore function to undo the patch.
    """
    import src.llm_engine.llm_factory as factory_module

    original = factory_module.LLMFactory.create_client

    provider = llm_cfg.get("provider", "openai")
    api_key = llm_cfg["api_key"]
    base_url = llm_cfg.get("base_url", "")
    model = llm_cfg.get("model", "")
    max_tokens = int(llm_cfg.get("max_tokens", 5000))
    timeout = int(llm_cfg.get("timeout", 240))
    temperature = float(llm_cfg.get("temperature", 1.0))

    @staticmethod
    def _patched(config_path=None):
        return build_llm_client(provider, api_key, base_url, model,
                                max_tokens, timeout, temperature)

    factory_module.LLMFactory.create_client = _patched

    def restore():
        factory_module.LLMFactory.create_client = original

    return restore
