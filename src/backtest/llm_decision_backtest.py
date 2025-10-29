r"""
LLM Direct Decision Backtest (TqSDK based)

Quick prototype to compare three modes:
- quant_only: simple MA/RSI quant logic
- hybrid: quant + LLM expert review when confidence is low
- llm_direct: LLM makes the trade decision directly

Usage:
  python src\backtest\llm_decision_backtest.py --mode llm_direct --symbol CZCE.SA0 --period 15 --cache logs\llm_decisions_cache.json --initial_units 2.0 --margin_ratio 0.18

Parameters:
  --period: K-line period in MINUTES (1=1min, 15=15min, 60=1hour, 1440=daily)
  --count: [Optional] Number of K-lines to fetch (auto-calculated if not specified)
  --initial_units: Initial position units in lots (default: 2.0)
  --margin_ratio: Margin ratio for futures (default: 0.18 = 18%)
                  Initial capital = price × multiplier × units × margin_ratio × 2.0 (with buffer)
                  Example: SA price 1500, units 2.0, margin 18%
                    → Contract value = 1500 × 20 × 2 = 60,000
                    → Required margin = 60,000 × 0.18 = 10,800
                    → Initial capital = 10,800 × 2.0 = 21,600 (with 100% buffer)
  --visual_prompt: [Experimental] Use visual/neutral prompt with ASCII K-line charts
                   instead of structured JSON features
  --show_rationale: Show detailed rationale for each decision (default: False)

Examples:
  # 15-minute backtest with 18% margin ratio
  python src\backtest\llm_decision_backtest.py --mode llm_direct --symbol CZCE.SA0 --period 15 --margin_ratio 0.18

  # 15-minute backtest with custom units and margin
  python src\backtest\llm_decision_backtest.py --mode llm_direct --symbol CZCE.SA0 --period 15 --initial_units 3.0 --margin_ratio 0.20

  # Daily K-line backtest
  python src\backtest\llm_decision_backtest.py --mode llm_direct --symbol CZCE.SA0 --period 1440 --start "2024-01-01 09:00" --end "2024-12-31 15:00"

Notes:
- Uses TqSDK native technical indicators (MA, RSI, MACD, ATR, etc.) EXCLUSIVELY
- NO manual indicator calculation fallback - ensures data quality and consistency
- Requires sufficient data length (recommended: ≥100 bars) to avoid NaN values
- If LLM credentials are missing, falls back to quant-only for that step
- Cache can be used to make runs deterministic and avoid repeated LLM calls
- Margin ratio affects initial capital calculation but TqSDK manages margin internally
- Critical indicators (ma10, ma30, rsi, atr) are validated before each decision
- Bars with missing/NaN indicators are automatically skipped
"""

from __future__ import annotations

import argparse
import json
import os
import logging
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timedelta
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd
from loguru import logger

# Ensure project root on sys.path when run as a script
ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# Local imports (avoid heavy dependencies; use light wrappers we already have)
from src.data_fetcher.tqsdk_client import TqSdkClient
from src.llm_engine.llm_factory import LLMFactory
from src.llm_engine.response_parser import ResponseParser
from src.llm_engine.market_representation import (
    EventDetector,
    MarketRepresentationGenerator,
    MarketEvent,
    MarketRepresentation,
)


class DecisionMode(str, Enum):
    QUANT_ONLY = "quant_only"
    HYBRID = "hybrid"
    LLM_DIRECT = "llm_direct"


@dataclass
class Decision:
    action: str  # 'open_long' | 'open_short' | 'close_long' | 'close_short' | 'adjust_position' | 'hold'
    position_size: int = 0
    stop_loss: float = 0.0
    take_profit: float = 0.0
    confidence: float = 0.0
    rationale: List[str] = None

    # Enhanced fields
    target_position: int = 0  # 目标持仓手数（用于adjust_position）
    position_percent: float = 0.0  # 目标仓位百分比
    market_regime: str = ""  # 识别的市场状态
    opportunity_quality: str = ""  # 机会质量评估
    risk_factors: List[str] = None  # 风险因素列表

    # Four-step reasoning chain
    market_diagnosis: str = ""  # 市场状态诊断
    opportunity_assessment: str = ""  # 交易机会评估
    risk_analysis: str = ""  # 风险收益分析
    execution_plan: str = ""  # 执行方案

    def to_dict(self) -> Dict[str, Any]:
        return {
            "action": self.action,
            "position_size": int(self.position_size),
            "target_position": int(self.target_position),
            "stop_loss": float(self.stop_loss or 0.0),
            "take_profit": float(self.take_profit or 0.0),
            "confidence": float(self.confidence or 0.0),
            "rationale": list(self.rationale or []),
            "position_percent": float(self.position_percent or 0.0),
            "market_regime": str(self.market_regime or ""),
            "opportunity_quality": str(self.opportunity_quality or ""),
            "risk_factors": list(self.risk_factors or []),
            "market_diagnosis": str(self.market_diagnosis or ""),
            "opportunity_assessment": str(self.opportunity_assessment or ""),
            "risk_analysis": str(self.risk_analysis or ""),
            "execution_plan": str(self.execution_plan or ""),
        }


class SimpleQuantEngine:
    """Lightweight quant baseline: MA crossover + RSI filter.

    Note: ONLY uses TqSDK pre-calculated indicators (ma10, ma30, rsi, atr).
    No manual calculation fallback to ensure data quality.
    """

    def __init__(self, max_pos: int = 1):
        self.max_pos = max_pos

    def decide(self, row: pd.Series, df: pd.DataFrame) -> Decision:
        close = row["close"]
        idx = row.name

        # ONLY use TqSDK-calculated indicators - no fallback
        # Return hold if indicators are missing or NaN
        required_indicators = ["ma10", "ma30", "rsi", "atr"]
        for indicator in required_indicators:
            if indicator not in row.index or pd.isna(row.get(indicator)):
                logger.debug(f"指标 {indicator} 缺失或为NaN，返回hold决策")
                return Decision(
                    action="hold",
                    position_size=0,
                    stop_loss=0.0,
                    take_profit=0.0,
                    confidence=0.0,
                    rationale=[f"missing_{indicator}"]
                )

        # Extract TqSDK indicators
        ma_fast = float(row["ma10"])
        ma_slow = float(row["ma30"])
        rsi = float(row["rsi"])
        atr = float(row["atr"])

        # Validate ATR is positive
        if atr <= 0:
            logger.warning(f"ATR无效 ({atr})，返回hold决策")
            return Decision(
                action="hold",
                position_size=0,
                stop_loss=0.0,
                take_profit=0.0,
                confidence=0.0,
                rationale=["invalid_atr"]
            )

        # Generate signal based on MA crossover and RSI filter
        signal_strength = 0.0
        action = "hold"

        spread = (ma_fast - ma_slow) / max(1e-6, ma_slow)
        if spread > 0.001 and rsi > 52:
            action = "open_long"
            signal_strength = min(1.0, max(0.55, spread * 50))
        elif spread < -0.001 and rsi < 48:
            action = "open_short"
            signal_strength = min(1.0, max(0.55, -spread * 50))

        # Calculate stop loss and take profit using TqSDK ATR
        take = close + (2.5 * atr) if action == "open_long" else (close - 2.5 * atr if action == "open_short" else 0)
        stop = close - (1.5 * atr) if action == "open_long" else (close + 1.5 * atr if action == "open_short" else 0)

        pos = self.max_pos if action != "hold" else 0
        return Decision(
            action=action,
            position_size=pos,
            stop_loss=stop,
            take_profit=take,
            confidence=signal_strength,
            rationale=["simple_quant_tqsdk"]
        )


class LLMDirectEngine:
    def __init__(self, cache: Optional[Dict[str, Any]] = None, cache_write: Optional[Path] = None, max_pos: int = 1, feature_mode: str = "neutral", trade_meta: Optional[Dict[str, Any]] = None, use_visual_prompt: bool = False):
        self.max_pos = max_pos
        self.cache = cache or {}
        self.cache_write = cache_write
        self.feature_mode = feature_mode
        self.trade_meta = trade_meta or {}
        self.use_visual_prompt = use_visual_prompt  # Deprecated: now always uses enhanced representation
        try:
            self.client = LLMFactory.create_client()
        except Exception as e:
            logger.warning(f"LLM client init failed, fallback to quant baseline: {e}")
            self.client = None
        self.quant_fallback = SimpleQuantEngine(max_pos=self.max_pos)
        self.current_pos = None  # Backtester会在每根bar前注入当前持仓
        self.current_balance = None  # Backtester会在每根bar前注入当前资金

        # Initialize enhanced market representation system
        self.market_rep_generator = MarketRepresentationGenerator(
            event_detector=EventDetector()
        )
    def _cache_get(self, key: str) -> Optional[Decision]:
        if key in self.cache:
            data = self.cache[key]
            return Decision(
                # Core fields
                action=data.get("action", "hold"),
                position_size=int(data.get("position_size", 0)),
                target_position=int(data.get("target_position", 0)),
                stop_loss=float(data.get("stop_loss", 0) or 0),
                take_profit=float(data.get("take_profit", 0) or 0),
                confidence=float(data.get("confidence", 0) or 0),
                rationale=list(data.get("rationale", [])),

                # Enhanced fields
                position_percent=float(data.get("position_percent", 0) or 0),
                market_regime=str(data.get("market_regime", "") or ""),
                opportunity_quality=str(data.get("opportunity_quality", "") or ""),
                risk_factors=list(data.get("risk_factors", [])),

                # Four-step reasoning chain
                market_diagnosis=str(data.get("market_diagnosis", "") or ""),
                opportunity_assessment=str(data.get("opportunity_assessment", "") or ""),
                risk_analysis=str(data.get("risk_analysis", "") or ""),
                execution_plan=str(data.get("execution_plan", "") or ""),
            )
        return None

    def _cache_put(self, key: str, decision: Decision):
        if self.cache_write is None:
            return
        self.cache[key] = decision.to_dict()
        try:
            self.cache_write.parent.mkdir(parents=True, exist_ok=True)
            with open(self.cache_write, "w", encoding="utf-8") as f:
                json.dump(self.cache, f, ensure_ascii=False, indent=2, default=str)
        except Exception as e:
            logger.warning(f"write cache failed: {e}")

    def _build_enhanced_prompt(self, row: pd.Series, df: pd.DataFrame, symbol: str) -> str:
        """
        构建增强版决策prompt - 基于三级市场表示和四步决策框架

        核心改进：
        1. 三级信息结构（原始数据 + 特征描述 + 状态摘要）
        2. 事件时间线
        3. 四步决策框架引导
        4. 动态置信度评估
        """

        # 生成三级市场表示
        market_rep = self.market_rep_generator.generate(row, df, symbol)

        # 获取当前持仓和账户信息
        pos_obj = self.current_pos
        balance = self.current_balance
        initial_capital = self.trade_meta.get('initial_capital', 100000)

        # 当前持仓描述
        if pos_obj and pos_obj.direction != "none":
            current_price = float(row['close'])
            entry_price = float(pos_obj.entry_price or 0)
            qty = int(pos_obj.qty or 0)
            contract_multiplier = self.trade_meta.get('contract_multiplier', 20)

            # 价格本身的涨跌幅（不考虑杠杆/手数），仅作参考
            price_change_pct = ((current_price / entry_price - 1) * 100) if entry_price > 0 else 0.0
            if pos_obj.direction == "short":
                price_change_pct = -price_change_pct

            # 优先使用 TqSDK 导出的浮动盈亏；无则按价差×乘数×手数估算
            snapshot = getattr(self, 'tqsdk_snapshot', None)
            acc_snap = (snapshot or {}).get('account') or {}
            pos_snap = (snapshot or {}).get('position') or {}
            tq_pos_pnl_long = pos_snap.get('float_profit_long')
            tq_pos_pnl_short = pos_snap.get('float_profit_short')
            tq_acc_float_profit = acc_snap.get('float_profit')
            tq_static_balance = acc_snap.get('static_balance')

            float_pnl = 0.0
            if entry_price > 0 and qty > 0:
                if pos_obj.direction == "long":
                    float_pnl = tq_pos_pnl_long if tq_pos_pnl_long is not None else (current_price - entry_price) * contract_multiplier * qty
                else:
                    float_pnl = tq_pos_pnl_short if tq_pos_pnl_short is not None else (entry_price - current_price) * contract_multiplier * qty
            # 若持仓级别缺失，则回退到账户级浮盈
            if (qty == 0 or entry_price <= 0) and tq_acc_float_profit is not None:
                float_pnl = tq_acc_float_profit

            pct_base = float(tq_static_balance) if tq_static_balance else float(initial_capital)
            pnl_pct = (float_pnl / pct_base * 100.0) if pct_base > 0 else 0.0

            position_info = f"""
## 📋 当前持仓状态
- 方向: {pos_obj.direction.upper()}
- 持仓: {qty}手
- 开仓价: {entry_price:.2f}
- 当前价: {current_price:.2f}
- 浮动盈亏: {pnl_pct:+.2f}% ({float_pnl:+.0f}元，按初始资金比例)
- 标的涨跌: {price_change_pct:+.2f}%（价格变动）
"""
        else:
            position_info = """
## 📋 当前持仓状态
- 当前无持仓（空仓）
"""

        # 账户信息
        margin_ratio = self.trade_meta.get('margin_ratio', 0.18)
        account_info = f"""
## 💰 账户状态
- 初始资金: {initial_capital:,.2f}
- 当前权益: {balance:,.2f}
- 最大持仓: {self.max_pos}手
- 保证金比例: {margin_ratio:.1%}
- 总收益率: {((balance / initial_capital - 1) * 100):+.2f}%
"""

        # 交易成本信息
        costs_info = f"""
## 💸 交易成本
- 保证金比例: {margin_ratio:.1%}（每手占用合约价值的{margin_ratio:.1%}作为保证金）
- 手续费: {self.trade_meta.get('commission_per_lot', 3.0)}元/手
- 滑点: {self.trade_meta.get('slippage_ticks', 1)}跳
- 最小变动: {self.trade_meta.get('tick_size', 1.0)}元/吨
"""

        # 组装完整prompt
        prompt = f"""# 期货交易决策系统 - 纯碱(SA)合约

你是一位经验丰富的期货交易专家，需要基于市场数据做出专业的交易决策。

{market_rep.to_markdown()}

{position_info}

{account_info}

{costs_info}

---

# 🎯 决策任务

请按照专业交易员的思维框架，系统性地分析并输出交易决策。

## 第一步：市场状态诊断 🔍

请分析：
- 当前市场处于什么状态？（强势趋势/温和趋势/震荡/反转）
- 主要驱动因素是什么？（价格突破/成交量确认/技术指标/时间周期）
- 市场情绪如何？（恐慌/贪婪/犹豫/理性）
- 波动率处于什么状态？（扩张/收缩/正常）

## 第二步：交易机会评估 💡

请评估：
- 识别到的机会是什么？（趋势跟随/均值回归/突破/套利）
- 信号强度如何？（强/中/弱）
- 确认程度如何？（多重确认/部分确认/单一信号）
- 时间窗口如何？（立即/短期观察/长期跟踪）
- 机会质量评级？（A级优质/B级良好/C级一般/D级观望）

## 第三步：风险收益分析 ⚖️

请分析：
- 预期收益是多少？（目标价位和预期收益率）
- 潜在风险是多少？（止损价位和最大亏损）
- 风险收益比是否合适？（建议至少1:2）
- 主要风险因素有哪些？（技术风险/基本面风险/流动性风险）
- 如何管理这些风险？（止损策略/分批建仓/仓位控制）

## 第四步：执行方案制定 📝

请制定：
- 具体操作：开仓/平仓/调仓/观望？
- 仓位大小：建议持仓手数和账户占比
- 入场时机：立即入场还是等待确认？
- 出场计划：止损价位、止盈价位
- 风险控制：最大亏损限额

---

# 📤 决策输出格式

基于以上四步分析，请输出标准JSON格式的最终决策：

```json
{{
  "action": "open_long|open_short|close_long|close_short|adjust_position|hold",
  "position_size": <int, 本次操作手数>,
  "target_position": <int, 目标总持仓手数（用于adjust_position）>,
  "stop_loss": <float, 止损价格（绝对价格）>,
  "take_profit": <float, 止盈价格（绝对价格）>,
  "confidence": <float 0.0-1.0, 决策置信度>,
  "position_percent": <float 0.0-1.0, 目标仓位占账户比例>,
  "market_regime": "<string, 市场状态诊断结果>",
  "opportunity_quality": "<string, 机会质量评级 A/B/C/D>",
  "rationale": ["<brief reason1>", "<brief reason2>", "<brief reason3>"],
  "risk_factors": ["<risk1>", "<risk2>"],
  "market_diagnosis": "<string, 第一步分析摘要>",
  "opportunity_assessment": "<string, 第二步分析摘要>",
  "risk_analysis": "<string, 第三步分析摘要>",
  "execution_plan": "<string, 第四步执行方案摘要>"
}}
```

## ⚠️ 重要提示

**动态置信度评估标准**（根据市场实际情况调整，不要使用固定值）：
- 0.9-1.0: 极强信号 - 多重确认，趋势清晰，成交量放大，技术形态完美
- 0.7-0.9: 强信号 - 趋势明确，有成交量确认，技术指标支持
- 0.5-0.7: 中等信号 - 趋势初现，部分确认，存在一定不确定性
- 0.3-0.5: 弱信号 - 信号不明确，缺乏确认，建议观望或小仓位试探
- 0.0-0.3: 极弱信号 - 信号冲突，市场混乱，强烈建议观望

**Action说明**：
- open_long: 开多仓
- open_short: 开空仓
- close_long: 平多仓
- close_short: 平空仓
- adjust_position: 调整现有仓位（增仓/减仓）
- hold: 观望/保持当前状态

**仓位管理原则**：
- 单次风险不超过账户的2%
- 根据ATR和波动率动态调整仓位
- 高波动环境减小仓位，低波动环境可适当增加
- 趋势明确时可持有满仓，震荡市应轻仓或观望

请基于以上框架进行深入分析，输出结构化的专业决策。
"""

        return prompt

    def decide(self, row: pd.Series, df: pd.DataFrame, symbol: str) -> Decision:
        """
        Enhanced decision making with three-level market representation
        and four-step decision framework.
        """
        ts_key = pd.to_datetime(row["timestamp"]).isoformat()
        cached = self._cache_get(ts_key)
        if cached is not None:
            return cached

        if self.client is None:
            logger.warning("LLM client not available, falling back to quant baseline")
            return self.quant_fallback.decide(row, df)

        try:
            # Generate enhanced prompt with three-level representation
            prompt = self._build_enhanced_prompt(row, df, symbol)

            # Call LLM
            raw_response = self.client.chat(prompt)

            # Debug logging for response
            logger.debug(f"LLM原始响应长度: {len(raw_response)} 字符")
            logger.debug(f"LLM原始响应前200字符: {raw_response[:200]}")
            logger.debug(f"LLM原始响应后200字符: {raw_response[-200:]}")

            cleaned_response = ResponseParser.clean_response(raw_response)
            logger.debug(f"清理后响应长度: {len(cleaned_response)} 字符")

            data = ResponseParser.parse_json(cleaned_response)

            if data is None:
                logger.error(f"JSON解析失败，使用量化回退策略")
                logger.error(f"清理后响应全文: {cleaned_response}")
                return self.quant_fallback.decide(row, df)

            # Validate and parse action
            action = str(data.get("action", "hold")).strip().lower()
            valid_actions = ["open_long", "open_short", "close_long", "close_short", "adjust_position", "hold"]

            if action not in valid_actions:
                logger.warning(f"Invalid action '{action}', defaulting to 'hold'")
                action = "hold"

            # Parse enhanced fields
            decision = Decision(
                # Core fields
                action=action,
                position_size=int(max(0, min(self.max_pos, int(data.get("position_size", 0))))),
                target_position=int(data.get("target_position", 0)),
                stop_loss=float(data.get("stop_loss", 0) or 0),
                take_profit=float(data.get("take_profit", 0) or 0),
                confidence=float(data.get("confidence", 0) or 0),
                rationale=[str(x) for x in (data.get("rationale") or [])],

                # Enhanced fields
                position_percent=float(data.get("position_percent", 0) or 0),
                market_regime=str(data.get("market_regime", "") or ""),
                opportunity_quality=str(data.get("opportunity_quality", "") or ""),
                risk_factors=[str(x) for x in (data.get("risk_factors") or [])],

                # Four-step reasoning chain
                market_diagnosis=str(data.get("market_diagnosis", "") or ""),
                opportunity_assessment=str(data.get("opportunity_assessment", "") or ""),
                risk_analysis=str(data.get("risk_analysis", "") or ""),
                execution_plan=str(data.get("execution_plan", "") or ""),
            )

            # Log decision details if show_rationale is enabled
            if hasattr(self, 'show_rationale') and getattr(self, 'show_rationale', False):
                logger.info(f"[{ts_key}] LLM Decision:")
                logger.info(f"  Market Regime: {decision.market_regime}")
                logger.info(f"  Opportunity: {decision.opportunity_quality}")
                logger.info(f"  Action: {decision.action} (Confidence: {decision.confidence:.2%})")

        except Exception as e:
            logger.warning(f"LLM decision failed, fallback to quant: {e}")
            decision = self.quant_fallback.decide(row, df)

        self._cache_put(ts_key, decision)
        return decision


class HybridEngine:
    """Quant decision with optional LLM expert review when confidence is low."""

    def __init__(self, low_conf_th: float = 0.7, cache: Optional[Dict[str, Any]] = None, cache_write: Optional[Path] = None, max_pos: int = 1, feature_mode: str = "neutral", trade_meta: Optional[Dict[str, Any]] = None, use_visual_prompt: bool = False):
        self.low_conf_th = low_conf_th
        self.quant = SimpleQuantEngine(max_pos=max_pos)
        self.llm_direct = LLMDirectEngine(cache=cache, cache_write=cache_write, max_pos=max_pos, feature_mode=feature_mode, trade_meta=trade_meta, use_visual_prompt=use_visual_prompt)

    def decide(self, row: pd.Series, df: pd.DataFrame, symbol: str) -> Decision:
        q = self.quant.decide(row, df)
        if q.action == "hold" or q.confidence >= self.low_conf_th:
            return q
        # Ask LLM to approve/reject
        ts_key = pd.to_datetime(row["timestamp"]).isoformat()
        cache_key = f"review::{ts_key}"
        cached = self.llm_direct._cache_get(cache_key)
        if cached is not None:
            # Interpret cached as final decision
            return cached

        review_prompt = (
            "You are reviewing a quant signal. Return STRICT JSON: {\"approved\":bool, \"concerns\":[str], \"warnings\":[str]}\n"
            f"Signal: {json.dumps(q.to_dict(), ensure_ascii=False)}\n"
            "If not confident, set approved=false and add reasons."
        )
        try:
            client = self.llm_direct.client
            if client is None:
                return q
            raw = client.chat(review_prompt)
            resp = ResponseParser.parse_expert_review(raw)
            if not resp.get("approved", False):
                d = Decision(action="hold", position_size=0, confidence=0.0, rationale=["llm_reject"] + (resp.get("concerns") or []))
                self.llm_direct._cache_put(cache_key, d)
                return d
            # approved: keep quant
            d = Decision(**q.to_dict())
            d.rationale = (d.rationale or []) + ["llm_approved"]
            self.llm_direct._cache_put(cache_key, d)
            return d
        except Exception:
            return q


@dataclass
class BTConfig:
    symbol: str = "CZCE.SA0"
    period: int = 15  # Period in MINUTES (1=1min, 15=15min, 60=1hour, 1440=daily)
    count: Optional[int] = None  # Number of K-lines to fetch (auto-calculated if None)
    initial_capital: float = 100000.0
    max_position: int = 1
    commission_per_lot: float = 3.0
    slippage_ticks: int = 1
    tick_size: float = 1.0
    margin_ratio: float = 0.18  # 保证金比例，默认18%

    def get_duration_seconds(self) -> int:
        """Convert period (minutes) to TqSDK duration_seconds."""
        return self.period * 60

    def get_auto_count(self) -> int:
        """Auto-calculate reasonable K-line count based on period."""
        # Ensure at least 250 data points for indicator calculation
        # Daily: 250 bars = ~1 year, 15min: 1200 bars = ~2 weeks
        if self.count is not None:
            return self.count
        if self.period >= 1440:  # Daily or above
            return 300  # ~1 year
        elif self.period >= 240:  # 4-hour
            return 500
        elif self.period >= 60:  # 1-hour
            return 800
        elif self.period >= 15:  # 15-min
            return 1200
        else:  # 1-min or 5-min
            return 3000


@dataclass
class Position:
    direction: str  # 'long'|'short'
    qty: int
    entry_price: float
    stop: float
    take: float


class Backtester:
    def __init__(self, cfg: BTConfig, mode: DecisionMode, cache_path: Optional[Path] = None, llm_input: str = "neutral", llm_ignore_risk: bool = False, initial_units: Optional[float] = None, use_visual_prompt: bool = False, show_rationale: bool = False, margin_ratio: Optional[float] = None):
        self.cfg = cfg
        self.mode = mode
        self.cache_path = cache_path
        self.llm_input = llm_input
        self.llm_ignore_risk = llm_ignore_risk
        self.initial_units = initial_units  # None表示使用cfg.initial_capital，否则根据价格*units*margin_ratio计算
        self.use_visual_prompt = use_visual_prompt  # New: enable visual/neutral prompt
        self.show_rationale = show_rationale  # Control rationale output
        # 保证金比例：优先使用传入参数，否则使用cfg中的默认值
        if margin_ratio is not None:
            self.cfg.margin_ratio = margin_ratio
        # load cache
        cache: Dict[str, Any] = {}
        if cache_path and cache_path.exists():
            try:
                cache = json.loads(cache_path.read_text(encoding="utf-8"))
            except Exception as e:
                logger.warning(f"load cache failed: {e}")
        # common meta for LLM
        trade_meta = {
            "tick_size": cfg.tick_size,
            "slippage_ticks": cfg.slippage_ticks,
            "commission_per_lot": cfg.commission_per_lot,
            "initial_capital": cfg.initial_capital,
            "margin_ratio": cfg.margin_ratio,
            "contract_multiplier": 20,
        }
        # engines
        if mode == DecisionMode.QUANT_ONLY:
            self.engine = SimpleQuantEngine(max_pos=cfg.max_position)
        elif mode == DecisionMode.HYBRID:
            self.engine = HybridEngine(cache=cache, cache_write=cache_path, max_pos=cfg.max_position, feature_mode=self.llm_input, trade_meta=trade_meta, use_visual_prompt=self.use_visual_prompt)
        else:
            self.engine = LLMDirectEngine(cache=cache, cache_write=cache_path, max_pos=cfg.max_position, feature_mode=self.llm_input, trade_meta=trade_meta, use_visual_prompt=self.use_visual_prompt)
            # Pass show_rationale flag to engine for detailed logging
            self.engine.show_rationale = self.show_rationale

    def run_tqsdk(self, start_dt: datetime, end_dt: datetime, username: Optional[str] = None, password: Optional[str] = None, use_sim: bool = True) -> Dict[str, Any]:
        try:
            from tqsdk import TqApi, TqBacktest, TqAuth, TqSim, TargetPosTask
            from tqsdk.ta import MA, RSI, ATR, MACD
        except Exception as e:
            logger.error(f"未安装或无法导入TqSDK: {e}")
            raise

        # Setup authentication
        auth = None
        if username and password:
            try:
                auth = TqAuth(username, password)
            except Exception:
                auth = None

        # Calculate initial capital if using units-based sizing
        # Need to create a temporary API to fetch first price
        initial_capital = self.cfg.initial_capital
        if self.initial_units is not None:
            logger.info(f"准备根据单位数 {self.initial_units} 计算初始资金...")
            try:
                # Create temporary API to fetch price
                temp_api = TqApi(auth=auth) if auth else TqApi()
                sym_up = (self.cfg.symbol or "").strip().upper()
                symbol_tq_data = "KQ.m@CZCE.SA" if (sym_up == "SA0" or sym_up.endswith(".SA0") or sym_up == "CZCE.SA0" or sym_up == "SA" or sym_up == "CZCE.SA") else (f"CZCE.{self.cfg.symbol}" if (sym_up.startswith("SA") and "." not in sym_up) else self.cfg.symbol)
                temp_quote = temp_api.get_quote(symbol_tq_data)
                # Add timeout to prevent hanging
                temp_api.wait_update(deadline=time.time() + 10)  # 10 second timeout
                first_price = float(temp_quote.last_price)
                temp_api.close()

                contract_multiplier = 20  # 纯碱合约乘数：20吨/手
                margin_ratio = self.cfg.margin_ratio  # 保证金比例
                
                # 计算合约价值和所需保证金
                contract_value = first_price * contract_multiplier * self.initial_units
                required_margin = contract_value * margin_ratio
                
                # 初始资金 = 所需保证金 + 额外缓冲（建议至少1.5倍保证金以应对风险）
                # 这里使用2倍保证金作为初始资金，确保有足够的风险承受能力
                initial_capital = required_margin * 2.0
                
                self.cfg.initial_capital = initial_capital
                # 同步更新trade_meta中的initial_capital，避免LLM prompt中显示错误的初始资金
                if hasattr(self.engine, 'llm_direct') and hasattr(self.engine.llm_direct, 'trade_meta'):
                    self.engine.llm_direct.trade_meta['initial_capital'] = initial_capital
                    self.engine.llm_direct.trade_meta['margin_ratio'] = margin_ratio
                elif hasattr(self.engine, 'trade_meta'):
                    self.engine.trade_meta['initial_capital'] = initial_capital
                    self.engine.trade_meta['margin_ratio'] = margin_ratio
                
                logger.info(f"根据单位数和保证金比例计算初始资金:")
                logger.info(f"  合约价值: {first_price:.2f} × {contract_multiplier} × {self.initial_units} = {contract_value:,.2f}")
                logger.info(f"  所需保证金: {contract_value:,.2f} × {margin_ratio:.1%} = {required_margin:,.2f}")
                logger.info(f"  初始资金: {required_margin:,.2f} × 2.0 = {initial_capital:,.2f} (含缓冲)")
            except Exception as e:
                logger.warning(f"无法获取价格计算初始资金，使用默认值: {e}")
                initial_capital = self.cfg.initial_capital

        # Create backtest API with calculated initial capital
        if auth:
            api = TqApi(account=TqSim(init_balance=initial_capital), auth=auth, backtest=TqBacktest(start_dt=start_dt, end_dt=end_dt))
        else:
            api = TqApi(account=TqSim(init_balance=initial_capital), backtest=TqBacktest(start_dt=start_dt, end_dt=end_dt))

        # Get trading symbol and K-line data
        duration_seconds = self.cfg.get_duration_seconds()
        data_length = self.cfg.get_auto_count() + 50  # Extra for warmup
        sym_up = (self.cfg.symbol or "").strip().upper()

        # For data: use continuous contract KQ.m@CZCE.SA
        symbol_tq_data = "KQ.m@CZCE.SA" if (sym_up == "SA0" or sym_up.endswith(".SA0") or sym_up == "CZCE.SA0" or sym_up == "SA" or sym_up == "CZCE.SA") else (f"CZCE.{self.cfg.symbol}" if (sym_up.startswith("SA") and "." not in sym_up) else self.cfg.symbol)

        # Get dominant contract for trading
        quote = api.get_quote(symbol_tq_data)
        klines = api.get_kline_serial(symbol_tq_data, duration_seconds=duration_seconds, data_length=data_length)
        api.wait_update()  # Wait for first update after subscriptions
        symbol_tq_trade = quote.underlying_symbol if hasattr(quote, 'underlying_symbol') and quote.underlying_symbol else "CZCE.SA501"

        # Calculate technical indicators using TqSDK
        # IMPORTANT: TqSDK indicators require sufficient data length to avoid NaN
        # - MA needs at least n bars (e.g., MA30 needs 30 bars)
        # - RSI needs at least 15 bars (14 period + 1 for diff)
        # - ATR needs at least 15 bars (14 period + 1 for TR)
        # - MACD needs at least 26 bars (slow EMA period)
        logger.info(f"开始计算TqSDK技术指标，数据长度: {len(klines)} bars")

        try:
            # Calculate indicators using TqSDK native functions
            ma10 = MA(klines, 10)
            ma30 = MA(klines, 30)
            ma60 = MA(klines, 60)
            rsi_series = RSI(klines, 14)
            atr_series = ATR(klines, 14)
            macd_series = MACD(klines, 12, 26, 9)

            # Add to klines DataFrame with explicit column names
            klines["ma10"] = ma10["ma"].astype(float)
            klines["ma30"] = ma30["ma"].astype(float)
            klines["ma60"] = ma60["ma"].astype(float)
            klines["rsi"] = rsi_series["rsi"].astype(float)
            klines["atr"] = atr_series["atr"].astype(float)
            klines["macd"] = macd_series["diff"].astype(float)
            klines["macd_dea"] = macd_series["dea"].astype(float)
            klines["macd_bar"] = macd_series["bar"].astype(float)

            # Verify indicators have valid values
            total_bars = len(klines)
            valid_count = {
                'ma10': (~klines["ma10"].isna()).sum(),
                'ma30': (~klines["ma30"].isna()).sum(),
                'ma60': (~klines["ma60"].isna()).sum(),
                'rsi': (~klines["rsi"].isna()).sum(),
                'atr': (~klines["atr"].isna()).sum(),
                'macd': (~klines["macd"].isna()).sum(),
            }

            logger.info(f"✅ 技术指标计算完成: MA(10,30,60), RSI(14), ATR(14), MACD(12,26,9)")
            logger.info(f"📊 有效数据点统计:")
            for indicator, count in valid_count.items():
                valid_pct = (count / total_bars * 100) if total_bars > 0 else 0
                logger.info(f"  - {indicator.upper()}: {count}/{total_bars} ({valid_pct:.1f}%)")

                # Warn if insufficient valid data
                if count < total_bars * 0.5:
                    logger.warning(f"⚠️ {indicator} 有效数据不足50%，可能影响策略表现")
                elif count == 0:
                    logger.error(f"❌ {indicator} 完全无有效数据，请检查数据长度是否足够")

            # Determine first bar when all critical indicators are valid (no NaN)
            ready_mask = (
                (~klines["ma10"].isna()) &
                (~klines["ma30"].isna()) &
                (~klines["rsi"].isna()) &
                (~klines["atr"].isna())
            )
            first_ready_time = pd.to_datetime(klines.loc[ready_mask, "datetime"].iloc[0]) if ready_mask.any() else None
            if first_ready_time is None:
                logger.error(f"关键指标(ma10/ma30/rsi/atr)始终为NaN，数据长度不足（建议≥60根K线），当前: {len(klines)}")
                raise RuntimeError("insufficient_data_for_indicators")
            warmup_logged = False

            # Check minimum data requirements
            min_required = max(60, 26, 14)  # Max of MA60, MACD slow, RSI/ATR
            if total_bars < min_required:
                logger.error(f"❌ 数据长度不足: {total_bars} < {min_required}，指标可能大量为NaN")

            # Verify at least some valid data in critical indicators
            critical_indicators = ['ma10', 'ma30', 'rsi', 'atr']
            for ind in critical_indicators:
                if valid_count[ind] == 0:
                    raise RuntimeError(f"关键指标 {ind} 完全无有效数据，无法继续回测")

        except Exception as e:
            logger.error(f"❌ TqSDK指标计算失败: {e}")
            logger.error("提示: 确保数据长度足够（建议至少100根K线）")
            raise RuntimeError(f"TqSDK指标计算失败，无法继续回测: {e}")

        logger.info(f"=== TqSDK原生回测 ===")
        logger.info(f"数据合约: {symbol_tq_data}")
        logger.info(f"交易合约: {symbol_tq_trade}")
        logger.info(f"回测区间: {start_dt} ~ {end_dt}")
        logger.info(f"决策周期: {self.cfg.period}分钟 ({duration_seconds}秒)")
        logger.info(f"数据长度: {data_length} bars")
        logger.info(f"初始资金: {self.cfg.initial_capital:,.2f}")

        # Get TqSDK objects
        account = api.get_account()
        position = api.get_position(symbol_tq_trade)

        # Create target position task (handles order timing automatically)
        target_pos_task = TargetPosTask(api, symbol_tq_trade)

        # Trading state tracking
        processed_bars = set()
        trade_count = 0
        initial_balance = account.balance
        update_count = 0
        MAX_UPDATES = 100000  # Safety limit (increased from 10000 to handle more updates)
        total_bars_expected = int((end_dt - start_dt).days) if self.cfg.period >= 1440 else None

        logger.info(f"初始资金: {initial_balance:,.2f}")
        logger.info(f"使用TargetPosTask自动处理订单时间")
        if total_bars_expected:
            logger.info(f"预计处理 {total_bars_expected} 根K线")
        
        # Main backtest loop
        while api.wait_update():  # Returns False when backtest ends
            update_count += 1
            if update_count > MAX_UPDATES:
                logger.warning(f"达到最大更新次数 {MAX_UPDATES}")
                break
            
            # Check if new bar completed
            if api.is_changing(klines):
                if len(klines) < 2:
                    continue
                
                # Recompute indicators each update (TqSDK may refresh klines and drop custom cols)
                try:
                    ma10 = MA(klines, 10)
                    ma30 = MA(klines, 30)
                    ma60 = MA(klines, 60)
                    rsi_series = RSI(klines, 14)
                    atr_series = ATR(klines, 14)
                    macd_series = MACD(klines, 12, 26, 9)

                    klines["ma10"] = ma10["ma"].astype(float)
                    klines["ma30"] = ma30["ma"].astype(float)
                    klines["ma60"] = ma60["ma"].astype(float)
                    klines["rsi"] = rsi_series["rsi"].astype(float)
                    klines["atr"] = atr_series["atr"].astype(float)
                    klines["macd"] = macd_series["diff"].astype(float)
                    klines["macd_dea"] = macd_series["dea"].astype(float)
                    klines["macd_bar"] = macd_series["bar"].astype(float)
                except Exception:
                    pass
                
                # Recompute indicators each update (TqSDK may refresh klines and drop custom cols)
                try:
                    ma10 = MA(klines, 10)
                    ma30 = MA(klines, 30)
                    ma60 = MA(klines, 60)
                    rsi_series = RSI(klines, 14)
                    atr_series = ATR(klines, 14)
                    macd_series = MACD(klines, 12, 26, 9)

                    klines["ma10"] = ma10["ma"].astype(float)
                    klines["ma30"] = ma30["ma"].astype(float)
                    klines["ma60"] = ma60["ma"].astype(float)
                    klines["rsi"] = rsi_series["rsi"].astype(float)
                    klines["atr"] = atr_series["atr"].astype(float)
                    klines["macd"] = macd_series["diff"].astype(float)
                    klines["macd_dea"] = macd_series["dea"].astype(float)
                    klines["macd_bar"] = macd_series["bar"].astype(float)
                except Exception:
                    pass
                
                # Get completed bar (second to last)
                bar = klines.iloc[-2]
                bar_time = pd.to_datetime(bar["datetime"])
                
                # Warmup: skip decisions until critical indicators are ready
                if 'first_ready_time' in locals() and first_ready_time is not None and bar_time < first_ready_time:
                    if not warmup_logged:
                        logger.info(f"指标预热中，等待至 {first_ready_time} 开始决策")
                        warmup_logged = True
                    continue

                # Skip if already processed
                if bar_time in processed_bars:
                    continue
                processed_bars.add(bar_time)

                # Show progress
                bars_processed = len(processed_bars)
                if total_bars_expected and bars_processed % max(1, total_bars_expected // 10) == 0:
                    progress_pct = (bars_processed / total_bars_expected) * 100
                    logger.info(f"进度: {bars_processed}/{total_bars_expected} bars ({progress_pct:.1f}%)")
                
                # Check if we've reached end
                if bar_time >= end_dt:
                    logger.info(f"达到回测结束时间: {bar_time}")
                    break
                
                # Prepare context data (all bars before current)
                ctx = klines.iloc[: len(klines) - 1].copy()
                df_ctx = pd.DataFrame({
                    "timestamp": pd.to_datetime(ctx["datetime"]),
                    "open": ctx["open"].astype(float),
                    "high": ctx["high"].astype(float),
                    "low": ctx["low"].astype(float),
                    "close": ctx["close"].astype(float),
                    "volume": ctx["volume"].astype(float),
                })

                # Copy technical indicators if available
                indicator_columns = ["ma10", "ma30", "ma60", "rsi", "atr", "macd", "macd_dea", "macd_bar"]
                copied_indicators = []
                missing_indicators = []

                for col in indicator_columns:
                    if col in ctx.columns:
                        df_ctx[col] = ctx[col].astype(float)
                        # Check if this column has valid values
                        valid_count = (~df_ctx[col].isna()).sum()
                        if valid_count > 0:
                            copied_indicators.append(f"{col}({valid_count})")
                        else:
                            missing_indicators.append(f"{col}(全空)")
                    else:
                        missing_indicators.append(f"{col}(不存在)")

                # Log indicator status for first bar (to avoid spam)
                if bars_processed == 1:
                    logger.info(f"✅ 已复制指标: {', '.join(copied_indicators) if copied_indicators else '无'}")
                    if missing_indicators:
                        logger.warning(f"⚠️ 缺失/空值指标: {', '.join(missing_indicators)}")
                
                # Current bar as Series
                row = pd.Series({
                    "timestamp": bar_time,
                    "open": float(bar["open"]),
                    "high": float(bar["high"]),
                    "low": float(bar["low"]),
                    "close": float(bar["close"]),
                    "volume": float(bar["volume"]),
                })

                # Add technical indicators to current bar (ONLY TqSDK calculated)
                current_bar_indicators = {}
                for col in indicator_columns:
                    if col in bar.index and not pd.isna(bar[col]):
                        row[col] = float(bar[col])
                        current_bar_indicators[col] = float(bar[col])

                # Log current bar indicators for first few bars (debugging)
                if bars_processed <= 3:
                    logger.debug(f"[Bar {bars_processed}] 当前K线指标: {current_bar_indicators}")

                # ✅ 严格验证关键指标：ma10, ma30, rsi, atr 必须存在且有效
                # 这些是 SimpleQuantEngine 和 LLMDirectEngine 都需要的核心指标
                critical_indicators = ['ma10', 'ma30', 'rsi', 'atr']
                missing_critical = []
                for critical_ind in critical_indicators:
                    if critical_ind not in row.index or pd.isna(row.get(critical_ind)):
                        missing_critical.append(critical_ind)

                if missing_critical:
                    # 关键指标缺失，跳过此bar的决策
                    if bars_processed <= 5:  # Only warn for first few bars
                        logger.warning(f"[Bar {bars_processed}] ⚠️ 关键指标缺失/NaN: {missing_critical}，跳过决策")
                    continue  # Skip decision for this bar

                # Set row.name to the index it will have in the dataframe
                row.name = len(df_ctx)
                # Append row to df_ctx so indicators can be computed
                df_ctx = pd.concat([df_ctx, row.to_frame().T], ignore_index=False)

                current_price = float(row["close"]) if not pd.isna(row["close"]) else float(row["open"])

                # Get current position from TqSDK
                current_pos_qty = position.pos_long - position.pos_short  # >0 = long, <0 = short, 0 = flat
                
                # Inject position/account snapshot from TqSDK for consistent PnL
                snapshot = {
                    'account': {
                        'balance': float(getattr(account, 'balance', 0) or 0),
                        'static_balance': float(getattr(account, 'static_balance', 0) or 0),
                        'float_profit': float(getattr(account, 'float_profit', 0) or 0),
                        'risk_ratio': float(getattr(account, 'risk_ratio', 0) or 0),
                    },
                    'position': {
                        'pos_long': int(getattr(position, 'pos_long', 0) or 0),
                        'pos_short': int(getattr(position, 'pos_short', 0) or 0),
                        'open_price_long': float(getattr(position, 'open_price_long', 0) or 0),
                        'open_price_short': float(getattr(position, 'open_price_short', 0) or 0),
                        'float_profit_long': (getattr(position, 'float_profit_long', None)),
                        'float_profit_short': (getattr(position, 'float_profit_short', None)),
                        'margin': float(getattr(position, 'margin', 0) or 0),
                    }
                }

                # Inject position state to decision engine
                if hasattr(self.engine, "current_pos"):
                    if current_pos_qty > 0:
                        self.engine.current_pos = Position(direction="long", qty=current_pos_qty, entry_price=position.open_price_long, stop=0, take=0)
                    elif current_pos_qty < 0:
                        self.engine.current_pos = Position(direction="short", qty=abs(current_pos_qty), entry_price=position.open_price_short, stop=0, take=0)
                    else:
                        self.engine.current_pos = None
                    setattr(self.engine, "current_balance", account.balance)
                    setattr(self.engine, "tqsdk_snapshot", snapshot)
                elif hasattr(self.engine, "llm_direct") and hasattr(self.engine.llm_direct, "current_pos"):
                    if current_pos_qty > 0:
                        self.engine.llm_direct.current_pos = Position(direction="long", qty=current_pos_qty, entry_price=position.open_price_long, stop=0, take=0)
                    elif current_pos_qty < 0:
                        self.engine.llm_direct.current_pos = Position(direction="short", qty=abs(current_pos_qty), entry_price=position.open_price_short, stop=0, take=0)
                    else:
                        self.engine.llm_direct.current_pos = None
                    setattr(self.engine.llm_direct, "current_balance", account.balance)
                    setattr(self.engine.llm_direct, "tqsdk_snapshot", snapshot)
                
                # Make trading decision
                try:
                    if self.mode == DecisionMode.QUANT_ONLY:
                        decision = self.engine.decide(row, df_ctx)
                    else:
                        decision = self.engine.decide(row, df_ctx, symbol=self.cfg.symbol)

                    # Output LLM rationale if enabled
                    if self.show_rationale and decision.rationale and len(decision.rationale) > 0:
                        logger.info(f"[{bar_time.strftime('%Y-%m-%d %H:%M')}] 决策依据: {' | '.join(decision.rationale)}")
                        if decision.confidence > 0:
                            logger.info(f"  → 置信度: {decision.confidence:.2%}, 操作: {decision.action}")
                except Exception as e:
                    logger.warning(f"决策失败 @ {bar_time}: {e}")
                    continue
                
                # Execute decision via TqSDK using TargetPosTask
                # TargetPosTask automatically handles order timing and execution
                try:
                    new_target_pos = current_pos_qty  # Default: maintain current position

                    if decision.action == "open_long" and current_pos_qty == 0 and decision.position_size > 0:
                        logger.info(f"[{bar_time.strftime('%Y-%m-%d %H:%M')}] 📈 开多 {decision.position_size}手 @ {current_price:.2f}")
                        if self.show_rationale and decision.rationale:
                            logger.info(f"  └─ 理由: {' | '.join(decision.rationale)}")
                        if decision.stop_loss > 0 or decision.take_profit > 0:
                            logger.info(f"  └─ 止损: {decision.stop_loss:.2f}, 止盈: {decision.take_profit:.2f}")
                        new_target_pos = int(decision.position_size)
                        trade_count += 1

                    elif decision.action == "open_short" and current_pos_qty == 0 and decision.position_size > 0:
                        logger.info(f"[{bar_time.strftime('%Y-%m-%d %H:%M')}] 📉 开空 {decision.position_size}手 @ {current_price:.2f}")
                        if self.show_rationale and decision.rationale:
                            logger.info(f"  └─ 理由: {' | '.join(decision.rationale)}")
                        if decision.stop_loss > 0 or decision.take_profit > 0:
                            logger.info(f"  └─ 止损: {decision.stop_loss:.2f}, 止盈: {decision.take_profit:.2f}")
                        new_target_pos = -int(decision.position_size)
                        trade_count += 1

                    elif decision.action == "close_long" and current_pos_qty > 0:
                        close_qty = int(decision.position_size) if decision.position_size else current_pos_qty
                        logger.info(f"[{bar_time.strftime('%Y-%m-%d %H:%M')}] 🔻 平多 {close_qty}手 @ {current_price:.2f}")
                        if self.show_rationale and decision.rationale:
                            logger.info(f"  └─ 理由: {' | '.join(decision.rationale)}")
                        new_target_pos = max(0, current_pos_qty - close_qty)
                        trade_count += 1

                    elif decision.action == "close_short" and current_pos_qty < 0:
                        close_qty = int(decision.position_size) if decision.position_size else abs(current_pos_qty)
                        logger.info(f"[{bar_time.strftime('%Y-%m-%d %H:%M')}] 🔺 平空 {close_qty}手 @ {current_price:.2f}")
                        if self.show_rationale and decision.rationale:
                            logger.info(f"  └─ 理由: {' | '.join(decision.rationale)}")
                        new_target_pos = min(0, current_pos_qty + close_qty)
                        trade_count += 1

                    elif decision.action == "adjust_position":
                        # New: support fine-grained position adjustment
                        target = int(decision.target_position)
                        if target != current_pos_qty:
                            if current_pos_qty > 0:
                                # Adjusting long position
                                if target > current_pos_qty:
                                    logger.info(f"[{bar_time.strftime('%Y-%m-%d %H:%M')}] ⬆️  加多 {target - current_pos_qty}手 @ {current_price:.2f} (目标: {target}手)")
                                elif target < current_pos_qty and target >= 0:
                                    logger.info(f"[{bar_time.strftime('%Y-%m-%d %H:%M')}] ⬇️  减多 {current_pos_qty - target}手 @ {current_price:.2f} (目标: {target}手)")
                                else:
                                    logger.info(f"[{bar_time.strftime('%Y-%m-%d %H:%M')}] 🔄 反向调仓 @ {current_price:.2f} (从{current_pos_qty}手多 → {target}手)")
                            elif current_pos_qty < 0:
                                # Adjusting short position
                                if target < current_pos_qty:
                                    logger.info(f"[{bar_time.strftime('%Y-%m-%d %H:%M')}] ⬆️  加空 {abs(target - current_pos_qty)}手 @ {current_price:.2f} (目标: {target}手)")
                                elif target > current_pos_qty and target <= 0:
                                    logger.info(f"[{bar_time.strftime('%Y-%m-%d %H:%M')}] ⬇️  减空 {abs(current_pos_qty - target)}手 @ {current_price:.2f} (目标: {target}手)")
                                else:
                                    logger.info(f"[{bar_time.strftime('%Y-%m-%d %H:%M')}] 🔄 反向调仓 @ {current_price:.2f} (从{current_pos_qty}手空 → {target}手)")
                            else:
                                # Opening from flat
                                direction = "多" if target > 0 else "空"
                                logger.info(f"[{bar_time.strftime('%Y-%m-%d %H:%M')}] 📈 开{direction} {abs(target)}手 @ {current_price:.2f}")

                            if self.show_rationale and decision.rationale:
                                logger.info(f"  └─ 理由: {' | '.join(decision.rationale)}")
                            if decision.stop_loss > 0 or decision.take_profit > 0:
                                logger.info(f"  └─ 止损: {decision.stop_loss:.2f}, 止盈: {decision.take_profit:.2f}")

                            new_target_pos = target
                            trade_count += 1

                    # Set target position (TargetPosTask will execute when market is open)
                    if new_target_pos != current_pos_qty:
                        target_pos_task.set_target_volume(new_target_pos)

                except Exception as order_err:
                    logger.warning(f"设置目标持仓失败: {order_err}")
        
        # Close any remaining position at end using TargetPosTask
        final_pos = position.pos_long - position.pos_short
        if final_pos != 0:
            logger.info(f"收盘平仓: {final_pos}手")
            target_pos_task.set_target_volume(0)
        
        # Wait a few updates for final orders to process
        for _ in range(3):
            api.wait_update()
        
        # Collect final statistics
        final_balance = account.balance
        total_return = ((final_balance - initial_balance) / initial_balance) * 100.0 if initial_balance > 0 else 0.0
        
        logger.info("=== 回测完成 ===")
        logger.info(f"交易次数: {trade_count}")
        logger.info(f"初始资金: {initial_balance:,.2f}")
        logger.info(f"最终权益: {final_balance:,.2f}")
        logger.info(f"总收益率: {total_return:.2f}%")
        
        api.close()
        
        return {
            "initial": initial_balance,
            "final": final_balance,
            "return_pct": total_return,
            "trades": [],  # TqSDK manages trades internally
            "wins": 0,
            "losses": 0,
        }



def load_kline(symbol: str, period_min: int, count: int) -> pd.DataFrame:
    # Prefer credentials from config/api_keys.yaml, fallback to environment variables
    username = os.getenv("TQSDK_USERNAME")
    password = os.getenv("TQSDK_PASSWORD")
    use_sim = True
    try:
        import yaml  # local import to avoid global dependency if unused
        cfg_path = ROOT / "config" / "api_keys.yaml"
        if cfg_path.exists():
            cfg = yaml.safe_load(cfg_path.read_text(encoding="utf-8")) or {}
            tcfg = cfg.get("tqsdk", {}) or {}
            username = tcfg.get("username") or username
            password = tcfg.get("password") or password
            use_sim = bool(tcfg.get("use_sim", True))
    except Exception:
        # ignore config errors, rely on env vars
        pass

    # Normalize user-friendly symbols to TqSDK format
    sym_up = (symbol or "").strip().upper()
    symbol_tq = "KQ.m@CZCE.SA" if (sym_up == "SA0" or sym_up.endswith(".SA0")) else symbol
    if symbol_tq != symbol:
        logger.info(f"符号映射 {symbol} -> {symbol_tq}（用于 TqSDK）")
    client = TqSdkClient(symbol=symbol_tq, auth_username=username, auth_password=password, use_sim=use_sim)
    try:
        df = client.get_minute_kline(period=str(period_min), count=count)
        if df is None or df.empty:
            raise RuntimeError("empty kline from TqSDK")
        return df
    finally:
        try:
            client.close()
        except Exception:
            pass


def main():
    parser = argparse.ArgumentParser(description="LLM Direct Decision Backtest using TqSDK")
    parser.add_argument("--mode", choices=[m.value for m in DecisionMode], default=DecisionMode.LLM_DIRECT.value, help="Decision mode")
    parser.add_argument("--symbol", default="KQ.m@CZCE.SA", help="Trading symbol (default: KQ.m@CZCE.SA)")
    parser.add_argument("--period", type=int, default=15, help="K-line period in MINUTES (1=1min, 15=15min, 60=1hour, 1440=daily)")
    parser.add_argument("--count", type=int, default=None, help="Number of K-lines to fetch (auto-calculated if not specified)")
    parser.add_argument("--cache", default=str(Path("logs") / "llm_decisions_cache.json"), help="Cache file path")
    parser.add_argument("--llm_input", choices=["raw", "neutral", "full"], default="neutral", help="LLM input feature mode")
    parser.add_argument("--llm_ignore_risk", action="store_true", help="LLM ignores risk warnings")
    parser.add_argument("--start", help="Backtest start datetime, e.g. 2024-09-01 09:00")
    parser.add_argument("--end", help="Backtest end datetime, e.g. 2024-10-31 15:00")
    parser.add_argument("--initial_units", type=float, default=2.0, help="Initial position units (default: 2.0 lots)")
    parser.add_argument("--margin_ratio", type=float, default=0.18, help="Margin ratio for futures (default: 0.18 = 18%%)")
    parser.add_argument("--visual_prompt", action="store_true", help="Use visual/neutral prompt with ASCII charts (experimental)")
    parser.add_argument("--show_rationale", action="store_true", help="Show detailed rationale for each decision (default: False)")
    parser.add_argument("--debug", action="store_true", help="Enable debug logging for LLM responses (default: False)")
    args = parser.parse_args()

    # Configure logging level based on debug flag
    log_level = "DEBUG" if args.debug else "INFO"
    logger.add(
        str(Path("logs") / f"llm_backtest_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"),
        rotation="1 day",
        level=log_level
    )

    try:
        logging.getLogger("tqsdk").setLevel(logging.WARNING)
    except Exception:
        pass

    cache_path = Path(args.cache) if args.cache else None
    cfg = BTConfig(symbol=args.symbol or "KQ.m@CZCE.SA", period=args.period, count=args.count, margin_ratio=args.margin_ratio)

    # 使用TqSDK回测
    mode = DecisionMode(args.mode)
    bt = Backtester(cfg, mode, cache_path=cache_path, llm_input=args.llm_input, llm_ignore_risk=args.llm_ignore_risk, initial_units=args.initial_units, use_visual_prompt=args.visual_prompt, show_rationale=args.show_rationale, margin_ratio=args.margin_ratio)
    # 回测区间：参考 TqSDK 教程，支持命令行指定开始/结束时间
    def _parse_dt(s, default):
        if not s:
            return default
        for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%d", "%Y/%m/%d %H:%M", "%Y/%m/%d"):
            try:
                return datetime.strptime(s, fmt)
            except Exception:
                continue
        return default
    default_start = datetime(2024, 9, 1, 9, 0, 0)
    default_end = datetime(2024, 10, 31, 15, 0, 0)
    start_dt = _parse_dt(args.start, default_start)
    end_dt = _parse_dt(args.end, default_end)

    # 读取TqSDK认证配置
    username = os.getenv("TQSDK_USERNAME")
    password = os.getenv("TQSDK_PASSWORD")
    use_sim = True
    try:
        import yaml
        cfg_path = ROOT / "config" / "api_keys.yaml"
        if cfg_path.exists():
            cfg_yaml = yaml.safe_load(cfg_path.read_text(encoding="utf-8")) or {}
            tcfg = cfg_yaml.get("tqsdk", {}) or {}
            username = tcfg.get("username") or username
            password = tcfg.get("password") or password
            use_sim = bool(tcfg.get("use_sim", True))
    except Exception:
        pass
    logger.info("已启用基于TqSDK的回测下单：请以TqSDK输出的‘模拟交易账户’汇总为准（本脚本摘要仅供参考）")
    logger.info(f"使用TqSDK回测：{args.symbol}, {args.period}m, bars≈{args.count}, 区间 {start_dt} ~ {end_dt}")
    report = bt.run_tqsdk(start_dt=start_dt, end_dt=end_dt, username=username, password=password, use_sim=use_sim)

    print("=== Backtest Summary ===")
    print(f"Mode: {mode.value}")
    print(f"Initial: {report['initial']:.2f}")
    print(f"Final:   {report['final']:.2f}")
    print(f"Return:  {report['return_pct']:.2f}%")
    print(f"Trades:  {len([t for t in report['trades'] if t['side']=='OPEN'])}")
    print(f"Wins/Losses: {report['wins']}/{report['losses']}")
    print("Note: 以 TqSDK ‘模拟交易账户’ 汇总为准；本脚本摘要仅供快速参考。")


if __name__ == "__main__":
    main()
