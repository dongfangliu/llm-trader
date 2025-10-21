"""
Phase 2 策略回测验证
测试市场状态识别器和三个量化策略的表现

功能:
1. 使用模拟数据测试策略逻辑
2. 验证信号生成的正确性
3. 计算关键性能指标
"""

import sys
import os
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import Dict, List, Tuple
from loguru import logger

sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from src.strategy.market_regime import MarketRegimeDetector
from src.strategy.trend_following import TrendFollowingStrategy
from src.strategy.mean_reversion import MeanReversionStrategy
from src.strategy.breakout import BreakoutStrategy
from src.strategy.signal_router import SignalRouter


class StrategyBacktestValidator:
    """策略回测验证器"""
    
    def __init__(self):
        """初始化验证器"""
        self.market_regime = MarketRegimeDetector()
        self.trend_strategy = TrendFollowingStrategy()
        self.mean_reversion_strategy = MeanReversionStrategy()
        self.breakout_strategy = BreakoutStrategy()
        self.signal_router = SignalRouter()
        
        logger.info("策略回测验证器初始化完成")
    
    def generate_mock_market_data(self, scenario: str) -> Dict:
        """
        生成模拟市场数据
        
        Args:
            scenario: 市场场景 ('trend_up', 'trend_down', 'range', 'breakout', 'volatile')
        
        Returns:
            市场数据字典
        """
        base_price = 2000.0
        
        if scenario == 'trend_up':
            # 上升趋势
            return {
                'current_price': 2050.0,
                'ma_20': 2020.0,
                'ma_60': 2000.0,
                'ma_120': 1980.0,
                'ema_20': 2025.0,
                'macd': 15.0,
                'macd_signal': 10.0,
                'macd_hist': 5.0,
                'rsi': 65.0,
                'adx': 28.0,
                'atr': 20.0,
                'atr_percentile': 50.0,
                'bb_upper': 2080.0,
                'bb_middle': 2030.0,
                'bb_lower': 1980.0,
                'volume': 12000,
                'volume_ma': 10000,
                'active_buy_ratio': 0.65,
                'vpin': 0.35,
                'support_level': 2000.0,
                'resistance_level': 2100.0,
                'kline_1h': {'trend': 'uptrend'},
                'kline_4h': {'trend': 'uptrend'},
                'kline_1d': {'trend': 'uptrend'}
            }
        
        elif scenario == 'trend_down':
            # 下降趋势
            return {
                'current_price': 1950.0,
                'ma_20': 1980.0,
                'ma_60': 2000.0,
                'ma_120': 2020.0,
                'ema_20': 1970.0,
                'macd': -15.0,
                'macd_signal': -10.0,
                'macd_hist': -5.0,
                'rsi': 35.0,
                'adx': 26.0,
                'atr': 20.0,
                'atr_percentile': 50.0,
                'bb_upper': 2020.0,
                'bb_middle': 1970.0,
                'bb_lower': 1920.0,
                'volume': 13000,
                'volume_ma': 10000,
                'active_buy_ratio': 0.35,
                'vpin': 0.65,
                'support_level': 1900.0,
                'resistance_level': 2000.0,
                'kline_1h': {'trend': 'downtrend'},
                'kline_4h': {'trend': 'downtrend'},
                'kline_1d': {'trend': 'downtrend'}
            }
        
        elif scenario == 'range':
            # 震荡市
            return {
                'current_price': 1980.0,  # 接近下轨
                'ma_20': 2000.0,
                'ma_60': 2000.0,
                'ma_120': 2000.0,
                'ema_20': 2000.0,
                'macd': -2.0,
                'macd_signal': -1.0,
                'macd_hist': -1.0,
                'rsi': 32.0,  # 超卖
                'adx': 18.0,  # 低ADX
                'atr': 15.0,
                'atr_percentile': 30.0,
                'bb_upper': 2030.0,
                'bb_middle': 2000.0,
                'bb_lower': 1970.0,
                'volume': 9000,
                'volume_ma': 10000,
                'active_buy_ratio': 0.55,
                'vpin': 0.25,
                'support_level': 1970.0,
                'resistance_level': 2030.0,
                'kline_1h': {'trend': 'neutral'},
                'kline_4h': {'trend': 'neutral'},
                'kline_1d': {'trend': 'neutral'}
            }
        
        elif scenario == 'breakout':
            # 突破市
            return {
                'current_price': 2101.0,  # 刚突破阻力位
                'ma_20': 2080.0,
                'ma_60': 2060.0,
                'ma_120': 2040.0,
                'ema_20': 2090.0,
                'macd': 10.0,
                'macd_signal': 5.0,
                'macd_hist': 5.0,
                'rsi': 68.0,
                'adx': 22.0,
                'atr': 18.0,
                'atr_percentile': 45.0,
                'bb_upper': 2120.0,
                'bb_middle': 2080.0,
                'bb_lower': 2040.0,
                'volume': 18000,  # 成交量放大
                'volume_ma': 10000,
                'active_buy_ratio': 0.72,  # 强买压
                'vpin': 0.45,
                'support_level': 2080.0,
                'resistance_level': 2100.0,  # 突破的阻力位
                'kline_1h': {'trend': 'uptrend'},
                'kline_4h': {'trend': 'uptrend'},
                'kline_1d': {'trend': 'neutral'}
            }
        
        elif scenario == 'volatile':
            # 异常波动市
            return {
                'current_price': 2050.0,
                'ma_20': 2000.0,
                'ma_60': 2000.0,
                'ma_120': 2000.0,
                'ema_20': 2020.0,
                'macd': 5.0,
                'macd_signal': 3.0,
                'macd_hist': 2.0,
                'rsi': 55.0,
                'adx': 15.0,
                'atr': 35.0,  # ATR暴增
                'atr_percentile': 92.0,  # 高分位数
                'bb_upper': 2100.0,
                'bb_middle': 2000.0,
                'bb_lower': 1900.0,
                'volume': 25000,  # 成交量暴增
                'volume_ma': 10000,
                'active_buy_ratio': 0.50,
                'vpin': 0.75,  # 高毒性
                'support_level': 1950.0,
                'resistance_level': 2050.0,
                'kline_1h': {'trend': 'neutral'},
                'kline_4h': {'trend': 'neutral'},
                'kline_1d': {'trend': 'neutral'}
            }
        
        else:
            raise ValueError(f"未知的市场场景: {scenario}")
    
    def test_market_regime_detection(self) -> Dict[str, bool]:
        """
        测试市场状态识别器
        
        Returns:
            测试结果字典
        """
        logger.info("\n=== 测试1: 市场状态识别器 ===")
        results = {}
        
        # 场景1: 上升趋势
        data = self.generate_mock_market_data('trend_up')
        regime = self.market_regime.detect_regime(data)
        expected = 'trend'
        actual = regime['regime']
        results['trend_up'] = (actual == expected)
        logger.info(f"上升趋势识别: 预期={expected}, 实际={actual}, "
                   f"置信度={regime['confidence']:.2f}, "
                   f"结果={'✓' if results['trend_up'] else '✗'}")
        
        # 场景2: 震荡市
        data = self.generate_mock_market_data('range')
        regime = self.market_regime.detect_regime(data)
        expected = 'range'
        actual = regime['regime']
        results['range'] = (actual == expected)
        logger.info(f"震荡市识别: 预期={expected}, 实际={actual}, "
                   f"置信度={regime['confidence']:.2f}, "
                   f"结果={'✓' if results['range'] else '✗'}")
        
        # 场景3: 突破市
        data = self.generate_mock_market_data('breakout')
        regime = self.market_regime.detect_regime(data)
        expected = 'breakout'
        actual = regime['regime']
        results['breakout'] = (actual == expected)
        logger.info(f"突破市识别: 预期={expected}, 实际={actual}, "
                   f"置信度={regime['confidence']:.2f}, "
                   f"结果={'✓' if results['breakout'] else '✗'}")
        
        # 场景4: 异常市
        data = self.generate_mock_market_data('volatile')
        regime = self.market_regime.detect_regime(data)
        expected = 'abnormal'
        actual = regime['regime']
        results['volatile'] = (actual == expected)
        logger.info(f"异常市识别: 预期={expected}, 实际={actual}, "
                   f"置信度={regime['confidence']:.2f}, "
                   f"结果={'✓' if results['volatile'] else '✗'}")
        
        success_rate = sum(results.values()) / len(results) * 100
        logger.info(f"\n市场状态识别成功率: {success_rate:.1f}% ({sum(results.values())}/{len(results)})")
        
        return results
    
    def test_trend_following_strategy(self) -> Dict[str, bool]:
        """
        测试趋势跟踪策略
        
        Returns:
            测试结果字典
        """
        logger.info("\n=== 测试2: 趋势跟踪策略 ===")
        results = {}
        
        # 场景1: 上升趋势 + 回调买点
        data = self.generate_mock_market_data('trend_up')
        signal = self.trend_strategy.generate_signal(data)
        expected_action = 'open_long'
        actual_action = signal['action']
        results['trend_long'] = (actual_action == expected_action)
        logger.info(f"上升趋势做多: 预期={expected_action}, 实际={actual_action}, "
                   f"置信度={signal['confidence']:.2f}, "
                   f"结果={'✓' if results['trend_long'] else '✗'}")
        
        # 场景2: 下降趋势
        data = self.generate_mock_market_data('trend_down')
        signal = self.trend_strategy.generate_signal(data)
        expected_action = 'open_short'
        actual_action = signal['action']
        results['trend_short'] = (actual_action == expected_action)
        logger.info(f"下降趋势做空: 预期={expected_action}, 实际={actual_action}, "
                   f"置信度={signal['confidence']:.2f}, "
                   f"结果={'✓' if results['trend_short'] else '✗'}")
        
        # 场景3: 震荡市（应该hold）
        data = self.generate_mock_market_data('range')
        signal = self.trend_strategy.generate_signal(data)
        expected_action = 'hold'
        actual_action = signal['action']
        results['trend_range'] = (actual_action == expected_action)
        logger.info(f"震荡市观望: 预期={expected_action}, 实际={actual_action}, "
                   f"置信度={signal['confidence']:.2f}, "
                   f"结果={'✓' if results['trend_range'] else '✗'}")
        
        success_rate = sum(results.values()) / len(results) * 100
        logger.info(f"\n趋势策略测试成功率: {success_rate:.1f}% ({sum(results.values())}/{len(results)})")
        
        return results
    
    def test_mean_reversion_strategy(self) -> Dict[str, bool]:
        """
        测试均值回归策略
        
        Returns:
            测试结果字典
        """
        logger.info("\n=== 测试3: 均值回归策略 ===")
        results = {}
        
        # 场景1: 震荡市 + 超卖
        data = self.generate_mock_market_data('range')
        signal = self.mean_reversion_strategy.generate_signal(data)
        expected_action = 'open_long'
        actual_action = signal['action']
        results['mean_rev_long'] = (actual_action == expected_action)
        logger.info(f"超卖做多: 预期={expected_action}, 实际={actual_action}, "
                   f"置信度={signal['confidence']:.2f}, "
                   f"结果={'✓' if results['mean_rev_long'] else '✗'}")
        
        # 场景2: 趋势市（应该hold，不适合均值回归）
        data = self.generate_mock_market_data('trend_up')
        signal = self.mean_reversion_strategy.generate_signal(data)
        expected_action = 'hold'
        actual_action = signal['action']
        results['mean_rev_trend'] = (actual_action == expected_action)
        logger.info(f"趋势市观望: 预期={expected_action}, 实际={actual_action}, "
                   f"置信度={signal['confidence']:.2f}, "
                   f"结果={'✓' if results['mean_rev_trend'] else '✗'}")
        
        success_rate = sum(results.values()) / len(results) * 100
        logger.info(f"\n均值回归策略测试成功率: {success_rate:.1f}% ({sum(results.values())}/{len(results)})")
        
        return results
    
    def test_breakout_strategy(self) -> Dict[str, bool]:
        """
        测试突破策略
        
        Returns:
            测试结果字典
        """
        logger.info("\n=== 测试4: 突破策略 ===")
        results = {}
        
        # 场景1: 向上突破
        data = self.generate_mock_market_data('breakout')
        signal = self.breakout_strategy.generate_signal(data)
        expected_action = 'open_long'
        actual_action = signal['action']
        results['breakout_long'] = (actual_action == expected_action)
        logger.info(f"向上突破: 预期={expected_action}, 实际={actual_action}, "
                   f"置信度={signal['confidence']:.2f}, "
                   f"结果={'✓' if results['breakout_long'] else '✗'}")
        
        # 场景2: 震荡市（应该hold，未突破）
        data = self.generate_mock_market_data('range')
        signal = self.breakout_strategy.generate_signal(data)
        expected_action = 'hold'
        actual_action = signal['action']
        results['breakout_range'] = (actual_action == expected_action)
        logger.info(f"震荡市观望: 预期={expected_action}, 实际={actual_action}, "
                   f"置信度={signal['confidence']:.2f}, "
                   f"结果={'✓' if results['breakout_range'] else '✗'}")
        
        success_rate = sum(results.values()) / len(results) * 100
        logger.info(f"\n突破策略测试成功率: {success_rate:.1f}% ({sum(results.values())}/{len(results)})")
        
        return results
    
    def test_signal_router(self) -> Dict[str, bool]:
        """
        测试信号路由器
        
        Returns:
            测试结果字典
        """
        logger.info("\n=== 测试5: 信号路由器 ===")
        results = {}
        
        # 场景1: 趋势市（应该选择趋势策略）
        data = self.generate_mock_market_data('trend_up')
        signal = self.signal_router.get_best_signal(data)
        expected_strategy = 'TrendFollowing'
        actual_strategy = signal.get('strategy', '')
        results['router_trend'] = (actual_strategy == expected_strategy)
        logger.info(f"趋势市选择: 预期={expected_strategy}, 实际={actual_strategy}, "
                   f"动作={signal['action']}, 置信度={signal['confidence']:.2f}, "
                   f"结果={'✓' if results['router_trend'] else '✗'}")
        
        # 场景2: 震荡市（应该选择均值回归策略）
        data = self.generate_mock_market_data('range')
        signal = self.signal_router.get_best_signal(data)
        expected_strategy = 'MeanReversion'
        actual_strategy = signal.get('strategy', '')
        results['router_range'] = (actual_strategy == expected_strategy)
        logger.info(f"震荡市选择: 预期={expected_strategy}, 实际={actual_strategy}, "
                   f"动作={signal['action']}, 置信度={signal['confidence']:.2f}, "
                   f"结果={'✓' if results['router_range'] else '✗'}")
        
        # 场景3: 突破市（应该选择突破策略）
        data = self.generate_mock_market_data('breakout')
        signal = self.signal_router.get_best_signal(data)
        expected_strategy = 'Breakout'
        actual_strategy = signal.get('strategy', '')
        results['router_breakout'] = (actual_strategy == expected_strategy)
        logger.info(f"突破市选择: 预期={expected_strategy}, 实际={actual_strategy}, "
                   f"动作={signal['action']}, 置信度={signal['confidence']:.2f}, "
                   f"结果={'✓' if results['router_breakout'] else '✗'}")
        
        # 场景4: 异常市（应该触发LLM复核）
        data = self.generate_mock_market_data('volatile')
        signal = self.signal_router.get_best_signal(data)
        expected_llm = True
        actual_llm = signal.get('needs_llm_review', False)
        results['router_llm'] = (actual_llm == expected_llm)
        logger.info(f"异常市LLM触发: 预期需要LLM={expected_llm}, 实际={actual_llm}, "
                   f"结果={'✓' if results['router_llm'] else '✗'}")
        
        success_rate = sum(results.values()) / len(results) * 100
        logger.info(f"\n信号路由器测试成功率: {success_rate:.1f}% ({sum(results.values())}/{len(results)})")
        
        return results
    
    def run_all_tests(self) -> Dict[str, Dict]:
        """
        运行所有测试
        
        Returns:
            所有测试结果
        """
        logger.info("\n" + "="*60)
        logger.info("Phase 2 策略回测验证")
        logger.info("="*60)
        
        all_results = {}
        
        # 运行所有测试
        all_results['market_regime'] = self.test_market_regime_detection()
        all_results['trend_following'] = self.test_trend_following_strategy()
        all_results['mean_reversion'] = self.test_mean_reversion_strategy()
        all_results['breakout'] = self.test_breakout_strategy()
        all_results['signal_router'] = self.test_signal_router()
        
        # 汇总结果
        logger.info("\n" + "="*60)
        logger.info("测试汇总")
        logger.info("="*60)
        
        total_tests = 0
        total_passed = 0
        
        for module_name, module_results in all_results.items():
            passed = sum(module_results.values())
            total = len(module_results)
            total_tests += total
            total_passed += passed
            success_rate = passed / total * 100 if total > 0 else 0
            
            logger.info(f"{module_name:20s}: {passed:2d}/{total:2d} 通过 ({success_rate:5.1f}%)")
        
        overall_success = total_passed / total_tests * 100 if total_tests > 0 else 0
        logger.info("-" * 60)
        logger.info(f"{'总计':20s}: {total_passed:2d}/{total_tests:2d} 通过 ({overall_success:5.1f}%)")
        
        # 验收标准
        logger.info("\n" + "="*60)
        logger.info("验收标准检查")
        logger.info("="*60)
        
        criteria = {
            '所有策略可正常运行': overall_success >= 80.0,
            '市场状态识别准确': sum(all_results['market_regime'].values()) >= 3,
            '信号路由器工作正常': sum(all_results['signal_router'].values()) >= 3
        }
        
        for criterion, passed in criteria.items():
            status = "✓ 通过" if passed else "✗ 未通过"
            logger.info(f"{criterion:30s}: {status}")
        
        all_passed = all(criteria.values())
        
        if all_passed:
            logger.info("\n✅ Phase 2 策略验证全部通过！")
        else:
            logger.warning("\n⚠️ Phase 2 策略验证部分未通过，需要调整")
        
        return all_results


# 主测试入口
if __name__ == "__main__":
    validator = StrategyBacktestValidator()
    results = validator.run_all_tests()
    
    # 退出码
    all_passed = all(
        all(module_results.values())
        for module_results in results.values()
    )
    
    exit(0 if all_passed else 1)
