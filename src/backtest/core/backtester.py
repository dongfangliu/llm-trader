"""
Backtester Module

This module provides the core backtesting engine for trading strategies.
Supports multiple decision modes (quant-only, hybrid, LLM-direct) and
comprehensive stop-loss/take-profit management with both hard and soft levels.
"""

from __future__ import annotations

import json
import logging
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd
from loguru import logger
from tqsdk import TqApi, TqBacktest, TqAuth, TqSim, TargetPosTask, tafunc

from src.backtest.models.decision import Decision, DecisionMode
from src.backtest.models.position import Position
from src.backtest.models.config import BTConfig
from src.backtest.engines.quant_engine import SimpleQuantEngine
from src.backtest.engines.llm_engine import LLMDirectEngine
from src.backtest.engines.hybrid_engine import HybridEngine


class Backtester:
    """回测引擎，支持多种决策模式和止损策略"""

    # Trading constants
    DEFAULT_COMMISSION_PER_LOT = 3.0
    DEFAULT_CONTRACT_MULTIPLIER = 20
    CAPITAL_BUFFER_MULTIPLIER = 2.0  # 初始资金缓冲倍数
    DATA_WARMUP_BARS = 50  # 预热K线数量

    # Stop loss/take profit multiples (in ATR units)
    HARD_STOP_LOSS_ATR = 3.0  # 硬止损
    SOFT_STOP_LOSS_ATR = 1.5  # 软止损
    HARD_TAKE_PROFIT_ATR = 5.0  # 硬止盈
    MAX_LOOSENING_PCT = 0.5  # 止损放宽最大百分比

    # Fallback ATR as percentage of price
    FALLBACK_ATR_PCT = 0.02

    def __init__(
        self,
        cfg: BTConfig,
        mode: DecisionMode,
        cache_path: Optional[Path] = None,
        initial_units: Optional[float] = None,
        show_rationale: bool = False,
        margin_ratio: Optional[float] = None
    ):
        """
        初始化回测引擎

        Args:
            cfg: 回测配置
            mode: 决策模式（纯量化/混合/纯LLM）
            cache_path: LLM决策缓存路径
            initial_units: 初始持仓单位（None则使用cfg.initial_capital）
            show_rationale: 是否显示决策理由
            margin_ratio: 保证金比例（覆盖cfg中的值）
        """
        self.cfg = cfg
        self.mode = mode
        self.cache_path = cache_path
        self.initial_units = initial_units
        self.show_rationale = show_rationale

        # Override margin ratio if provided
        if margin_ratio is not None:
            self.cfg.margin_ratio = margin_ratio

        # Active stop loss/take profit tracking
        self.active_stop_loss: float = 0.0
        self.active_take_profit: float = 0.0

        # Setup audit logging
        self.adjustment_log_path = Path("logs") / "stop_loss_adjustments.log"
        self.adjustment_log_path.parent.mkdir(parents=True, exist_ok=True)

        # Load cache and initialize engine
        cache = self._load_cache()
        trade_meta = self._build_trade_meta()
        self.engine = self._create_engine(cache, trade_meta)

    def _load_cache(self) -> Dict[str, Any]:
        """加载LLM决策缓存"""
        if not self.cache_path or not self.cache_path.exists():
            return {}

        try:
            return json.loads(self.cache_path.read_text(encoding="utf-8"))
        except Exception as e:
            logger.warning(f"加载缓存失败: {e}")
            return {}

    def _build_trade_meta(self) -> Dict[str, Any]:
        """构建交易元数据（供LLM使用）"""
        return {
            "tick_size": self.cfg.tick_size,
            "slippage_ticks": self.cfg.slippage_ticks,
            "commission_per_lot": self.cfg.commission_per_lot or self.DEFAULT_COMMISSION_PER_LOT,
            "initial_capital": self.cfg.initial_capital,
            "margin_ratio": self.cfg.margin_ratio,
            "contract_multiplier": self.DEFAULT_CONTRACT_MULTIPLIER,
            "hard_stop_loss_atr_multiple": self.HARD_STOP_LOSS_ATR,
            "soft_stop_loss_atr_multiple": self.SOFT_STOP_LOSS_ATR,
            "hard_take_profit_atr_multiple": self.HARD_TAKE_PROFIT_ATR,
        }

    def _create_engine(self, cache: Dict[str, Any], trade_meta: Dict[str, Any]):
        """创建决策引擎"""
        if self.mode == DecisionMode.QUANT_ONLY:
            return SimpleQuantEngine(max_pos=self.cfg.max_position)
        elif self.mode == DecisionMode.HYBRID:
            return HybridEngine(
                cache=cache,
                cache_write=self.cache_path,
                max_pos=self.cfg.max_position,
                trade_meta=trade_meta
            )
        else:
            engine = LLMDirectEngine(
                cache=cache,
                cache_write=self.cache_path,
                max_pos=self.cfg.max_position,
                trade_meta=trade_meta
            )
            engine.show_rationale = self.show_rationale
            return engine

    def _process_llm_adjustment(
        self,
        decision: Decision,
        bar_time,
        current_price: float,
        current_pos_qty: int,
        position,
        current_atr: float
    ):
        """
        处理LLM的止盈止损调整请求，验证合理性并记录审计日志

        Args:
            decision: LLM决策
            bar_time: K线时间
            current_price: 当前价格
            current_pos_qty: 当前持仓（>0多头，<0空头）
            position: TqSDK持仓对象
            current_atr: 当前ATR值
        """
        is_long = current_pos_qty > 0
        entry_price = position.open_price_long if is_long else position.open_price_short

        # Calculate hard stop loss boundary
        hard_stop_loss = self._calculate_hard_stop_loss(entry_price, current_atr, is_long)

        # Build audit log
        audit_msg = self._build_audit_header(
            bar_time, current_price, entry_price, hard_stop_loss, decision.adjustment_reason
        )

        # Process override request
        if decision.override_stop_loss:
            audit_msg += self._process_override_request(bar_time)

        # Process stop loss adjustment
        if decision.adjust_stop_loss is not None:
            audit_msg += self._process_stop_loss_adjustment(
                decision.adjust_stop_loss, bar_time, is_long, hard_stop_loss
            )

        # Process take profit adjustment
        if decision.adjust_take_profit is not None:
            audit_msg += self._process_take_profit_adjustment(
                decision.adjust_take_profit, bar_time, is_long, entry_price
            )

        audit_msg += f"{'='*80}\n"
        self._write_audit_log(audit_msg)

    def _calculate_hard_stop_loss(self, entry_price: float, atr: float, is_long: bool) -> float:
        """计算硬止损价格"""
        if is_long:
            return entry_price - (atr * self.HARD_STOP_LOSS_ATR)
        else:
            return entry_price + (atr * self.HARD_STOP_LOSS_ATR)

    def _check_hard_stop_loss_take_profit(
        self,
        bar_time,
        current_price: float,
        current_pos_qty: int,
        entry_price: float,
        current_atr: float
    ) -> Tuple[bool, bool]:
        """
        检查硬止损和硬止盈

        Args:
            bar_time: K线时间
            current_price: 当前价格
            current_pos_qty: 当前持仓（>0多头，<0空头）
            entry_price: 开仓价格
            current_atr: 当前ATR

        Returns:
            (是否触发硬止损, 是否触发硬止盈)
        """
        if current_pos_qty == 0:
            return False, False

        # Validate ATR
        if current_atr <= 0:
            logger.warning(f"ATR无效({current_atr})，使用价格的{self.FALLBACK_ATR_PCT:.1%}作为fallback")
            current_atr = current_price * self.FALLBACK_ATR_PCT

        is_long = current_pos_qty > 0

        # Calculate hard levels
        if is_long:
            hard_stop_loss = entry_price - (current_atr * self.HARD_STOP_LOSS_ATR)
            hard_take_profit = entry_price + (current_atr * self.HARD_TAKE_PROFIT_ATR)

            # Check hard stop loss
            if current_price <= hard_stop_loss:
                logger.error(
                    f"[{bar_time.strftime('%Y-%m-%d %H:%M')}] ❌ 硬止损触发 @ {current_price:.2f}\n"
                    f"  └─ 开仓价: {entry_price:.2f}, 硬止损价: {hard_stop_loss:.2f} "
                    f"(开仓价 - ATR×{self.HARD_STOP_LOSS_ATR})"
                )
                self.active_stop_loss = 0.0
                self.active_take_profit = 0.0
                return True, False

            # Check hard take profit
            if current_price >= hard_take_profit:
                logger.info(
                    f"[{bar_time.strftime('%Y-%m-%d %H:%M')}] 🎯✅ 硬止盈触发 @ {current_price:.2f}\n"
                    f"  └─ 开仓价: {entry_price:.2f}, 硬止盈价: {hard_take_profit:.2f} "
                    f"(开仓价 + ATR×{self.HARD_TAKE_PROFIT_ATR})"
                )
                self.active_stop_loss = 0.0
                self.active_take_profit = 0.0
                return False, True

        else:  # Short
            hard_stop_loss = entry_price + (current_atr * self.HARD_STOP_LOSS_ATR)
            hard_take_profit = entry_price - (current_atr * self.HARD_TAKE_PROFIT_ATR)

            # Check hard stop loss
            if current_price >= hard_stop_loss:
                logger.error(
                    f"[{bar_time.strftime('%Y-%m-%d %H:%M')}] ❌ 硬止损触发 @ {current_price:.2f}\n"
                    f"  └─ 开仓价: {entry_price:.2f}, 硬止损价: {hard_stop_loss:.2f} "
                    f"(开仓价 + ATR×{self.HARD_STOP_LOSS_ATR})"
                )
                self.active_stop_loss = 0.0
                self.active_take_profit = 0.0
                return True, False

            # Check hard take profit
            if current_price <= hard_take_profit:
                logger.info(
                    f"[{bar_time.strftime('%Y-%m-%d %H:%M')}] 🎯✅ 硬止盈触发 @ {current_price:.2f}\n"
                    f"  └─ 开仓价: {entry_price:.2f}, 硬止盈价: {hard_take_profit:.2f} "
                    f"(开仓价 - ATR×{self.HARD_TAKE_PROFIT_ATR})"
                )
                self.active_stop_loss = 0.0
                self.active_take_profit = 0.0
                return False, True

        return False, False

    def _check_soft_stop_loss_take_profit(
        self,
        bar_time,
        current_price: float,
        current_pos_qty: int,
        override_stop_loss: bool
    ) -> Tuple[bool, bool]:
        """
        检查软止损和软止盈

        Args:
            bar_time: K线时间
            current_price: 当前价格
            current_pos_qty: 当前持仓
            override_stop_loss: LLM是否请求忽略软止损

        Returns:
            (是否触发软止损, 是否触发软止盈)
        """
        if current_pos_qty == 0 or override_stop_loss:
            return False, False

        is_long = current_pos_qty > 0

        if is_long:
            # Check soft stop loss
            if self.active_stop_loss > 0 and current_price <= self.active_stop_loss:
                logger.info(
                    f"[{bar_time.strftime('%Y-%m-%d %H:%M')}] 🛑 软止损触发 @ {current_price:.2f} "
                    f"(止损价: {self.active_stop_loss:.2f})"
                )
                self.active_stop_loss = 0.0
                self.active_take_profit = 0.0
                return True, False

            # Check soft take profit
            if self.active_take_profit > 0 and current_price >= self.active_take_profit:
                logger.info(
                    f"[{bar_time.strftime('%Y-%m-%d %H:%M')}] 🎯 软止盈触发 @ {current_price:.2f} "
                    f"(止盈价: {self.active_take_profit:.2f})"
                )
                self.active_stop_loss = 0.0
                self.active_take_profit = 0.0
                return False, True

        else:  # Short
            # Check soft stop loss
            if self.active_stop_loss > 0 and current_price >= self.active_stop_loss:
                logger.info(
                    f"[{bar_time.strftime('%Y-%m-%d %H:%M')}] 🛑 软止损触发 @ {current_price:.2f} "
                    f"(止损价: {self.active_stop_loss:.2f})"
                )
                self.active_stop_loss = 0.0
                self.active_take_profit = 0.0
                return True, False

            # Check soft take profit
            if self.active_take_profit > 0 and current_price <= self.active_take_profit:
                logger.info(
                    f"[{bar_time.strftime('%Y-%m-%d %H:%M')}] 🎯 软止盈触发 @ {current_price:.2f} "
                    f"(止盈价: {self.active_take_profit:.2f})"
                )
                self.active_stop_loss = 0.0
                self.active_take_profit = 0.0
                return False, True

        return False, False

    def _build_audit_header(
        self,
        bar_time,
        current_price: float,
        entry_price: float,
        hard_stop_loss: float,
        reason: Optional[str]
    ) -> str:
        """构建审计日志头部"""
        msg = f"\n{'='*80}\n"
        msg += f"[{bar_time.strftime('%Y-%m-%d %H:%M')}] LLM止盈止损调整请求\n"
        msg += f"当前价格: {current_price:.2f}\n"
        msg += f"开仓价格: {entry_price:.2f}\n"
        msg += f"当前止损: {self.active_stop_loss:.2f}\n"
        msg += f"当前止盈: {self.active_take_profit:.2f}\n"
        msg += f"硬止损: {hard_stop_loss:.2f} (不可超越)\n"
        msg += f"调整原因: {reason}\n"
        return msg

    def _process_override_request(self, bar_time) -> str:
        """处理忽略软止损请求"""
        logger.warning(f"[{bar_time.strftime('%Y-%m-%d %H:%M')}] ⚠️  LLM请求忽略软止损")
        return "动作: 忽略软止损\n状态: ✅ 允许（软止损本次不触发）\n"

    def _process_stop_loss_adjustment(
        self,
        new_stop_loss: float,
        bar_time,
        is_long: bool,
        hard_stop_loss: float
    ) -> str:
        """处理止损调整请求"""
        msg = f"建议新止损: {new_stop_loss:.2f}\n"

        # Check if exceeds hard stop loss
        if (is_long and new_stop_loss < hard_stop_loss) or (not is_long and new_stop_loss > hard_stop_loss):
            logger.error(
                f"[{bar_time.strftime('%Y-%m-%d %H:%M')}] ❌ "
                f"LLM建议止损({new_stop_loss:.2f})超过硬止损({hard_stop_loss:.2f})，拒绝"
            )
            return msg + "状态: ❌ 拒绝（超过硬止损限制）\n"

        # Check loosening percentage
        warning_msg = ""
        if self.active_stop_loss > 0:
            loosening_pct = abs((new_stop_loss - self.active_stop_loss) / self.active_stop_loss)
            is_loosening = (is_long and new_stop_loss < self.active_stop_loss) or \
                          (not is_long and new_stop_loss > self.active_stop_loss)

            if is_loosening and loosening_pct > self.MAX_LOOSENING_PCT:
                logger.warning(
                    f"[{bar_time.strftime('%Y-%m-%d %H:%M')}] ⚠️  "
                    f"止损放宽超过{self.MAX_LOOSENING_PCT:.0%}({loosening_pct:.1%})，仍然接受"
                )
                warning_msg = f"状态: ⚠️  接受（但放宽幅度较大: {loosening_pct:.1%}）\n"

        # Accept adjustment
        logger.info(
            f"[{bar_time.strftime('%Y-%m-%d %H:%M')}] ✅ "
            f"接受LLM止损调整: {self.active_stop_loss:.2f} → {new_stop_loss:.2f}"
        )
        self.active_stop_loss = new_stop_loss
        return msg + (warning_msg or "状态: ✅ 接受\n")

    def _process_take_profit_adjustment(
        self,
        new_take_profit: float,
        bar_time,
        is_long: bool,
        entry_price: float
    ) -> str:
        """处理止盈调整请求"""
        msg = f"建议新止盈: {new_take_profit:.2f}\n"

        # Validate take profit direction
        warning_msg = ""
        if (is_long and new_take_profit < entry_price) or (not is_long and new_take_profit > entry_price):
            direction = "多头" if is_long else "空头"
            relation = "低于" if is_long else "高于"
            logger.warning(
                f"[{bar_time.strftime('%Y-%m-%d %H:%M')}] ⚠️  "
                f"{direction}止盈({new_take_profit:.2f}){relation}开仓价({entry_price:.2f})，仍然接受"
            )
            warning_msg = f"状态: ⚠️  接受（但{relation}开仓价）\n"

        # Accept adjustment
        logger.info(
            f"[{bar_time.strftime('%Y-%m-%d %H:%M')}] ✅ "
            f"接受LLM止盈调整: {self.active_take_profit:.2f} → {new_take_profit:.2f}"
        )
        self.active_take_profit = new_take_profit
        return msg + (warning_msg or "状态: ✅ 接受\n")

    def _write_audit_log(self, msg: str):
        """写入审计日志"""
        try:
            with open(self.adjustment_log_path, "a", encoding="utf-8") as f:
                f.write(msg)
        except Exception as e:
            logger.warning(f"写入审计日志失败: {e}")

    def _calculate_technical_indicators(self, klines: pd.DataFrame, period_display: str = "") -> pd.DataFrame:
        """
        计算技术指标（使用TqSDK）

        Args:
            klines: K线数据
            period_display: 周期显示名称（用于日志）

        Returns:
            添加了技术指标的K线数据
        """
        try:
            from tqsdk.ta import MA, RSI, ATR, MACD
        except Exception as e:
            logger.error(f"无法导入TqSDK指标函数: {e}")
            raise

        try:
            # Calculate indicators
            ma10 = MA(klines, 10)
            ma30 = MA(klines, 30)
            ma60 = MA(klines, 60)
            rsi_series = RSI(klines, 14)
            atr_series = ATR(klines, 14)
            macd_series = MACD(klines, 12, 26, 9)

            # Add to DataFrame
            klines["ma10"] = ma10["ma"].astype(float)
            klines["ma30"] = ma30["ma"].astype(float)
            klines["ma60"] = ma60["ma"].astype(float)
            klines["rsi"] = rsi_series["rsi"].astype(float)
            klines["atr"] = atr_series["atr"].astype(float)
            klines["macd"] = macd_series["diff"].astype(float)
            klines["macd_dea"] = macd_series["dea"].astype(float)
            klines["macd_bar"] = macd_series["bar"].astype(float)

            # Validate
            total_bars = len(klines)
            valid_count = (~klines["ma30"].isna()).sum()
            valid_pct = (valid_count / total_bars * 100) if total_bars > 0 else 0

            if period_display:
                logger.info(f"  ✅ {period_display} 指标计算完成: {valid_count}/{total_bars} ({valid_pct:.1f}%) 有效")
                if valid_count < total_bars * 0.3:
                    logger.warning(f"  ⚠️ {period_display} 有效数据不足30%，可能影响决策质量")

            return klines

        except Exception as e:
            error_msg = f"{period_display} 指标计算失败: {e}" if period_display else f"指标计算失败: {e}"
            logger.error(f"  ❌ {error_msg}")
            raise RuntimeError(error_msg)

    def _determine_first_ready_time(self, klines: pd.DataFrame) -> Optional[pd.Timestamp]:
        """
        确定指标就绪的第一个时间点

        Args:
            klines: K线数据

        Returns:
            第一个所有关键指标都有效的时间点，如果没有则返回None
        """
        critical_indicators = ['ma10', 'ma30', 'rsi', 'atr']
        ready_mask = True

        for ind in critical_indicators:
            if ind not in klines.columns:
                logger.error(f"关键指标 {ind} 不存在于K线数据中")
                return None
            ready_mask = ready_mask & (~klines[ind].isna())

        if not ready_mask.any():
            logger.error(
                f"关键指标({'/'.join(critical_indicators)})始终为NaN，"
                f"数据长度不足（建议≥60根K线），当前: {len(klines)}"
            )
            return None

        return tafunc.time_to_datetime(klines.loc[ready_mask, "datetime"].iloc[0])

    def _setup_klines_and_indicators(
        self,
        api,
        symbol: str,
        is_multi_timeframe: bool
    ) -> Tuple[pd.DataFrame, Optional[Dict[str, pd.DataFrame]], Optional[pd.Timestamp], bool]:
        """
        设置K线数据和技术指标

        Args:
            api: TqSDK API实例
            symbol: 交易合约
            is_multi_timeframe: 是否多周期模式

        Returns:
            (主K线, 多周期K线字典, 指标就绪时间, 预热日志标志)
        """
        if is_multi_timeframe:
            logger.info("=== 使用多周期模式 ===")
            klines_dict = self._fetch_multi_timeframe_data(api, symbol)
            klines = klines_dict.get("decision")
            if klines is None:
                raise RuntimeError("决策周期数据获取失败")
        else:
            logger.info("=== 使用单周期模式 ===")
            duration_seconds = self.cfg.get_decision_duration_seconds()
            data_length = self.cfg.get_auto_count() + self.DATA_WARMUP_BARS

            klines = api.get_kline_serial(
                symbol,
                duration_seconds=duration_seconds,
                data_length=data_length
            )

            logger.info(f"开始计算TqSDK技术指标，数据长度: {len(klines)} bars")
            klines = self._calculate_technical_indicators(klines)

            # Validate indicators
            total_bars = len(klines)
            min_required = max(60, 26, 14)
            if total_bars < min_required:
                logger.warning(f"数据长度({total_bars})少于建议值({min_required})，指标可能部分为NaN")

            klines_dict = None

        # Find first ready time
        first_ready_time = self._determine_first_ready_time(klines)
        if first_ready_time is None:
            raise RuntimeError("关键指标无有效数据，无法继续回测")

        return klines, klines_dict, first_ready_time, False

    def _fetch_multi_timeframe_data(self, api, symbol: str) -> Dict[str, pd.DataFrame]:
        """
        获取并计算多周期K线数据和技术指标

        Args:
            api: TqSDK API实例
            symbol: 交易合约

        Returns:
            周期名称到K线数据的映射
            Example: {"decision": df_1d, "aux_240m": df_4h, "aux_60m": df_1h}
        """
        klines_dict = {}
        all_periods = self.cfg.get_all_periods()

        logger.info("=== 获取多周期数据 ===")
        logger.info(f"配置的周期: {all_periods}")

        for period_name, period_minutes in all_periods.items():
            duration_seconds = period_minutes * 60
            data_length = self.cfg.get_auto_count_for_period(period_minutes)
            period_display = self.cfg.get_period_name(period_minutes)

            logger.info(f"获取 {period_display} 数据: {data_length} 根K线...")

            # Fetch klines
            klines = api.get_kline_serial(
                symbol,
                duration_seconds=duration_seconds,
                data_length=data_length
            )
            api.wait_update()

            # Calculate indicators
            klines = self._calculate_technical_indicators(klines, period_display)
            klines_dict[period_name] = klines

        logger.info(f"=== 多周期数据获取完成：共 {len(klines_dict)} 个周期 ===")
        return klines_dict

    def _setup_tqsdk_auth(self, username: Optional[str], password: Optional[str]):
        """设置TqSDK认证"""
        if not username or not password:
            return None

        try:
            from tqsdk import TqAuth
            return TqAuth(username, password)
        except Exception:
            return None

    def _normalize_symbol(self, symbol: str) -> str:
        """标准化合约符号为TqSDK格式"""
        sym_up = (symbol or "").strip().upper()

        # Handle SA special cases
        if sym_up in ("SA0", "SA", "CZCE.SA0", "CZCE.SA") or sym_up.endswith(".SA0"):
            return "KQ.m@CZCE.SA"

        # Handle CZCE exchange
        if sym_up.startswith("SA") and "." not in sym_up:
            return f"CZCE.{symbol}"

        return symbol

    def _is_in_trading_time(self, quote) -> bool:
        """
        判断当前是否在交易时间内
        
        Args:
            quote: TqSDK的quote对象，包含trading_time和datetime信息
            
        Returns:
            True表示在交易时间内，False表示不在交易时间内
        """
        from datetime import datetime, time
        
        # 获取trading_time字段
        trading_time = getattr(quote, 'trading_time', None)
        if not trading_time:
            logger.warning("无法获取trading_time信息，默认认为不在交易时间")
            return False
        
        # 获取quote的datetime（纳秒数），转换为北京时间的datetime对象
        quote_datetime_ns = getattr(quote, 'datetime', None)
        if quote_datetime_ns is None:
            logger.warning("无法获取quote.datetime，使用系统时间")
            tz = self.cfg.get_timezone()
            now = datetime.now(tz)
        else:
            # TqSDK的datetime是纳秒数，需要转换为datetime对象
            now = tafunc.time_to_datetime(quote_datetime_ns)
        
        current_time = now.time()
        
        logger.debug(f"行情时间: {now.strftime('%Y-%m-%d %H:%M:%S')}")
        logger.debug(f"交易时间段: {trading_time}")
        
        # 检查是否在任何交易时间段内
        for period_name, time_ranges in trading_time.items():
            if not isinstance(time_ranges, list):
                continue
                
            for time_range in time_ranges:
                if not isinstance(time_range, list) or len(time_range) != 2:
                    continue
                
                try:
                    # 解析开始和结束时间
                    start_str, end_str = time_range
                    start_parts = [int(x) for x in start_str.split(':')]
                    end_parts = [int(x) for x in end_str.split(':')]
                    
                    # 处理跨日情况（如夜盘 21:00:00 到 25:00:00）
                    if end_parts[0] >= 24:
                        # 结束时间超过24小时，说明跨日
                        end_parts[0] -= 24
                        end_time = time(end_parts[0], end_parts[1], end_parts[2] if len(end_parts) > 2 else 0)
                        start_time = time(start_parts[0], start_parts[1], start_parts[2] if len(start_parts) > 2 else 0)
                        
                        # 跨日情况：在start_time之后 或 在end_time之前
                        if current_time >= start_time or current_time < end_time:
                            logger.info(f"当前时间在交易时段内: {period_name} [{start_str}-{end_str}]")
                            return True
                    else:
                        # 正常情况，不跨日
                        start_time = time(start_parts[0], start_parts[1], start_parts[2] if len(start_parts) > 2 else 0)
                        end_time = time(end_parts[0], end_parts[1], end_parts[2] if len(end_parts) > 2 else 0)
                        
                        if start_time <= current_time < end_time:
                            logger.info(f"当前时间在交易时段内: {period_name} [{start_str}-{end_str}]")
                            return True
                            
                except (ValueError, IndexError) as e:
                    logger.warning(f"解析交易时间段失败: {time_range}, 错误: {e}")
                    continue
        
        logger.info("当前时间不在任何交易时段内")
        return False

    def _update_engine_trade_meta(self, updates: Dict[str, Any]):
        """更新引擎的交易元数据"""
        # Try llm_direct first (for LLMDirectEngine)
        if hasattr(self.engine, 'llm_direct') and hasattr(self.engine.llm_direct, 'trade_meta'):
            self.engine.llm_direct.trade_meta.update(updates)
        # Fallback to engine directly (for HybridEngine)
        elif hasattr(self.engine, 'trade_meta'):
            self.engine.trade_meta.update(updates)

    def _calculate_initial_capital_from_units(self, auth) -> float:
        """
        根据单位数计算初始资金

        Args:
            auth: TqSDK认证对象

        Returns:
            计算得到的初始资金
        """
        if self.initial_units is None:
            return self.cfg.initial_capital

        logger.info(f"准备根据单位数 {self.initial_units} 计算初始资金...")

        try:
            from tqsdk import TqApi
            import math

            # Create temporary API to fetch price
            temp_api = TqApi(auth=auth) if auth else TqApi()
            symbol_tq_data = self._normalize_symbol(self.cfg.symbol)
            temp_quote = temp_api.get_quote(symbol_tq_data)

            # Wait with timeout
            temp_api.wait_update(deadline=time.time() + 10)

            # Try to get a valid price, checking multiple fields
            first_price = None
            price_fields = ['last_price', 'close', 'settlement', 'pre_settlement', 'open', 'high', 'low', 'pre_close']
            checked_fields = {}

            for field in price_fields:
                if hasattr(temp_quote, field):
                    value = getattr(temp_quote, field)
                    checked_fields[field] = value
                    if value is not None and not math.isnan(float(value)) and float(value) > 0:
                        first_price = float(value)
                        logger.info(f"从实时API的 {field} 字段获取价格: {first_price:.2f}")
                        break

            if first_price is None:
                logger.warning(f"无法从实时API获取有效价格，所有检查的价格字段:")
                for field, value in checked_fields.items():
                    logger.warning(f"  {field}: {value}")
                temp_api.close()
                raise ValueError(f"所有价格字段都是 NaN 或无效")

            contract_multiplier = int(temp_quote.volume_multiple)

            # Get commission
            commission = self.cfg.commission_per_lot
            if commission is None and hasattr(temp_quote, 'commission'):
                commission = float(temp_quote.commission)
                logger.info(f"从 TqSDK 获取手续费: {commission} 元/手")

            temp_api.close()

            # Calculate capital
            margin_ratio = self.cfg.margin_ratio
            contract_value = first_price * contract_multiplier * self.initial_units
            required_margin = contract_value * margin_ratio
            initial_capital = required_margin * self.CAPITAL_BUFFER_MULTIPLIER

            # Update config and engine
            self.cfg.initial_capital = initial_capital
            updates = {'initial_capital': initial_capital, 'margin_ratio': margin_ratio}
            if commission is not None:
                updates['commission_per_lot'] = commission
            self._update_engine_trade_meta(updates)

            logger.info("根据单位数和保证金比例计算初始资金:")
            logger.info(f"  合约价值: {first_price:.2f} × {contract_multiplier} × {self.initial_units} = {contract_value:,.2f}")
            logger.info(f"  所需保证金: {contract_value:,.2f} × {margin_ratio:.1%} = {required_margin:,.2f}")
            logger.info(f"  初始资金: {required_margin:,.2f} × {self.CAPITAL_BUFFER_MULTIPLIER} = {initial_capital:,.2f} (含缓冲)")

            return initial_capital

        except Exception as e:
            logger.warning(f"无法获取价格计算初始资金，使用默认值: {e}")
            return self.cfg.initial_capital

    def run_tqsdk(self, start_dt: datetime, end_dt: datetime, username: Optional[str] = None, password: Optional[str] = None, use_sim: bool = True, web_gui: Optional[bool | str] = None) -> Dict[str, Any]:
        """
        运行TqSDK回测

        Args:
            start_dt: 回测开始时间
            end_dt: 回测结束时间
            username: TqSDK用户名
            password: TqSDK密码
            use_sim: 是否使用模拟账户
            web_gui: 启用Web GUI。可以是True（使用默认地址）或指定地址字符串（如 "http://192.168.1.100:9876"）

        Returns:
            回测结果字典
        """
        try:
            from tqsdk import TqApi, TqBacktest, TqAuth, TqSim, TargetPosTask
            from tqsdk.ta import MA, RSI, ATR, MACD
        except Exception as e:
            logger.error(f"未安装或无法导入TqSDK: {e}")
            raise

        # Setup authentication
        auth = self._setup_tqsdk_auth(username, password)

        # Calculate initial capital
        initial_capital = self._calculate_initial_capital_from_units(auth)

        # Create backtest API
        backtest_params = {
            'account': TqSim(init_balance=initial_capital),
            'backtest': TqBacktest(start_dt=start_dt, end_dt=end_dt)
        }
        if auth:
            backtest_params['auth'] = auth

        # Add web_gui parameter if specified
        if web_gui is not None:
            backtest_params['web_gui'] = web_gui

        api = TqApi(**backtest_params)

        # Get trading symbols
        symbol_tq_data = self._normalize_symbol(self.cfg.symbol)
        quote = api.get_quote(symbol_tq_data)
        api.wait_update()

        symbol_tq_trade = quote.underlying_symbol if hasattr(quote, 'underlying_symbol') and quote.underlying_symbol else symbol_tq_data

        # Update contract info in engine
        contract_multiplier = int(quote.volume_multiple)
        logger.info(f"从 TqSDK 获取合约乘数: {contract_multiplier}")

        commission = self.cfg.commission_per_lot
        if commission is None and hasattr(quote, 'commission'):
            commission = float(quote.commission)
            logger.info(f"从 TqSDK 获取手续费: {commission} 元/手")
        elif commission is not None:
            logger.info(f"使用配置指定的手续费: {commission} 元/手")

        updates = {'contract_multiplier': contract_multiplier}
        if commission is not None:
            updates['commission_per_lot'] = commission
        self._update_engine_trade_meta(updates)

        # Setup klines and indicators
        is_multi_timeframe = len(self.cfg.get_all_periods()) > 1
        klines, klines_dict, first_ready_time, warmup_logged = self._setup_klines_and_indicators(
            api, symbol_tq_data, is_multi_timeframe
        )

        # Ensure first_ready_time has same timezone info as end_dt for comparison
        if first_ready_time is not None and end_dt.tzinfo is not None and first_ready_time.tzinfo is None:
            first_ready_time = first_ready_time.tz_localize(end_dt.tzinfo)

        # Log backtest info
        duration_seconds = self.cfg.get_decision_duration_seconds()
        data_length = self.cfg.get_auto_count() + self.DATA_WARMUP_BARS

        logger.info("=== TqSDK原生回测 ===")
        logger.info(f"数据合约: {symbol_tq_data}")
        logger.info(f"交易合约: {symbol_tq_trade}")
        logger.info(f"回测区间: {start_dt} ~ {end_dt}")
        logger.info(f"决策周期: {self.cfg.decision_period}分钟 ({duration_seconds}秒)")
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
        total_bars_expected = int((end_dt - start_dt).days) if self.cfg.decision_period >= 1440 else None

        logger.info(f"初始资金: {initial_balance:,.2f}")
        logger.info(f"使用TargetPosTask自动处理订单时间")
        if total_bars_expected:
            logger.info(f"预计处理 {total_bars_expected} 根K线")

        # Main backtest loop
        while api.wait_update():  # Returns False when backtest ends

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

                    # 显式同步到 klines_dict（多周期模式）
                    if is_multi_timeframe and klines_dict and "decision" in klines_dict:
                        klines_dict["decision"] = klines
                except Exception:
                    pass

                # 更新多周期辅助数据（针对 llm_direct 模式）
                if is_multi_timeframe and klines_dict:
                    for period_key in klines_dict.keys():
                        if period_key == "decision":
                            continue  # 决策周期已在上面更新

                        try:
                            aux_klines = klines_dict[period_key]
                            # 重新计算辅助周期的所有指标
                            ma10_aux = MA(aux_klines, 10)
                            ma30_aux = MA(aux_klines, 30)
                            ma60_aux = MA(aux_klines, 60)
                            rsi_aux = RSI(aux_klines, 14)
                            atr_aux = ATR(aux_klines, 14)
                            macd_aux = MACD(aux_klines, 12, 26, 9)

                            aux_klines["ma10"] = ma10_aux["ma"].astype(float)
                            aux_klines["ma30"] = ma30_aux["ma"].astype(float)
                            aux_klines["ma60"] = ma60_aux["ma"].astype(float)
                            aux_klines["rsi"] = rsi_aux["rsi"].astype(float)
                            aux_klines["atr"] = atr_aux["atr"].astype(float)
                            aux_klines["macd"] = macd_aux["diff"].astype(float)
                            aux_klines["macd_dea"] = macd_aux["dea"].astype(float)
                            aux_klines["macd_bar"] = macd_aux["bar"].astype(float)
                        except Exception as e:
                            logger.warning(f"辅助周期 {period_key} 指标更新失败: {e}")

                # Get completed bar (second to last)
                bar = klines.iloc[-2]
                bar_time = tafunc.time_to_datetime(bar["datetime"])

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
                ctx = klines.iloc[: len(klines)-1 ].copy()
                df_ctx = pd.DataFrame({
                    "timestamp": ctx["datetime"].apply(tafunc.time_to_datetime),
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
                    # ✅ Inject stop loss and take profit info for LLM prompt
                    setattr(self.engine, "active_stop_loss", self.active_stop_loss)
                    setattr(self.engine, "active_take_profit", self.active_take_profit)
                elif hasattr(self.engine, "llm_direct") and hasattr(self.engine.llm_direct, "current_pos"):
                    if current_pos_qty > 0:
                        self.engine.llm_direct.current_pos = Position(direction="long", qty=current_pos_qty, entry_price=position.open_price_long, stop=0, take=0)
                    elif current_pos_qty < 0:
                        self.engine.llm_direct.current_pos = Position(direction="short", qty=abs(current_pos_qty), entry_price=position.open_price_short, stop=0, take=0)
                    else:
                        self.engine.llm_direct.current_pos = None
                    setattr(self.engine.llm_direct, "current_balance", account.balance)
                    setattr(self.engine.llm_direct, "tqsdk_snapshot", snapshot)
                    # ✅ Inject stop loss and take profit info for LLM prompt
                    setattr(self.engine.llm_direct, "active_stop_loss", self.active_stop_loss)
                    setattr(self.engine.llm_direct, "active_take_profit", self.active_take_profit)

                # ========================================
                # STEP 1: 硬止损检查（最高优先级，无法被LLM覆盖）
                # ========================================
                hard_stop_triggered = False
                hard_take_profit_triggered = False

                if current_pos_qty != 0:
                    # 获取ATR用于计算硬止损
                    current_atr = float(row.get("atr", 0))
                    if current_atr <= 0:
                        logger.warning(f"ATR无效({current_atr})，无法计算硬止损")
                        current_atr = current_price * 0.02  # Fallback: 2% of price

                    # 获取开仓价
                    entry_price = position.open_price_long if current_pos_qty > 0 else position.open_price_short

                    # 计算硬止损和硬止盈
                    if current_pos_qty > 0:  # Long position
                        hard_stop_loss = entry_price - (current_atr * self.HARD_STOP_LOSS_ATR)
                        hard_take_profit = entry_price + (current_atr * self.HARD_TAKE_PROFIT_ATR)

                        # Check hard stop loss
                        if current_price <= hard_stop_loss:
                            logger.error(f"[{bar_time.strftime('%Y-%m-%d %H:%M')}] ❌ 硬止损触发 @ {current_price:.2f}")
                            logger.error(f"  └─ 开仓价: {entry_price:.2f}, 硬止损价: {hard_stop_loss:.2f} (开仓价 - ATR×{self.HARD_STOP_LOSS_ATR})")
                            target_pos_task.set_target_volume(0)
                            trade_count += 1
                            hard_stop_triggered = True
                            self.active_stop_loss = 0.0
                            self.active_take_profit = 0.0

                        # Check hard take profit
                        elif current_price >= hard_take_profit:
                            logger.info(f"[{bar_time.strftime('%Y-%m-%d %H:%M')}] 🎯✅ 硬止盈触发 @ {current_price:.2f}")
                            logger.info(f"  └─ 开仓价: {entry_price:.2f}, 硬止盈价: {hard_take_profit:.2f} (开仓价 + ATR×{self.HARD_TAKE_PROFIT_ATR})")
                            target_pos_task.set_target_volume(0)
                            trade_count += 1
                            hard_take_profit_triggered = True
                            self.active_stop_loss = 0.0
                            self.active_take_profit = 0.0

                    elif current_pos_qty < 0:  # Short position
                        hard_stop_loss = entry_price + (current_atr * self.HARD_STOP_LOSS_ATR)
                        hard_take_profit = entry_price - (current_atr * self.HARD_TAKE_PROFIT_ATR)

                        # Check hard stop loss
                        if current_price >= hard_stop_loss:
                            logger.error(f"[{bar_time.strftime('%Y-%m-%d %H:%M')}] ❌ 硬止损触发 @ {current_price:.2f}")
                            logger.error(f"  └─ 开仓价: {entry_price:.2f}, 硬止损价: {hard_stop_loss:.2f} (开仓价 + ATR×{self.HARD_STOP_LOSS_ATR})")
                            target_pos_task.set_target_volume(0)
                            trade_count += 1
                            hard_stop_triggered = True
                            self.active_stop_loss = 0.0
                            self.active_take_profit = 0.0

                        # Check hard take profit
                        elif current_price <= hard_take_profit:
                            logger.info(f"[{bar_time.strftime('%Y-%m-%d %H:%M')}] 🎯✅ 硬止盈触发 @ {current_price:.2f}")
                            logger.info(f"  └─ 开仓价: {entry_price:.2f}, 硬止盈价: {hard_take_profit:.2f} (开仓价 - ATR×{self.HARD_TAKE_PROFIT_ATR})")
                            target_pos_task.set_target_volume(0)
                            trade_count += 1
                            hard_take_profit_triggered = True
                            self.active_stop_loss = 0.0
                            self.active_take_profit = 0.0

                # Skip decision making if hard stop was triggered
                if hard_stop_triggered or hard_take_profit_triggered:
                    continue

                # ========================================
                # STEP 2: 策略决策（硬止损未触发时）
                # ========================================
                try:
                    if self.mode == DecisionMode.QUANT_ONLY:
                        decision = self.engine.decide(row, df_ctx)
                    else:
                        # Pass multi-timeframe data if available
                        decision = self.engine.decide(row, df_ctx, symbol=self.cfg.symbol, klines_dict=klines_dict, cfg=self.cfg)

                    # Output LLM rationale if enabled
                    if self.show_rationale and decision.rationale and len(decision.rationale) > 0:
                        logger.info(f"[{bar_time.strftime('%Y-%m-%d %H:%M')}] 决策依据: {' | '.join(decision.rationale)}")
                        if decision.confidence > 0:
                            logger.info(f"  → 置信度: {decision.confidence:.2%}, 操作: {decision.action}")
                except Exception as e:
                    logger.warning(f"决策失败 @ {bar_time}: {e}")
                    continue

                # ========================================
                # STEP 3: 处理LLM止盈止损调整请求
                # ========================================
                if decision.override_stop_loss or decision.adjust_stop_loss or decision.adjust_take_profit:
                    self._process_llm_adjustment(
                        decision, bar_time, current_price, current_pos_qty,
                        position, current_atr if 'current_atr' in locals() else float(row.get("atr", 0))
                    )

                # ========================================
                # STEP 4: 检查软止损（LLM可覆盖）
                # ========================================
                soft_stop_triggered = False
                soft_take_profit_triggered = False

                # Only check soft stop if LLM didn't override and position exists
                if current_pos_qty != 0 and not decision.override_stop_loss:
                    if current_pos_qty > 0:  # Long position
                        # Check soft stop loss
                        if self.active_stop_loss > 0 and current_price <= self.active_stop_loss:
                            logger.info(f"[{bar_time.strftime('%Y-%m-%d %H:%M')}] 🛑 软止损触发 @ {current_price:.2f} (止损价: {self.active_stop_loss:.2f})")
                            target_pos_task.set_target_volume(0)
                            trade_count += 1
                            soft_stop_triggered = True
                            self.active_stop_loss = 0.0
                            self.active_take_profit = 0.0
                        # Check soft take profit
                        elif self.active_take_profit > 0 and current_price >= self.active_take_profit:
                            logger.info(f"[{bar_time.strftime('%Y-%m-%d %H:%M')}] 🎯 软止盈触发 @ {current_price:.2f} (止盈价: {self.active_take_profit:.2f})")
                            target_pos_task.set_target_volume(0)
                            trade_count += 1
                            soft_take_profit_triggered = True
                            self.active_stop_loss = 0.0
                            self.active_take_profit = 0.0

                    elif current_pos_qty < 0:  # Short position
                        # Check soft stop loss
                        if self.active_stop_loss > 0 and current_price >= self.active_stop_loss:
                            logger.info(f"[{bar_time.strftime('%Y-%m-%d %H:%M')}] 🛑 软止损触发 @ {current_price:.2f} (止损价: {self.active_stop_loss:.2f})")
                            target_pos_task.set_target_volume(0)
                            trade_count += 1
                            soft_stop_triggered = True
                            self.active_stop_loss = 0.0
                            self.active_take_profit = 0.0
                        # Check soft take profit
                        elif self.active_take_profit > 0 and current_price <= self.active_take_profit:
                            logger.info(f"[{bar_time.strftime('%Y-%m-%d %H:%M')}] 🎯 软止盈触发 @ {current_price:.2f} (止盈价: {self.active_take_profit:.2f})")
                            target_pos_task.set_target_volume(0)
                            trade_count += 1
                            soft_take_profit_triggered = True
                            self.active_stop_loss = 0.0
                            self.active_take_profit = 0.0

                # Skip order execution if soft stop was triggered
                if soft_stop_triggered or soft_take_profit_triggered:
                    continue

                # Execute decision via TqSDK using TargetPosTask
                # TargetPosTask automatically handles order timing and execution
                try:
                    new_target_pos = current_pos_qty  # Default: maintain current position

                    if decision.action == "open_long" and current_pos_qty == 0 and decision.position_size > 0:
                        logger.info(f"[{bar_time.strftime('%Y-%m-%d %H:%M')}] 📈 开多 {decision.position_size}手 (决策价: {current_price:.2f})")
                        if self.show_rationale and decision.rationale:
                            logger.info(f"  └─ 理由: {' | '.join(decision.rationale)}")
                        if decision.stop_loss > 0 or decision.take_profit > 0:
                            logger.info(f"  └─ 止损: {decision.stop_loss:.2f}, 止盈: {decision.take_profit:.2f}")
                        new_target_pos = int(decision.position_size)
                        trade_count += 1
                        # ✅ Update active stop loss and take profit
                        self.active_stop_loss = float(decision.stop_loss) if decision.stop_loss > 0 else 0.0
                        self.active_take_profit = float(decision.take_profit) if decision.take_profit > 0 else 0.0

                    elif decision.action == "open_short" and current_pos_qty == 0 and decision.position_size > 0:
                        logger.info(f"[{bar_time.strftime('%Y-%m-%d %H:%M')}] 📉 开空 {decision.position_size}手 (决策价: {current_price:.2f})")
                        if self.show_rationale and decision.rationale:
                            logger.info(f"  └─ 理由: {' | '.join(decision.rationale)}")
                        if decision.stop_loss > 0 or decision.take_profit > 0:
                            logger.info(f"  └─ 止损: {decision.stop_loss:.2f}, 止盈: {decision.take_profit:.2f}")
                        new_target_pos = -int(decision.position_size)
                        trade_count += 1
                        # ✅ Update active stop loss and take profit
                        self.active_stop_loss = float(decision.stop_loss) if decision.stop_loss > 0 else 0.0
                        self.active_take_profit = float(decision.take_profit) if decision.take_profit > 0 else 0.0

                    elif decision.action == "close_long" and current_pos_qty > 0:
                        close_qty = int(decision.position_size) if decision.position_size else current_pos_qty
                        logger.info(f"[{bar_time.strftime('%Y-%m-%d %H:%M')}] 🔻 平多 {close_qty}手 @ {current_price:.2f}")
                        if self.show_rationale and decision.rationale:
                            logger.info(f"  └─ 理由: {' | '.join(decision.rationale)}")
                        new_target_pos = max(0, current_pos_qty - close_qty)
                        trade_count += 1
                        # ✅ Clear stop loss and take profit if fully closed
                        if new_target_pos == 0:
                            self.active_stop_loss = 0.0
                            self.active_take_profit = 0.0

                    elif decision.action == "close_short" and current_pos_qty < 0:
                        close_qty = int(decision.position_size) if decision.position_size else abs(current_pos_qty)
                        logger.info(f"[{bar_time.strftime('%Y-%m-%d %H:%M')}] 🔺 平空 {close_qty}手 @ {current_price:.2f}")
                        if self.show_rationale and decision.rationale:
                            logger.info(f"  └─ 理由: {' | '.join(decision.rationale)}")
                        new_target_pos = min(0, current_pos_qty + close_qty)
                        trade_count += 1
                        # ✅ Clear stop loss and take profit if fully closed
                        if new_target_pos == 0:
                            self.active_stop_loss = 0.0
                            self.active_take_profit = 0.0

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
                            # ✅ Update stop loss and take profit for adjusted position
                            if target != 0:
                                self.active_stop_loss = float(decision.stop_loss) if decision.stop_loss > 0 else 0.0
                                self.active_take_profit = float(decision.take_profit) if decision.take_profit > 0 else 0.0
                            else:
                                # Fully closed position
                                self.active_stop_loss = 0.0
                                self.active_take_profit = 0.0

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

    def analyze_latest(self, username: Optional[str] = None, password: Optional[str] = None, use_sim: bool = True) -> Dict[str, Any]:
        """
        仅分析最新一根K线，给出LLM的决策建议（不运行回测）

        Args:
            username: TqSDK用户名
            password: TqSDK密码
            use_sim: 是否使用模拟账户

        Returns:
            包含决策结果的字典
        """
        try:
            from tqsdk import TqApi, TqAuth, TqSim
            from tqsdk.ta import MA, RSI, ATR, MACD
        except Exception as e:
            logger.error(f"未安装或无法导入TqSDK: {e}")
            raise

        # Setup authentication
        auth = self._setup_tqsdk_auth(username, password)

        # Create API (real-time mode, no backtest)
        api_params = {}
        if auth:
            api_params['auth'] = auth

        api = TqApi(**api_params)

        try:
            # Get trading symbols
            symbol_tq_data = self._normalize_symbol(self.cfg.symbol)
            quote = api.get_quote(symbol_tq_data)

            # Fetch K-line data
            is_multi_timeframe = len(self.cfg.get_all_periods()) > 1
            
            if is_multi_timeframe:
                logger.info("=== 使用多周期模式获取最新数据 ===")
                klines_dict = self._fetch_multi_timeframe_data(api, symbol_tq_data)
                klines = klines_dict.get("decision")
                if klines is None:
                    raise RuntimeError("决策周期数据获取失败")
            else:
                logger.info("=== 使用单周期模式获取最新数据 ===")
                duration_seconds = self.cfg.get_decision_duration_seconds()
                data_length = 100  # Fetch enough data for indicators

                klines = api.get_kline_serial(
                    symbol_tq_data,
                    duration_seconds=duration_seconds,
                    data_length=data_length
                )
                api.wait_update()

                logger.info(f"计算技术指标，数据长度: {len(klines)} bars")
                klines = self._calculate_technical_indicators(klines)
                klines_dict = None

            # Get the latest completed bar
            if len(klines) < 2:
                raise RuntimeError("数据不足，无法分析")

            # Check if currently in trading time using quote.trading_time
            # According to TqSDK docs: trading_time contains time ranges like:
            # {"day": [["09:00:00", "10:15:00"], ...], "night": [["21:00:00", "25:00:00"]]}
            api.wait_update()
            
            is_trading = self._is_in_trading_time(quote)
            
            if is_trading:
                # In trading time: -1 is forming, -2 is latest completed
                bar_idx = -2
                logger.info(f"当前在交易时间内，使用前一根已完成K线(iloc[-2])")
            else:
                # Not in trading time: -1 might be empty future bar, use -2 for safety
                bar_idx = -2
                logger.info(f"当前不在交易时间，使用最新已完成K线(iloc[-2])")
            
            bar = klines.iloc[bar_idx]
            bar_time = tafunc.time_to_datetime(bar["datetime"])

            # Prepare context (all bars before current)
            # If using -1 (latest bar), include all bars up to -1; if using -2, include all bars up to -2
            ctx_end_idx = bar_idx if bar_idx == -1 else len(klines) - 1
            ctx = klines.iloc[:ctx_end_idx].copy()
            df_ctx = pd.DataFrame({
                "timestamp": ctx["datetime"].apply(tafunc.time_to_datetime),
                "open": ctx["open"].astype(float),
                "high": ctx["high"].astype(float),
                "low": ctx["low"].astype(float),
                "close": ctx["close"].astype(float),
                "volume": ctx["volume"].astype(float),
            })

            # Copy technical indicators
            indicator_columns = ["ma10", "ma30", "ma60", "rsi", "atr", "macd", "macd_dea", "macd_bar"]
            for col in indicator_columns:
                if col in ctx.columns:
                    df_ctx[col] = ctx[col].astype(float)

            # Current bar as Series
            row = pd.Series({
                "timestamp": bar_time,
                "open": float(bar["open"]),
                "high": float(bar["high"]),
                "low": float(bar["low"]),
                "close": float(bar["close"]),
                "volume": float(bar["volume"]),
            })

            # Add technical indicators to current bar
            for col in indicator_columns:
                if col in bar.index and not pd.isna(bar[col]):
                    row[col] = float(bar[col])

            # Set row.name and append to context
            row.name = len(df_ctx)
            df_ctx = pd.concat([df_ctx, row.to_frame().T], ignore_index=False)

            current_price = float(row["close"]) if not pd.isna(row["close"]) else float(row["open"])

            # Get position info (if available)
            if hasattr(api, 'get_position'):
                symbol_tq_trade = quote.underlying_symbol if hasattr(quote, 'underlying_symbol') and quote.underlying_symbol else symbol_tq_data
                position = api.get_position(symbol_tq_trade)
                current_pos_qty = position.pos_long - position.pos_short
            else:
                current_pos_qty = 0

            # Inject position state to decision engine (no position for latest mode)
            if hasattr(self.engine, "current_pos"):
                self.engine.current_pos = None
                setattr(self.engine, "current_balance", self.cfg.initial_capital)
                setattr(self.engine, "active_stop_loss", 0.0)
                setattr(self.engine, "active_take_profit", 0.0)
            elif hasattr(self.engine, "llm_direct") and hasattr(self.engine.llm_direct, "current_pos"):
                self.engine.llm_direct.current_pos = None
                setattr(self.engine.llm_direct, "current_balance", self.cfg.initial_capital)
                setattr(self.engine.llm_direct, "active_stop_loss", 0.0)
                setattr(self.engine.llm_direct, "active_take_profit", 0.0)

            # Make decision
            logger.info(f"分析最新K线: {bar_time}")
            try:
                if self.mode == DecisionMode.QUANT_ONLY:
                    decision = self.engine.decide(row, df_ctx)
                else:
                    decision = self.engine.decide(row, df_ctx, symbol=self.cfg.symbol, klines_dict=klines_dict, cfg=self.cfg)
            except Exception as e:
                logger.error(f"决策失败: {e}")
                raise

            # Build result
            result = {
                "timestamp": bar_time.strftime("%Y-%m-%d %H:%M:%S"),
                "current_price": current_price,
                "decision": decision.action,
                "position_size": decision.position_size,
                "confidence": decision.confidence,
                "stop_loss": decision.stop_loss,
                "take_profit": decision.take_profit,
            }

            if decision.rationale:
                result["rationale"] = "\n".join(decision.rationale)

            logger.info(f"决策结果: {decision.action}, 置信度: {decision.confidence:.2%}")

            return result

        finally:
            api.close()
