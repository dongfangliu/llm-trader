"""
市场态势计算服务（实时、无数据库依赖、WebSocket推送）

核心特性：
1. 自适应多级触发：定时 + 事件触发
2. 纯量化计算（无LLM，<100ms）
3. 内存缓冲K线数据
4. 状态切换防抖
5. WebSocket实时推送
"""

import time
import asyncio
from collections import deque
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from loguru import logger
import numpy as np


class MarketRegimeService:
    """市场态势计算服务（单例）"""

    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return

        # 配置参数（可通过API动态修改）
        self.config = {
            'periodic_interval': 900,  # 15分钟（秒）
            'triggers': {
                'price_change_threshold': 0.005,  # 0.5%
                'volume_spike_threshold': 2.0,  # 2倍
                'adx_change_threshold': 5.0,  # 5点
            },
            'lookback_periods': {
                'adx_period': 14,
                'atr_period': 14,
                'ma_periods': [5, 20, 60],
            },
            'regime_switch_cooldown': 300,  # 5分钟（秒）
        }

        # 运行时状态
        self.current_regime: Optional[Dict] = None
        self.last_calculate_time: Optional[float] = None
        self.last_switch_time: Optional[float] = None
        self.kline_buffer: deque = deque(maxlen=500)  # 保留500根K线
        self.last_tick_data: Optional[Dict] = None
        self.websocket_manager = None  # 稍后注入

        # 计算用的历史数据
        self.price_history: deque = deque(maxlen=100)
        self.volume_history: deque = deque(maxlen=100)
        self.adx_history: deque = deque(maxlen=50)
        
        # 状态切换历史（保留最近24小时的记录）
        self.regime_history: deque = deque(maxlen=100)  # 最多保留100条切换记录

        self._initialized = True
        logger.info("✅ MarketRegimeService 初始化完成")

    def set_websocket_manager(self, manager):
        """注入WebSocket管理器"""
        self.websocket_manager = manager
        logger.info("✅ WebSocket管理器已注入到MarketRegimeService")

    def update_config(self, new_config: Dict) -> Dict:
        """
        更新配置参数（前端可调用）

        Args:
            new_config: 新配置（支持部分更新）

        Returns:
            更新后的完整配置
        """
        # 递归合并配置
        def merge_dict(base, update):
            for key, value in update.items():
                if isinstance(value, dict) and key in base:
                    merge_dict(base[key], value)
                else:
                    base[key] = value

        merge_dict(self.config, new_config)
        logger.info(f"✅ 配置已更新: {new_config}")
        return self.config

    def get_config(self) -> Dict:
        """获取当前配置"""
        return self.config.copy()

    async def on_tick(self, tick_data: Dict):
        """
        每个tick触发，根据规则决定是否重算

        Args:
            tick_data: Tick数据 {price, volume, timestamp, ...}
        """
        try:
            # 更新缓冲区
            self._update_buffer(tick_data)

            # 检查是否需要重算
            should_calculate = (
                self._check_periodic_trigger()
                or self._check_event_trigger(tick_data)
            )

            if should_calculate:
                await self.calculate_and_broadcast(reason="auto_trigger")

        except Exception as e:
            logger.error(f"on_tick处理失败: {e}")

    async def calculate_now(self, force: bool = False, reason: str = "manual") -> Dict:
        """
        立即计算（手动触发）

        Args:
            force: 是否强制计算（忽略冷却期）
            reason: 触发原因

        Returns:
            市场态势数据
        """
        if force or self._can_switch():
            return await self.calculate_and_broadcast(reason=reason)
        else:
            logger.warning(f"处于冷却期，跳过计算（剩余{self._cooldown_remaining()}秒）")
            return self.current_regime or self._get_default_regime()

    async def calculate_and_broadcast(self, reason: str = "unknown") -> Dict:
        """
        执行计算并通过WebSocket推送

        Args:
            reason: 触发原因

        Returns:
            市场态势数据
        """
        try:
            start_time = time.time()

            # 纯量化计算（无LLM，无数据库）
            new_regime = self._calculate_regime()
            new_regime['trigger_reason'] = reason

            elapsed = (time.time() - start_time) * 1000
            logger.info(f"⚡ 市场态势计算完成，耗时 {elapsed:.1f}ms")

            # 状态改变才推送（减少无效推送）
            regime_changed = (
                self.current_regime is None
                or new_regime['regime'] != self.current_regime.get('regime')
            )

            if regime_changed:
                logger.info(
                    f"🔄 市场状态切换: {self.current_regime.get('regime') if self.current_regime else 'None'} → {new_regime['regime']} "
                    f"(置信度: {new_regime['confidence']:.1%})"
                )
                self.last_switch_time = time.time()
                
                # 记录到历史
                self._add_to_history(new_regime)

                # WebSocket推送
                if self.websocket_manager:
                    await self.websocket_manager.broadcast({
                        "type": "market_regime",
                        "data": new_regime
                    })
                    logger.debug("📡 市场态势已通过WebSocket推送")
            else:
                logger.debug("市场状态未变化，跳过推送")

            self.current_regime = new_regime
            self.last_calculate_time = time.time()

            return new_regime

        except Exception as e:
            logger.error(f"计算市场态势失败: {e}")
            import traceback
            logger.debug(traceback.format_exc())
            return self._get_default_regime()

    def _update_buffer(self, tick_data: Dict):
        """更新K线缓冲区"""
        self.last_tick_data = tick_data

        # 记录价格和成交量历史
        price = tick_data.get('last_price', 0)
        volume = tick_data.get('volume', 0)

        if price > 0:
            self.price_history.append(price)

        if volume > 0:
            self.volume_history.append(volume)

        # TODO: 如果需要精确的K线聚合，可以在这里实现
        # 目前简化处理，依赖外部提供的K线数据

    def _check_periodic_trigger(self) -> bool:
        """检查定时触发"""
        if not self.last_calculate_time:
            return True

        elapsed = time.time() - self.last_calculate_time
        interval = self.config['periodic_interval']

        if elapsed >= interval:
            logger.info(f"⏰ 定时触发：已过{elapsed:.0f}秒（阈值{interval}秒）")
            return True

        return False

    def _check_event_trigger(self, tick_data: Dict) -> bool:
        """检查事件触发"""
        triggers = self.config['triggers']

        # 1. 价格变动超阈值
        if self._price_change_exceeded(tick_data, triggers['price_change_threshold']):
            logger.info("📈 价格变动触发重算")
            return True

        # 2. 成交量突增
        if self._volume_spike_detected(tick_data, triggers['volume_spike_threshold']):
            logger.info("📊 成交量突增触发重算")
            return True

        # 3. ADX变化（如果有最近的ADX数据）
        if self._adx_change_exceeded(triggers['adx_change_threshold']):
            logger.info("📉 ADX变化触发重算")
            return True

        return False

    def _price_change_exceeded(self, tick_data: Dict, threshold: float) -> bool:
        """检查价格变动是否超过阈值"""
        if len(self.price_history) < 2:
            return False

        current_price = tick_data.get('last_price', 0)
        if current_price == 0:
            return False

        # 与最近一次计算时的价格比较
        if self.last_calculate_time and len(self.price_history) > 10:
            reference_price = list(self.price_history)[-10]  # 10个tick前的价格
            change = abs(current_price - reference_price) / reference_price
            return change >= threshold

        return False

    def _volume_spike_detected(self, tick_data: Dict, threshold: float) -> bool:
        """检查成交量是否突增"""
        if len(self.volume_history) < 10:
            return False

        current_volume = tick_data.get('volume', 0)
        if current_volume == 0:
            return False

        # 计算平均成交量
        avg_volume = np.mean(list(self.volume_history)[-10:])
        if avg_volume == 0:
            return False

        ratio = current_volume / avg_volume
        return ratio >= threshold

    def _adx_change_exceeded(self, threshold: float) -> bool:
        """检查ADX变化是否超过阈值"""
        if len(self.adx_history) < 2:
            return False

        current_adx = self.adx_history[-1]
        previous_adx = self.adx_history[-2]
        change = abs(current_adx - previous_adx)

        return change >= threshold

    def _can_switch(self) -> bool:
        """防抖：检查是否可以切换状态"""
        if not self.last_switch_time:
            return True

        cooldown = self.config['regime_switch_cooldown']
        elapsed = time.time() - self.last_switch_time
        return elapsed >= cooldown

    def _cooldown_remaining(self) -> int:
        """返回剩余冷却时间（秒）"""
        if not self.last_switch_time:
            return 0

        cooldown = self.config['regime_switch_cooldown']
        elapsed = time.time() - self.last_switch_time
        remaining = max(0, cooldown - elapsed)
        return int(remaining)

    def _calculate_regime(self) -> Dict:
        """
        核心计算逻辑（纯量化，无LLM）

        Returns:
            市场态势数据
        """
        # 如果没有足够的数据，返回默认状态
        if len(self.price_history) < 20:
            logger.warning("数据不足，返回默认状态")
            return self._get_default_regime()

        # 简化版：基于价格序列计算技术指标
        prices = np.array(list(self.price_history))

        # 1. 计算ATR（简化版）
        atr = self._calculate_simple_atr(prices)
        atr_pct = (atr / prices[-1]) * 100 if prices[-1] > 0 else 0

        # 2. 计算ADX（简化版）
        adx = self._calculate_simple_adx(prices)
        self.adx_history.append(adx)

        # 3. 计算布林带宽度
        bb_width = self._calculate_bollinger_width(prices)

        # 4. 计算趋势一致性
        trend_alignment = self._calculate_trend_alignment(prices)

        # 5. 计算波动率
        volatility = np.std(prices[-20:]) / np.mean(prices[-20:]) if len(prices) >= 20 else 0

        # 规则判断（确定性逻辑）
        regime, confidence = self._determine_regime(
            adx, atr_pct, bb_width, trend_alignment, volatility
        )
        
        # 记录关键指标（便于调试）
        logger.debug(
            f"市场指标: ADX={adx:.1f}, ATR%={atr_pct:.2f}, "
            f"BB宽度={bb_width:.4f}, 趋势一致性={trend_alignment:.2f}, "
            f"波动率={volatility:.4f}"
        )
        logger.debug(f"判定结果: {regime} (置信度={confidence:.1%})")

        # 计算持续时间
        # 如果状态相同，保留原有的start_time；否则创建新的start_time
        if self.current_regime and self.current_regime.get('regime') == regime:
            start_time = self.current_regime.get('start_time', time.time())
            duration_sec = time.time() - start_time
        else:
            start_time = time.time()
            duration_sec = 0

        result = {
            "regime": regime,
            "confidence": confidence,
            "features": {
                "adx": round(adx, 2),
                "atr": round(atr, 2),
                "volatility": round(volatility, 4),
                "bollinger_width": round(bb_width, 4),
                "trend_alignment": round(trend_alignment, 2),
            },
            "active_strategy": self._map_strategy(regime),
            "duration_minutes": int(duration_sec / 60),
            "timestamp": datetime.now().isoformat(),
            "start_time": start_time,
        }

        return result

    def _calculate_simple_atr(self, prices: np.ndarray, period: int = 14) -> float:
        """简化版ATR计算"""
        if len(prices) < period + 1:
            return 0.0

        # 使用价格变化作为真实波幅的近似
        true_ranges = np.abs(np.diff(prices[-period - 1:]))
        atr = np.mean(true_ranges)
        return float(atr)

    def _calculate_simple_adx(self, prices: np.ndarray, period: int = 14) -> float:
        """简化版ADX计算"""
        if len(prices) < period + 1:
            return 20.0  # 返回中性值

        # 计算方向运动
        price_changes = np.diff(prices[-period - 1:])

        # 上涨和下跌的平均幅度
        up_moves = np.maximum(price_changes, 0)
        down_moves = np.abs(np.minimum(price_changes, 0))

        avg_up = np.mean(up_moves)
        avg_down = np.mean(down_moves)

        # 简化的ADX：基于方向运动的比例
        if avg_up + avg_down == 0:
            return 20.0

        directional_ratio = abs(avg_up - avg_down) / (avg_up + avg_down)
        adx = directional_ratio * 50  # 归一化到0-50范围

        return float(adx)

    def _calculate_bollinger_width(self, prices: np.ndarray, period: int = 20) -> float:
        """计算布林带宽度"""
        if len(prices) < period:
            return 0.03  # 返回默认值

        recent_prices = prices[-period:]
        ma = np.mean(recent_prices)
        std = np.std(recent_prices)

        if ma == 0:
            return 0.03

        width = (2 * std) / ma  # 布林带宽度（标准化）
        return float(width)

    def _calculate_trend_alignment(self, prices: np.ndarray) -> float:
        """计算多周期趋势一致性"""
        if len(prices) < 60:
            return 0.5  # 中性

        # 计算多个周期的均线
        ma5 = np.mean(prices[-5:])
        ma20 = np.mean(prices[-20:])
        ma60 = np.mean(prices[-60:]) if len(prices) >= 60 else ma20

        current_price = prices[-1]

        # 检查趋势一致性
        if current_price > ma5 > ma20 > ma60:
            return 0.9  # 强上升趋势
        elif current_price < ma5 < ma20 < ma60:
            return 0.9  # 强下降趋势
        elif current_price > ma5 > ma20:
            return 0.7  # 中等上升趋势
        elif current_price < ma5 < ma20:
            return 0.7  # 中等下降趋势
        else:
            return 0.5  # 无明显趋势

    def _determine_regime(
        self,
        adx: float,
        atr_pct: float,
        bb_width: float,
        trend_alignment: float,
        volatility: float
    ) -> tuple:
        """
        根据指标判断市场状态

        Returns:
            (regime, confidence)
        """
        # 规则1: 异常市（优先级最高）
        if atr_pct > 5 or volatility > 0.05:
            # 异常程度越高，置信度越高
            # 波动率超标：0.05->0.90, 0.08->0.95, 0.10->0.98
            if volatility > 0.05:
                volatility_score = 0.90 + min((volatility - 0.05) / 0.1, 0.08)
            else:
                volatility_score = 0.0
            
            # ATR超标：5.0->0.90, 7.0->0.95, 10.0->0.98
            if atr_pct > 5:
                atr_score = 0.90 + min((atr_pct - 5) / 10, 0.08)
            else:
                atr_score = 0.0
            
            confidence = max(volatility_score, atr_score)
            return "abnormal", confidence

        # 规则2: 趋势市（放宽条件：ADX>=25 或 趋势一致性很高）
        if (adx >= 25 and trend_alignment >= 0.7) or (adx >= 20 and trend_alignment >= 0.8):
            # 综合ADX强度和趋势一致性计算置信度
            # ADX越高置信度越高：25->0.70, 30->0.80, 35->0.85, 40->0.90
            if adx >= 25:
                adx_score = 0.70 + min((adx - 25) / 50, 0.25)
            else:
                adx_score = 0.65  # ADX=20-25之间
            
            # 趋势一致性权重：0.7->0.70, 0.8->0.80, 0.9->0.90
            alignment_score = trend_alignment
            
            confidence = min((adx_score * 0.6 + alignment_score * 0.4), 0.95)
            return "trend", confidence

        # 规则3: 震荡市
        if adx < 20 and bb_width < 0.03:
            # 综合ADX低值和布林带窄度计算置信度
            # ADX越低置信度越高：20->0.65, 15->0.75, 10->0.85, 5->0.92
            adx_score = 0.65 + (20 - adx) / 20 * 0.27
            # 布林带越窄置信度越高：0.030->0.65, 0.020->0.78, 0.015->0.85
            bb_score = 0.65 + (0.03 - bb_width) / 0.03 * 0.25
            confidence = min((adx_score * 0.6 + bb_score * 0.4), 0.92)
            return "ranging", confidence

        # 规则4: 突破市（波动率适中 + ADX在中等区间）
        if 20 <= adx <= 30 and atr_pct > 2:
            # 基于ATR和ADX位置计算置信度
            # atr_pct: 2.0->0.65, 3.0->0.75, 4.0->0.82
            atr_score = 0.60 + min((atr_pct - 2) / 5, 0.25)
            # ADX在20-30区间，越接近25置信度越高
            adx_score = 0.70 + (1.0 - abs(adx - 25) / 10) * 0.15
            confidence = min((atr_score * 0.7 + adx_score * 0.3), 0.88)
            return "breakout", confidence

        # 默认：震荡市（低置信度）
        # 当各项指标都不明确时，给出较低置信度
        return "ranging", 0.40

    def _map_strategy(self, regime: str) -> str:
        """映射市场状态到推荐策略"""
        strategy_map = {
            "trend": "trend_following",
            "ranging": "mean_reversion",
            "breakout": "breakout",
            "abnormal": "conservative"
        }
        return strategy_map.get(regime, "unknown")

    def _get_default_regime(self) -> Dict:
        """返回默认状态"""
        return {
            "regime": "unknown",
            "confidence": 0.0,
            "features": {
                "adx": 0.0,
                "atr": 0.0,
                "volatility": 0.0,
                "bollinger_width": 0.0,
                "trend_alignment": 0.0,
            },
            "active_strategy": "none",
            "duration_minutes": 0,
            "timestamp": datetime.now().isoformat(),
            "start_time": time.time(),
        }

    def feed_kline_data(self, klines: List[Dict]):
        """
        外部提供K线数据（用于启动时快速初始化）

        Args:
            klines: K线列表 [{open, high, low, close, volume, timestamp}, ...]
        """
        for kline in klines:
            close = kline.get('close', 0)
            if close > 0:
                self.price_history.append(close)
                self.volume_history.append(kline.get('volume', 0))

        logger.info(f"✅ 已加载 {len(klines)} 根K线数据到缓冲区")
    
    def _add_to_history(self, regime_data: Dict):
        """添加状态切换记录到历史"""
        history_item = {
            "regime": regime_data["regime"],
            "confidence": regime_data["confidence"],
            "timestamp": regime_data["timestamp"],
            "switch_reason": regime_data.get("trigger_reason", "unknown"),
            "duration_minutes": 0  # 持续时间将在下次切换时计算
        }
        
        # 更新上一条记录的持续时间
        if len(self.regime_history) > 0:
            last_item = self.regime_history[-1]
            last_time = datetime.fromisoformat(last_item["timestamp"])
            current_time = datetime.fromisoformat(history_item["timestamp"])
            duration = (current_time - last_time).total_seconds() / 60
            last_item["duration_minutes"] = int(duration)
        
        self.regime_history.append(history_item)
        logger.debug(f"📝 已添加状态切换记录: {regime_data['regime']}")
    
    def get_history(self, hours: int = 24) -> List[Dict]:
        """
        获取状态切换历史
        
        Args:
            hours: 查询小时数
        
        Returns:
            历史记录列表
        """
        if not self.regime_history:
            return []
        
        # 过滤指定时间范围内的记录
        cutoff_time = datetime.now() - timedelta(hours=hours)
        
        filtered = []
        for item in self.regime_history:
            try:
                item_time = datetime.fromisoformat(item["timestamp"])
                if item_time >= cutoff_time:
                    filtered.append(item.copy())
            except:
                continue
        
        return filtered


# 全局单例
_regime_service_instance = None


def get_regime_service() -> MarketRegimeService:
    """获取市场态势服务单例"""
    global _regime_service_instance
    if _regime_service_instance is None:
        _regime_service_instance = MarketRegimeService()
    return _regime_service_instance
