"""LLM-based trading decision engine.

This module provides the LLMDirectEngine class which uses large language models
to make trading decisions based on market data and technical indicators.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Optional

import pandas as pd
from loguru import logger
from tqsdk import tafunc

from src.backtest.engines.quant_engine import SimpleQuantEngine
from src.backtest.models.decision import Decision
from src.llm_engine.llm_factory import LLMFactory
from src.llm_engine.market_representation import (
    EventDetector,
    MarketRepresentationGenerator,
)
from src.llm_engine.response_parser import ResponseParser


class LLMDirectEngine:
    def __init__(self, cache: Optional[Dict[str, Any]] = None, cache_write: Optional[Path] = None, max_pos: int = 1, feature_mode: str = "neutral", trade_meta: Optional[Dict[str, Any]] = None):
        self.max_pos = max_pos
        self.cache = cache or {}
        self.cache_write = cache_write
        self.feature_mode = feature_mode
        self.trade_meta = trade_meta or {}
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

                # LLM adjustments
                override_stop_loss=bool(data.get("override_stop_loss", False)),
                adjust_stop_loss=float(data.get("adjust_stop_loss", 0) or 0) if data.get("adjust_stop_loss") is not None else None,
                adjust_take_profit=float(data.get("adjust_take_profit", 0) or 0) if data.get("adjust_take_profit") is not None else None,
                adjustment_reason=str(data.get("adjustment_reason", "") or ""),

                # Cache validation
                decision_price=float(data.get("decision_price", 0) or 0),
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

    def _format_timeframe_data(self, klines: pd.DataFrame, period_name: str, is_primary: bool = False) -> str:
        """Format single timeframe data for prompt.

        Args:
            klines: DataFrame with OHLCV and indicators
            period_name: Human-readable name like "日线", "4小时线"
            is_primary: Whether this is the primary decision timeframe

        Returns:
            Formatted string describing the timeframe
        """
        latest = klines.iloc[-1]

        # ✅ Validate critical indicators - check for NaN values
        critical_fields = ['close', 'ma10', 'ma30', 'rsi', 'atr', 'macd', 'macd_dea']
        missing_fields = [field for field in critical_fields if pd.isna(latest.get(field))]

        if missing_fields:
            return f"⚠️ {period_name} 数据不完整（缺失: {', '.join(missing_fields)}），无法生成分析"

        # MA trend direction (safe after NaN check)
        ma_trend = "多头排列" if latest.ma10 > latest.ma30 else "空头排列"
        ma_distance_pct = (latest.close - latest.ma30) / latest.ma30 * 100

        # ✅ MACD status with proper NaN handling
        macd_status = "数据缺失"
        if not pd.isna(latest.macd) and not pd.isna(latest.macd_dea):
            macd_status = "多头" if latest.macd > latest.macd_dea else "空头"
            if not pd.isna(latest.close) and abs(latest.macd) < 0.01 * latest.close:  # Near zero
                macd_status = "零轴附近"

        # RSI status
        rsi_status = "超买区" if latest.rsi > 70 else ("超卖区" if latest.rsi < 30 else "中性区")

        info_lines = [
            f"- 当前价格: {latest.close:.2f}",
            f"- MA趋势: {ma_trend} (MA10={latest.ma10:.2f}, MA30={latest.ma30:.2f})",
            f"- 价格位置: {'高于' if ma_distance_pct > 0 else '低于'}MA30 {abs(ma_distance_pct):.2f}%",
            f"- MACD: {macd_status} (MACD={latest.macd:.2f}, DEA={latest.macd_dea:.2f})",
            f"- RSI: {latest.rsi:.1f} ({rsi_status})",
        ]

        if is_primary:
            info_lines.append(f"- ATR: {latest.atr:.2f} (止损参考)")

        return "\n".join(info_lines)

    def _build_multi_timeframe_section(self, klines_dict: Dict[str, pd.DataFrame], cfg) -> str:
        """Build multi-timeframe analysis section for prompt.

        Args:
            klines_dict: Dict mapping period name to DataFrame
            cfg: BTConfig instance

        Returns:
            Formatted multi-timeframe analysis string
        """
        sections = []

        # Primary decision timeframe
        if "decision" in klines_dict:
            period_name = cfg.get_period_name(cfg.decision_period)
            sections.append(f"## 📊 决策周期: {period_name}")
            sections.append(self._format_timeframe_data(klines_dict["decision"], period_name, is_primary=True))

        # Auxiliary timeframes
        aux_periods = [k for k in klines_dict.keys() if k.startswith("aux_")]
        if aux_periods:
            sections.append("\n## 📈 辅助周期参考")

            for period_key in sorted(aux_periods):
                # Extract period minutes from key like "aux_240m"
                period_minutes = int(period_key.replace("aux_", "").replace("m", ""))
                period_name = cfg.get_period_name(period_minutes)

                sections.append(f"\n### {period_name}")
                sections.append(self._format_timeframe_data(klines_dict[period_key], period_name, is_primary=False))

        # Multi-timeframe alignment check
        if len(klines_dict) > 1:
            sections.append("\n## ⚖️ 多周期一致性")

            # 添加调试信息：显示每个周期的最新数据时间和趋势
            sections.append("\n### 各周期状态详情")
            for period_key, df in klines_dict.items():
                latest = df.iloc[-1]
                period_minutes = cfg.decision_period if period_key == "decision" else int(period_key.replace("aux_", "").replace("m", ""))
                period_display = cfg.get_period_name(period_minutes)

                # 判断该周期趋势
                trend = "多头" if latest.ma10 > latest.ma30 else "空头"

                # 获取时间戳（如果有）
                bar_time = tafunc.time_to_datetime(latest['datetime']).strftime("%Y-%m-%d %H:%M")

                sections.append(f"- {period_display}: {trend} | MA10={latest.ma10:.2f} MA30={latest.ma30:.2f} | 最新时间={bar_time}")

            # Check if all timeframes have same MA trend
            all_bullish = all(df.iloc[-1].ma10 > df.iloc[-1].ma30 for df in klines_dict.values())
            all_bearish = all(df.iloc[-1].ma10 < df.iloc[-1].ma30 for df in klines_dict.values())

            sections.append("\n### 一致性判断")
            if all_bullish:
                sections.append("- 多周期趋势: ✓ **一致向上**（所有周期MA10>MA30）")
                sections.append("- **交易约束**: 建议仅做多或空仓观望")
            elif all_bearish:
                sections.append("- 多周期趋势: ✓ **一致向下**（所有周期MA10<MA30）")
                sections.append("- **交易约束**: 建议仅做空或空仓观望")
            else:
                sections.append("- 多周期趋势: ✗ **不一致**（不同周期趋势方向不同）")
                sections.append("- **交易约束**: 谨慎交易，优先观望")

        return "\n".join(sections)

    def _build_enhanced_prompt(self, row: pd.Series, df: pd.DataFrame, symbol: str, klines_dict: Optional[Dict[str, pd.DataFrame]] = None, cfg: Optional[Any] = None) -> str:
        """
        构建增强版决策prompt - 基于三级市场表示和四步决策框架

        核心改进：
        1. 三级信息结构（原始数据 + 特征描述 + 状态摘要）
        2. 事件时间线
        3. 四步决策框架引导
        4. 动态置信度评估
        5. 多周期分析（如果提供了klines_dict）

        Args:
            row: Current bar data
            df: Historical data (for backward compatibility, single timeframe)
            symbol: Trading symbol
            klines_dict: Optional multi-timeframe data dict
            cfg: Optional BTConfig instance (needed for multi-timeframe)
        """

        # 生成市场分析部分
        if klines_dict and cfg:
            # 使用多周期分析
            market_analysis = self._build_multi_timeframe_section(klines_dict, cfg)
        else:
            # 使用单周期三级市场表示（向后兼容）
            market_rep = self.market_rep_generator.generate(row, df, symbol)
            market_analysis = market_rep.to_markdown()

        # 获取当前持仓和账户信息
        pos_obj = self.current_pos
        balance = self.current_balance
        initial_capital = self.trade_meta.get('initial_capital', 100000)

        # 初始化可能在prompt中使用的变量
        pnl_pct = 0.0
        stop_distance_pct = 0.0
        active_stop_loss = 0.0
        active_take_profit = 0.0

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
                # 完全依赖 TqSDK 的浮动盈亏，不进行手工计算回退
                if pos_obj.direction == "long":
                    if tq_pos_pnl_long is not None:
                        float_pnl = tq_pos_pnl_long
                    else:
                        logger.warning(f"TqSDK 多头持仓浮动盈亏为 None，可能数据有问题")
                        float_pnl = 0.0
                else:
                    if tq_pos_pnl_short is not None:
                        float_pnl = tq_pos_pnl_short
                    else:
                        logger.warning(f"TqSDK 空头持仓浮动盈亏为 None，可能数据有问题")
                        float_pnl = 0.0
            elif tq_acc_float_profit is not None:
                # 无持仓时，回退到账户级浮盈
                float_pnl = tq_acc_float_profit
            else:
                logger.warning(f"TqSDK 账户浮动盈亏也为 None，无法获取盈亏数据")
                float_pnl = 0.0

            pct_base = float(tq_static_balance) if tq_static_balance is not None else float(initial_capital)
            pnl_pct = (float_pnl / pct_base * 100.0) if pct_base > 0 else 0.0

            # 获取止盈止损信息（从 backtester 注入）
            active_stop_loss = getattr(self, 'active_stop_loss', 0.0)
            active_take_profit = getattr(self, 'active_take_profit', 0.0)

            # 构建持仓基本信息
            position_info = f"""
## 📋 当前持仓状态
- 方向: {pos_obj.direction.upper()}
- 持仓: {qty}手
- 开仓价: {entry_price:.2f}
- 当前价: {current_price:.2f}
- 浮动盈亏: {pnl_pct:+.2f}% ({float_pnl:+.0f}元，按初始资金比例)
- 标的涨跌: {price_change_pct:+.2f}%（价格变动）
"""

            # 添加止盈止损信息
            if active_stop_loss > 0 or active_take_profit > 0:
                position_info += "\n### 🎯 止盈止损设置\n"

                # 止损信息
                if active_stop_loss > 0:
                    if pos_obj.direction == "long":
                        stop_distance_pct = ((current_price - active_stop_loss) / current_price * 100)
                        stop_distance_points = current_price - active_stop_loss
                    else:  # short
                        stop_distance_pct = ((active_stop_loss - current_price) / current_price * 100)
                        stop_distance_points = active_stop_loss - current_price

                    # 预警：接近止损（距离 < 1%）
                    stop_warning = ""
                    if abs(stop_distance_pct) < 1.0:
                        stop_warning = " ⚠️ **即将触发止损!**"
                    elif abs(stop_distance_pct) < 2.0:
                        stop_warning = " ⚠️ 接近止损"

                    position_info += f"- 止损价: {active_stop_loss:.2f} (距离: {abs(stop_distance_pct):.2f}% / {abs(stop_distance_points):.2f}点){stop_warning}\n"

                # 止盈信息
                if active_take_profit > 0:
                    if pos_obj.direction == "long":
                        profit_distance_pct = ((active_take_profit - current_price) / current_price * 100)
                        profit_distance_points = active_take_profit - current_price
                    else:  # short
                        profit_distance_pct = ((current_price - active_take_profit) / current_price * 100)
                        profit_distance_points = current_price - active_take_profit

                    # 预警：接近止盈（距离 < 1%）
                    profit_warning = ""
                    if abs(profit_distance_pct) < 1.0:
                        profit_warning = " 🎯 **即将触发止盈!**"
                    elif abs(profit_distance_pct) < 2.0:
                        profit_warning = " 🎯 接近止盈"

                    position_info += f"- 止盈价: {active_take_profit:.2f} (距离: {abs(profit_distance_pct):.2f}% / {abs(profit_distance_points):.2f}点){profit_warning}\n"

                # 获取硬止损配置信息
                hard_stop_multiple = self.trade_meta.get('hard_stop_loss_atr_multiple', 3.0)
                soft_stop_multiple = self.trade_meta.get('soft_stop_loss_atr_multiple', 1.5)
                hard_tp_multiple = self.trade_meta.get('hard_take_profit_atr_multiple', 5.0)

                # 添加风控说明和调整权限
                position_info += f"""\n**⚠️ 重要提示：止盈止损管理**
- **自动执行**：当前设置的止盈止损会在价格触及时自动执行（软止损，ATR×{soft_stop_multiple}）
- **硬止损保护**：系统设有硬止损（ATR×{hard_stop_multiple}），无论任何情况都会强制执行
- **硬止盈限制**：系统设有硬止盈（ATR×{hard_tp_multiple}），达到后自动平仓
- **LLM调整权限**：你可以在决策中调整或忽略当前止盈止损，但需满足以下条件：
  1. **必须提供充分的调整理由**（`adjustment_reason`字段，必填且具体）
  2. 调整幅度在合理范围内（建议不超过50%）
  3. **绝对不能超过硬止损限制**（系统会拒绝）
  4. 建议仅在以下情况使用：
     - ⚠️  技术形态发生重大改变（如突破关键支撑/阻力、形态反转）
     - ⚠️  当前止盈止损位置明显不合理（如刚好在关键技术位上，可能被针对性触发）
     - ⚠️  市场流动性异常（如剧烈波动、跳空缺口）
  5. **谨慎使用**：调整止盈止损意味着承担更大风险，所有调整都会被记录到审计日志，请三思而后行！
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

{market_analysis}

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
- 风险收益比是否合适？当前应该激进、稳健还是保守？
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

基于以上四步分析，请仅仅输出以下标准JSON格式的最终决策：

```json
{{
  "action": "open_long|open_short|close_long|close_short|adjust_position|hold",
  "position_size": <int, 本次操作手数（必须是整数，不能是0.5手）>,
  "target_position": <int, 目标总持仓手数（仅用于adjust_position）
                      ⚠️ 重要：正数=多仓，负数=空仓，0=空仓
                      示例：2表示目标持有2手多仓，-1表示目标持有1手空仓>,
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
  "execution_plan": "<string, 第四步执行方案摘要>",

  // **可选字段：止盈止损调整**
  "override_stop_loss": <bool, 是否忽略当前软止损，default: false>,
  "adjust_stop_loss": <float, 建议的新止损价（绝对价格），不填表示不调整>,
  "adjust_take_profit": <float, 建议的新止盈价（绝对价格），不填表示不调整>,
  "adjustment_reason": "<string, 调整原因（如果调整则必填！）>"
}}
```

**⚠️ 手数约束说明**：
- **position_size** 和 **target_position** 都必须是整数（1, 2, 3等）
- **不允许小数**（如0.5手、1.5手等），系统会自动取整
- 如果你输出了小数，系统会向下取整（如1.8手 → 1手）

## ⚠️ 重要提示

### 📋 可执行操作定义（必须严格遵守）

#### 1. 开仓操作

**open_long** - 开多仓
- **前置条件**: 当前持仓为0 或 当前为空仓（需先平空再开多）
- **必须提供参数**:
  * `position_size`: 开仓手数，必须 > 0 且 ≤ {self.max_pos}
  * `stop_loss`: 止损价格（绝对价格），必须 < 当前价
  * `take_profit`: 止盈价格（绝对价格），必须 > 当前价
- **约束**: position_size不能超过最大持仓限制{self.max_pos}手

**open_short** - 开空仓
- **前置条件**: 当前持仓为0 或 当前为多仓（需先平多再开空）
- **必须提供参数**:
  * `position_size`: 开仓手数，必须 > 0 且 ≤ {self.max_pos}
  * `stop_loss`: 止损价格（绝对价格），必须 > 当前价
  * `take_profit`: 止盈价格（绝对价格），必须 < 当前价
- **约束**: position_size不能超过{self.max_pos}手

#### 2. 平仓操作

**close_long** - 平多仓
- **前置条件**: 当前持有多仓
- **作用**: 全部或部分平掉多仓

**close_short** - 平空仓
- **前置条件**: 当前持有空仓
- **作用**: 全部或部分平掉空仓

#### 3. 调仓操作

**adjust_position** - 调整仓位
- **前置条件**: 无（任何持仓状态都可以调整）
- **必须提供参数**:
  * `target_position`: 目标仓位手数（正数=多仓，负数=空仓，0=空仓）
- **约束**:
  * |target_position| ≤ {self.max_pos}（最大持仓限制）
  * **支持方向变更**：系统会自动先平仓再反向开仓（如：当前2手多 → target_position=-1 → 先平2手多，再开1手空）
- **示例**:
  * 当前0手 → target_position=2 → 开2手多
  * 当前2手多 → target_position=3 → 加仓1手多
  * 当前3手多 → target_position=1 → 减仓2手多
  * 当前2手多 → target_position=-1 → 先平2手多，再开1手空（反向调仓）
  * 当前1手空 → target_position=2 → 先平1手空，再开2手多（反向调仓）

#### 4. 观望操作

**hold** - 保持当前状态
- **前置条件**: 无
- **使用场景**:
  * 无明确交易信号
  * 等待更好入场点
  * 当前持仓继续持有

---

### 决策时必须考虑的约束

**基于当前持仓状态**:
{f'- 当前持仓: {pos_obj.direction.upper()} {pos_obj.qty}手' if pos_obj and pos_obj.direction != "none" else '- 当前无持仓'}
{f'- 浮动盈亏: {pnl_pct:+.2f}%' if pos_obj and pos_obj.direction != "none" else ''}
{f'- 距离止损: {abs(stop_distance_pct):.2f}%' if pos_obj and pos_obj.direction != "none" and active_stop_loss > 0 else ''}

**仓位限制约束**:
- 最大持仓: {self.max_pos}手（硬性限制，任何操作后不可超过）
{f'- 当前可用: {self.max_pos - abs(pos_obj.qty)}手（剩余可加仓额度）' if pos_obj and pos_obj.direction != "none" else f'- 当前可用: {self.max_pos}手（全部额度）'}

**方向变更规则**:
- **推荐方式1（简单）**: 使用 `adjust_position` 设置目标仓位，系统自动处理平仓和开仓
  * 示例：当前2手多想转1手空 → `action: "adjust_position", target_position: -1`
- **推荐方式2（明确）**: 先 `close_long`/`close_short` 平仓，下一个bar再 `open_long`/`open_short` 开仓
  * 示例：当前2手多想转空 → 本bar `action: "close_long"`，下个bar `action: "open_short"`

---

**动态置信度评估标准**（根据市场实际情况调整）：
- 0.9-1.0: 极强信号 - 多重确认，趋势清晰，成交量放大
- 0.7-0.9: 强信号 - 趋势明确，有成交量确认
- 0.5-0.7: 中等信号 - 趋势初现，部分确认
- 0.3-0.5: 弱信号 - 信号不明确，建议观望或小仓位
- 0.0-0.3: 极弱信号 - 信号冲突，强烈建议观望

**仓位管理原则**：
- 单次风险不超过账户的1.5%-5%
- 根据ATR动态调整仓位大小以及风险偏好
- 高波动环境减小仓位，低波动环境可适当增加
- 趋势明确时可持有满仓，震荡市应轻仓或观望

请基于以上框架进行深入分析，输出结构化的专业决策。
"""

        return prompt

    def decide(self, row: pd.Series, df: pd.DataFrame, symbol: str, klines_dict: Optional[Dict[str, pd.DataFrame]] = None, cfg: Optional[Any] = None) -> Decision:
        """
        Enhanced decision making with three-level market representation
        and four-step decision framework.

        Args:
            row: Current bar data
            df: Historical data (for backward compatibility)
            symbol: Trading symbol
            klines_dict: Optional multi-timeframe data dict
            cfg: Optional BTConfig instance (needed for multi-timeframe)
        """
        # 获取当前价格
        current_price = float(row.get("close", 0))

        # 构建缓存键：包含合约、时间和价格，确保缓存的有效性
        # 价格取整到小数点后2位，避免微小的价格差异导致缓存失效
        ts_key = f"{symbol}::{tafunc.time_to_datetime(row['timestamp']).isoformat()}::{current_price:.2f}"

        cached = self._cache_get(ts_key)
        if cached is not None:
            # 验证缓存价格与当前价格的一致性（允许0.5%的容忍度）
            if cached.decision_price > 0 and current_price > 0:
                price_diff_pct = abs(current_price - cached.decision_price) / current_price
                if price_diff_pct > 0.005:  # 0.5% tolerance
                    logger.warning(
                        f"缓存价格差异过大 ({price_diff_pct:.2%}): "
                        f"缓存={cached.decision_price:.2f} vs 当前={current_price:.2f}，重新决策"
                    )
                    cached = None
                else:
                    logger.debug(f"使用缓存决策 @ {current_price:.2f}")
                    return cached
            elif cached.decision_price <= 0 or current_price <= 0:
                # 价格无效，直接使用缓存（兼容旧版本或价格异常情况）
                logger.debug(f"价格验证跳过（缓存={cached.decision_price:.2f}, 当前={current_price:.2f}），使用缓存")
                return cached
            else:
                # 旧缓存没有price信息，直接使用
                return cached

        if self.client is None:
            logger.warning("LLM client not available, falling back to quant baseline")
            return self.quant_fallback.decide(row, df)

        try:
            # Generate enhanced prompt with three-level representation (and optional multi-timeframe data)
            prompt = self._build_enhanced_prompt(row, df, symbol, klines_dict=klines_dict, cfg=cfg)

            # Call LLM
            raw_response = self.client.chat(prompt)

            # Debug logging for response
            logger.debug(f"响应全文: {raw_response}")

            # 使用增强的解析方法，即使JSON不完整也能提取关键信息
            data = ResponseParser.parse_trading_decision(raw_response)

            # 检查是否提取到action
            if 'action' not in data or not data['action']:
                logger.error(f"无法从LLM响应中提取action字段，使用量化回退策略")
                return self.quant_fallback.decide(row, df)

            # Validate and parse action
            action = str(data.get("action")).strip().lower()
            valid_actions = ["open_long", "open_short", "close_long", "close_short", "adjust_position", "hold"]

            if action not in valid_actions:
                logger.warning(f"Invalid action '{action}', 使用量化回退策略")
                return self.quant_fallback.decide(row, df)

            # Parse enhanced fields with proper constraints
            # ✅ 强制手数为整数（向下取整）
            raw_position_size = data.get("position_size", 0)
            if isinstance(raw_position_size, float):
                logger.warning(f"position_size 为小数 ({raw_position_size})，向下取整为 {int(raw_position_size)}")
            position_size_int = int(max(0, min(self.max_pos, int(raw_position_size))))

            raw_target_position = data.get("target_position", 0)
            if isinstance(raw_target_position, float):
                logger.warning(f"target_position 为小数 ({raw_target_position})，向下取整为 {int(raw_target_position)}")
            # ✅ Clamp target_position to [-max_pos, max_pos] range
            clamped_target_position = int(max(-self.max_pos, min(self.max_pos, int(raw_target_position))))

            # Parse LLM adjustment fields
            raw_override_stop_loss = bool(data.get("override_stop_loss", False))
            raw_adjust_stop_loss = data.get("adjust_stop_loss")
            raw_adjust_take_profit = data.get("adjust_take_profit")
            adjustment_reason = str(data.get("adjustment_reason", "") or "")

            # Validate adjustment fields: if any adjustment is requested, reason must be provided
            if (raw_override_stop_loss or raw_adjust_stop_loss is not None or raw_adjust_take_profit is not None):
                if not adjustment_reason.strip():
                    logger.warning("LLM请求调整止盈止损但未提供原因，忽略调整请求")
                    raw_override_stop_loss = False
                    raw_adjust_stop_loss = None
                    raw_adjust_take_profit = None
                    adjustment_reason = ""

            decision = Decision(
                # Core fields
                action=action,
                position_size=position_size_int,  # ✅ 已强制为整数
                target_position=clamped_target_position,  # ✅ Now properly constrained
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

                # LLM adjustments (validated above)
                override_stop_loss=raw_override_stop_loss,
                adjust_stop_loss=float(raw_adjust_stop_loss) if raw_adjust_stop_loss is not None else None,
                adjust_take_profit=float(raw_adjust_take_profit) if raw_adjust_take_profit is not None else None,
                adjustment_reason=adjustment_reason,

                # Cache validation
                decision_price=current_price,
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
