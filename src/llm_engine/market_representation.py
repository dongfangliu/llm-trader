"""
Market Representation and Event Detection Module

Implements three-level data representation and event detection for enhanced LLM decision making.

Three-Level Architecture:
1. Raw Data Layer: Compressed price series preserving key patterns
2. Feature Description Layer: Natural language descriptions of market behaviors
3. State Summary Layer: Abstract market regime and opportunity assessment

Author: Enhanced by consensus discussion (2025-01-29)
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
from loguru import logger


@dataclass
class MarketEvent:
    """市场事件数据结构"""
    timestamp: datetime
    event_type: str  # '突破', '回踩', '放量', '缩量', '背离', '形态'等
    description: str
    significance: float  # 0-1, 事件显著性评分
    price_level: Optional[float] = None
    volume_ratio: Optional[float] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_timeline_str(self) -> str:
        """转换为时间线字符串表示"""
        time_str = self.timestamp.strftime('%H:%M')
        sig_mark = '⚠️' if self.significance > 0.8 else ('📌' if self.significance > 0.6 else '·')
        return f"{time_str} {sig_mark} {self.description}"


@dataclass
class MarketRepresentation:
    """三级市场表示数据结构"""
    # 原始数据层
    raw_data: Dict[str, Any]

    # 特征描述层
    feature_desc: Dict[str, str]

    # 状态摘要层
    state_summary: Dict[str, str]

    # 事件时间线
    event_timeline: List[MarketEvent]

    def to_markdown(self) -> str:
        """转换为Markdown格式的完整表示"""
        sections = []

        # 原始数据概览
        sections.append("## 📊 原始数据概览")
        sections.append(f"价格区间: {self.raw_data.get('price_range', 'N/A')}")
        sections.append(f"关键价格点: {self.raw_data.get('key_points_count', 0)}个")
        sections.append(f"数据时间跨度: {self.raw_data.get('time_span', 'N/A')}")
        sections.append("")

        # 特征描述
        sections.append("## 🔍 市场特征描述")
        for key, desc in self.feature_desc.items():
            sections.append(f"**{key}**: {desc}")
        sections.append("")

        # 状态摘要
        sections.append("## 🎯 市场状态摘要")
        for key, summary in self.state_summary.items():
            sections.append(f"**{key}**: {summary}")
        sections.append("")

        # 事件时间线
        if self.event_timeline:
            sections.append("## ⏰ 关键事件时间线")
            for event in self.event_timeline[-10:]:  # 最近10个事件
                sections.append(event.to_timeline_str())

        return "\n".join(sections)


class EventDetector:
    """市场事件检测引擎"""

    def __init__(self, config: Optional[Dict[str, Any]] = None):
        self.config = config or {
            'price_event_threshold': 0.8,      # 价格事件显著性阈值（分位数）
            'volume_event_ratio': 1.5,         # 成交量事件倍数
            'technical_event_zscore': 2.0,     # 技术事件z-score阈值
            'lookback_periods': 50,            # 回溯周期数
        }

    def detect_price_events(self, df: pd.DataFrame) -> List[MarketEvent]:
        """检测价格事件（突破、回踩、新高新低等）"""
        events = []

        if len(df) < 20:
            return events

        try:
            closes = df['close'].values.astype(float)
            highs = df['high'].values.astype(float)
            lows = df['low'].values.astype(float)
            timestamps = pd.to_datetime(df['timestamp'])

            lookback = min(self.config['lookback_periods'], len(df) - 1)

            # 检测最后一个bar的事件
            last_idx = len(df) - 1
            current_price = closes[last_idx]
            current_time = timestamps.iloc[last_idx]

            # 1. 突破新高
            recent_high = highs[max(0, last_idx - lookback):last_idx].max()
            if current_price > recent_high:
                significance = self._calculate_price_significance(
                    current_price, closes[max(0, last_idx - lookback):last_idx]
                )
                events.append(MarketEvent(
                    timestamp=current_time,
                    event_type='突破新高',
                    description=f'价格突破{lookback}周期高点 ({recent_high:.2f})',
                    significance=significance,
                    price_level=recent_high
                ))

            # 2. 跌破新低
            recent_low = lows[max(0, last_idx - lookback):last_idx].min()
            if current_price < recent_low:
                significance = self._calculate_price_significance(
                    current_price, closes[max(0, last_idx - lookback):last_idx]
                )
                events.append(MarketEvent(
                    timestamp=current_time,
                    event_type='跌破新低',
                    description=f'价格跌破{lookback}周期低点 ({recent_low:.2f})',
                    significance=significance,
                    price_level=recent_low
                ))

            # 3. 检测关键支撑/阻力测试
            support_resistance = self._identify_key_levels(df, lookback)
            for level_type, level_price in support_resistance:
                distance = abs(current_price - level_price) / current_price
                if distance < 0.005:  # 0.5%以内视为测试该水平
                    events.append(MarketEvent(
                        timestamp=current_time,
                        event_type=f'测试{level_type}',
                        description=f'价格测试{level_type}位 {level_price:.2f}',
                        significance=0.7,
                        price_level=level_price
                    ))

        except Exception as e:
            logger.warning(f"价格事件检测失败: {e}")

        return events

    def detect_volume_events(self, df: pd.DataFrame) -> List[MarketEvent]:
        """检测成交量事件（放量、缩量）"""
        events = []

        if len(df) < 20:
            return events

        try:
            volumes = df['volume'].values.astype(float)
            timestamps = pd.to_datetime(df['timestamp'])

            lookback = min(self.config['lookback_periods'], len(df) - 1)
            last_idx = len(df) - 1

            current_volume = volumes[last_idx]
            current_time = timestamps.iloc[last_idx]

            # 计算平均成交量
            avg_volume = volumes[max(0, last_idx - lookback):last_idx].mean()

            if avg_volume > 0:
                volume_ratio = current_volume / avg_volume

                # 放量
                if volume_ratio > self.config['volume_event_ratio']:
                    significance = min(1.0, (volume_ratio - 1.0) / 2.0)
                    events.append(MarketEvent(
                        timestamp=current_time,
                        event_type='放量',
                        description=f'成交量放大至{lookback}日均值的{volume_ratio:.1f}倍',
                        significance=significance,
                        volume_ratio=volume_ratio
                    ))

                # 缩量
                elif volume_ratio < (1.0 / self.config['volume_event_ratio']):
                    significance = min(1.0, (1.0 - volume_ratio))
                    events.append(MarketEvent(
                        timestamp=current_time,
                        event_type='缩量',
                        description=f'成交量缩小至{lookback}日均值的{volume_ratio:.1f}倍',
                        significance=significance,
                        volume_ratio=volume_ratio
                    ))

        except Exception as e:
            logger.warning(f"成交量事件检测失败: {e}")

        return events

    def detect_technical_events(self, df: pd.DataFrame) -> List[MarketEvent]:
        """检测技术指标事件（背离、极值等）"""
        events = []

        if len(df) < 30:
            return events

        try:
            closes = df['close'].values.astype(float)
            timestamps = pd.to_datetime(df['timestamp'])
            last_idx = len(df) - 1
            current_time = timestamps.iloc[last_idx]

            # 1. RSI极值检测
            if 'rsi' in df.columns:
                rsi = df['rsi'].values.astype(float)
                current_rsi = rsi[last_idx]

                if not np.isnan(current_rsi):
                    if current_rsi > 70:
                        events.append(MarketEvent(
                            timestamp=current_time,
                            event_type='RSI超买',
                            description=f'RSI进入超买区域 ({current_rsi:.1f})',
                            significance=min(1.0, (current_rsi - 70) / 30)
                        ))
                    elif current_rsi < 30:
                        events.append(MarketEvent(
                            timestamp=current_time,
                            event_type='RSI超卖',
                            description=f'RSI进入超卖区域 ({current_rsi:.1f})',
                            significance=min(1.0, (30 - current_rsi) / 30)
                        ))

            # 2. MACD背离检测（简化版）
            if 'macd' in df.columns and 'macd_bar' in df.columns:
                macd_bar = df['macd_bar'].values.astype(float)
                if len(macd_bar) >= 10:
                    # 检测MACD柱状图零轴穿越
                    prev_bar = macd_bar[last_idx - 1] if last_idx > 0 else 0
                    curr_bar = macd_bar[last_idx]

                    if prev_bar <= 0 < curr_bar:
                        events.append(MarketEvent(
                            timestamp=current_time,
                            event_type='MACD金叉',
                            description='MACD柱状图上穿零轴',
                            significance=0.7
                        ))
                    elif prev_bar >= 0 > curr_bar:
                        events.append(MarketEvent(
                            timestamp=current_time,
                            event_type='MACD死叉',
                            description='MACD柱状图下穿零轴',
                            significance=0.7
                        ))

            # 3. 波动率异常检测
            if 'atr' in df.columns:
                atr = df['atr'].values.astype(float)
                lookback = min(50, len(atr) - 1)
                current_atr = atr[last_idx]

                if not np.isnan(current_atr) and lookback > 0:
                    avg_atr = atr[max(0, last_idx - lookback):last_idx].mean()

                    if avg_atr > 0:
                        atr_ratio = current_atr / avg_atr

                        if atr_ratio > 1.5:
                            events.append(MarketEvent(
                                timestamp=current_time,
                                event_type='波动率扩张',
                                description=f'ATR扩张至均值的{atr_ratio:.1f}倍',
                                significance=min(1.0, (atr_ratio - 1.0) / 2.0)
                            ))

        except Exception as e:
            logger.warning(f"技术事件检测失败: {e}")

        return events

    def _calculate_price_significance(self, current_price: float, historical_prices: np.ndarray) -> float:
        """计算价格事件的显著性（基于历史分位数）"""
        try:
            # 计算当前价格在历史分布中的分位数
            percentile = (historical_prices < current_price).sum() / len(historical_prices)

            # 越接近极值（0或1）显著性越高
            significance = min(abs(percentile - 0.5) * 2, 1.0)
            return significance
        except Exception:
            return 0.5

    def _identify_key_levels(self, df: pd.DataFrame, lookback: int) -> List[Tuple[str, float]]:
        """识别关键支撑阻力位"""
        levels = []

        try:
            if len(df) < lookback:
                return levels

            recent_df = df.iloc[-lookback:]

            # 识别近期高点作为阻力
            resistance = recent_df['high'].max()
            levels.append(('阻力', float(resistance)))

            # 识别近期低点作为支撑
            support = recent_df['low'].min()
            levels.append(('支撑', float(support)))

        except Exception:
            pass

        return levels


class MarketRepresentationGenerator:
    """市场表示生成器 - 核心类，整合三级数据表示"""

    def __init__(self, event_detector: Optional[EventDetector] = None):
        self.event_detector = event_detector or EventDetector()

    def generate(self, row: pd.Series, df: pd.DataFrame, symbol: str) -> MarketRepresentation:
        """生成完整的三级市场表示"""

        # 1. 原始数据层
        raw_data = self._generate_raw_data_layer(row, df)

        # 2. 特征描述层
        feature_desc = self._generate_feature_description_layer(row, df)

        # 3. 状态摘要层
        state_summary = self._generate_state_summary_layer(row, df)

        # 4. 事件时间线
        event_timeline = self._generate_event_timeline(df)

        return MarketRepresentation(
            raw_data=raw_data,
            feature_desc=feature_desc,
            state_summary=state_summary,
            event_timeline=event_timeline
        )

    def _generate_raw_data_layer(self, row: pd.Series, df: pd.DataFrame) -> Dict[str, Any]:
        """生成原始数据层 - 压缩的价格序列"""
        try:
            # 获取最近的数据窗口
            window_size = min(100, len(df))
            window = df.iloc[-window_size:]

            # 价格统计
            price_min = float(window['low'].min())
            price_max = float(window['high'].max())
            current_price = float(row['close'])

            # 分段聚合近似 - 保留50个关键点
            key_points = self._compress_price_series(window, n_points=50)

            return {
                'price_range': f'{price_min:.2f} - {price_max:.2f}',
                'current_price': current_price,
                'key_points_count': len(key_points),
                'time_span': f'{window_size}个周期',
                'key_points': key_points  # 保留详细数据供后续分析
            }
        except Exception as e:
            logger.warning(f"原始数据层生成失败: {e}")
            return {}

    def _generate_feature_description_layer(self, row: pd.Series, df: pd.DataFrame) -> Dict[str, str]:
        """生成特征描述层 - 自然语言描述"""
        descriptions = {}

        try:
            # 价格行为描述
            descriptions['price_action'] = self._describe_price_action(row, df)

            # 成交量描述
            descriptions['volume_profile'] = self._describe_volume(row, df)

            # 动量描述
            descriptions['momentum'] = self._describe_momentum(row, df)

            # 关键水平描述
            descriptions['key_levels'] = self._describe_key_levels(row, df)

        except Exception as e:
            logger.warning(f"特征描述层生成失败: {e}")

        return descriptions

    def _generate_state_summary_layer(self, row: pd.Series, df: pd.DataFrame) -> Dict[str, str]:
        """生成状态摘要层 - 抽象市场状态"""
        summary = {}

        try:
            # 市场状态（趋势/震荡/突破/反转）
            summary['market_regime'] = self._classify_market_regime(row, df)

            # 波动率状态（收缩/扩张/极端）
            summary['volatility_state'] = self._classify_volatility_state(row, df)

            # 机会类型（趋势跟随/均值回归/突破/无明显机会）
            summary['opportunity_type'] = self._classify_opportunity_type(row, df)

            # 时间紧迫性（立即/短期/观望）
            summary['urgency'] = self._assess_urgency(row, df)

        except Exception as e:
            logger.warning(f"状态摘要层生成失败: {e}")

        return summary

    def _generate_event_timeline(self, df: pd.DataFrame) -> List[MarketEvent]:
        """生成事件时间线"""
        all_events = []

        # 检测各类事件
        all_events.extend(self.event_detector.detect_price_events(df))
        all_events.extend(self.event_detector.detect_volume_events(df))
        all_events.extend(self.event_detector.detect_technical_events(df))

        # 按时间和显著性排序
        all_events.sort(key=lambda e: (e.timestamp, -e.significance))

        # 筛选显著事件（significance > 0.5）
        significant_events = [e for e in all_events if e.significance > 0.5]

        return significant_events

    # ========== 辅助方法 ==========

    def _compress_price_series(self, df: pd.DataFrame, n_points: int) -> List[Dict[str, Any]]:
        """使用分段聚合近似压缩价格序列"""
        try:
            if len(df) <= n_points:
                # 数据量少，直接返回
                return [{
                    'time': pd.to_datetime(row['timestamp']).strftime('%H:%M'),
                    'price': float(row['close'])
                } for _, row in df.iterrows()]

            # 分段聚合
            segment_size = len(df) // n_points
            key_points = []

            for i in range(n_points):
                start_idx = i * segment_size
                end_idx = start_idx + segment_size if i < n_points - 1 else len(df)
                segment = df.iloc[start_idx:end_idx]

                # 每段取最后一个点
                last_row = segment.iloc[-1]
                key_points.append({
                    'time': pd.to_datetime(last_row['timestamp']).strftime('%H:%M'),
                    'price': float(last_row['close'])
                })

            return key_points
        except Exception:
            return []

    def _describe_price_action(self, row: pd.Series, df: pd.DataFrame) -> str:
        """描述价格行为"""
        try:
            current_price = float(row['close'])

            # 获取最近20个周期
            window = df.iloc[-20:] if len(df) >= 20 else df

            high_20 = float(window['high'].max())
            low_20 = float(window['low'].min())

            # 相对位置
            if current_price >= high_20 * 0.98:
                position = "接近20周期高点"
            elif current_price <= low_20 * 1.02:
                position = "接近20周期低点"
            else:
                position = "处于20周期中部区域"

            # 趋势方向
            if len(window) >= 10:
                recent_5 = window.iloc[-5:]['close'].mean()
                previous_5 = window.iloc[-10:-5]['close'].mean() if len(window) >= 10 else recent_5

                if recent_5 > previous_5 * 1.01:
                    trend = "呈上升趋势"
                elif recent_5 < previous_5 * 0.99:
                    trend = "呈下降趋势"
                else:
                    trend = "横盘整理"
            else:
                trend = "趋势不明显"

            return f"{position}, {trend}"

        except Exception:
            return "价格行为分析失败"

    def _describe_volume(self, row: pd.Series, df: pd.DataFrame) -> str:
        """描述成交量"""
        try:
            current_volume = float(row.get('volume', 0))

            window = df.iloc[-20:] if len(df) >= 20 else df
            avg_volume = float(window['volume'].mean())

            if avg_volume > 0:
                ratio = current_volume / avg_volume

                if ratio > 1.5:
                    return f"成交量放大至20周期均值的{ratio:.1f}倍"
                elif ratio < 0.7:
                    return f"成交量缩小至20周期均值的{ratio:.1f}倍"
                else:
                    return "成交量处于正常水平"
            else:
                return "成交量数据不足"

        except Exception:
            return "成交量分析失败"

    def _describe_momentum(self, row: pd.Series, df: pd.DataFrame) -> str:
        """描述动量"""
        try:
            # 使用RSI和MACD
            parts = []

            # 优先从row获取指标（当前bar），fallback到df.iloc[-1]（历史数据）
            # 检查RSI
            rsi = None
            if 'rsi' in row.index and not pd.isna(row['rsi']):
                rsi = float(row['rsi'])
            elif 'rsi' in df.columns and len(df) > 0 and not pd.isna(df.iloc[-1]['rsi']):
                rsi = float(df.iloc[-1]['rsi'])

            if rsi is not None:
                if rsi > 70:
                    parts.append(f"RSI超买({rsi:.1f})")
                elif rsi < 30:
                    parts.append(f"RSI超卖({rsi:.1f})")
                else:
                    parts.append(f"RSI中性({rsi:.1f})")

            # 检查MACD
            macd_bar = None
            if 'macd_bar' in row.index and not pd.isna(row['macd_bar']):
                macd_bar = float(row['macd_bar'])
            elif 'macd_bar' in df.columns and len(df) > 0 and not pd.isna(df.iloc[-1]['macd_bar']):
                macd_bar = float(df.iloc[-1]['macd_bar'])

            if macd_bar is not None:
                if macd_bar > 0:
                    parts.append("MACD多头")
                else:
                    parts.append("MACD空头")

            return ", ".join(parts) if parts else "动量指标不足"

        except Exception as e:
            logger.debug(f"动量分析异常: {e}")
            return "动量分析失败"

    def _describe_key_levels(self, row: pd.Series, df: pd.DataFrame) -> str:
        """描述关键水平"""
        try:
            window = df.iloc[-50:] if len(df) >= 50 else df

            resistance = float(window['high'].max())
            support = float(window['low'].min())
            current_price = float(row['close'])

            dist_resistance = ((resistance - current_price) / current_price) * 100
            dist_support = ((current_price - support) / current_price) * 100

            return f"上方阻力{resistance:.2f}(+{dist_resistance:.1f}%), 下方支撑{support:.2f}(-{dist_support:.1f}%)"

        except Exception:
            return "关键水平分析失败"

    def _classify_market_regime(self, row: pd.Series, df: pd.DataFrame) -> str:
        """分类市场状态"""
        try:
            if 'ma10' not in df.columns or 'ma30' not in df.columns:
                return "趋势不明"

            window = df.iloc[-30:] if len(df) >= 30 else df

            ma10 = float(window.iloc[-1]['ma10']) if not pd.isna(window.iloc[-1]['ma10']) else 0
            ma30 = float(window.iloc[-1]['ma30']) if not pd.isna(window.iloc[-1]['ma30']) else 0

            if ma10 > 0 and ma30 > 0:
                spread = (ma10 - ma30) / ma30

                if spread > 0.02:
                    return "强势上涨趋势"
                elif spread > 0.005:
                    return "温和上涨趋势"
                elif spread < -0.02:
                    return "强势下跌趋势"
                elif spread < -0.005:
                    return "温和下跌趋势"
                else:
                    return "横盘震荡"

            return "趋势不明"

        except Exception:
            return "市场状态分析失败"

    def _classify_volatility_state(self, row: pd.Series, df: pd.DataFrame) -> str:
        """分类波动率状态"""
        try:
            if 'atr' not in df.columns:
                return "波动率未知"

            window = df.iloc[-50:] if len(df) >= 50 else df
            current_atr = float(window.iloc[-1]['atr']) if not pd.isna(window.iloc[-1]['atr']) else 0
            avg_atr = float(window['atr'].mean())

            if avg_atr > 0:
                ratio = current_atr / avg_atr

                if ratio > 1.5:
                    return "波动率扩张（高波动）"
                elif ratio < 0.7:
                    return "波动率收缩（低波动）"
                else:
                    return "波动率正常"

            return "波动率未知"

        except Exception:
            return "波动率分析失败"

    def _classify_opportunity_type(self, row: pd.Series, df: pd.DataFrame) -> str:
        """分类机会类型"""
        try:
            regime = self._classify_market_regime(row, df)

            if "上涨趋势" in regime:
                return "趋势跟随做多机会"
            elif "下跌趋势" in regime:
                return "趋势跟随做空机会"
            elif "震荡" in regime:
                return "均值回归机会"
            else:
                return "观望为主"

        except Exception:
            return "机会分析失败"

    def _assess_urgency(self, row: pd.Series, df: pd.DataFrame) -> str:
        """评估时间紧迫性"""
        try:
            # 基于最近的事件和价格位置
            window = df.iloc[-10:] if len(df) >= 10 else df

            # 检查价格是否接近关键水平
            current_price = float(row['close'])
            recent_high = float(window['high'].max())
            recent_low = float(window['low'].min())

            dist_high = abs(current_price - recent_high) / current_price
            dist_low = abs(current_price - recent_low) / current_price

            if dist_high < 0.01 or dist_low < 0.01:
                return "立即（接近关键水平）"
            elif dist_high < 0.02 or dist_low < 0.02:
                return "短期（接近关键区域）"
            else:
                return "观望（无明显紧迫性）"

        except Exception:
            return "紧迫性评估失败"
