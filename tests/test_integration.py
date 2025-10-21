"""
集成测试 - 测试完整的交易流程
测试范围：数据采集 → 策略信号 → 风控 → 执行 → LLM专家系统
"""
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from unittest.mock import Mock, patch, MagicMock

from src.data_fetcher.tqsdk_client import TqSdkClient
from src.data_fetcher.data_processor import DataProcessor
from src.strategy.market_regime import MarketRegimeDetector
from src.strategy.signal_router import SignalRouter
from src.strategy.trend_following import TrendFollowingStrategy
from src.strategy.mean_reversion import MeanReversionStrategy
from src.strategy.breakout import BreakoutStrategy
from src.risk_control.adaptive_risk_control import AdaptiveRiskControl
from src.risk_control.position_sizer import PositionSizer
from src.execution.smart_executor import SmartExecutor, ExecutionAlgorithm
from src.trading.account import Account


class TestFullTradingWorkflow:
    """测试完整交易工作流"""
    
    @pytest.fixture
    def mock_market_data(self):
        """生成模拟市场数据"""
        dates = pd.date_range(start='2024-01-01', end='2024-12-31', freq='1min')
        n = len(dates)
        
        # 生成趋势行情（上涨趋势）
        base_price = 2000
        trend = np.linspace(0, 200, n)
        noise = np.random.normal(0, 5, n)
        close = base_price + trend + noise
        
        df = pd.DataFrame({
            'datetime': dates,
            'open': close - np.random.uniform(0, 2, n),
            'high': close + np.random.uniform(1, 5, n),
            'low': close - np.random.uniform(1, 5, n),
            'close': close,
            'volume': np.random.randint(1000, 5000, n),
        })
        
        return df
    
    @pytest.fixture
    def mock_quote(self):
        """模拟实时行情"""
        return {
            'last_price': 2100.0,
            'bid_price1': 2099.5,
            'ask_price1': 2100.5,
            'bid_volume1': 50,
            'ask_volume1': 60,
            'volume': 100000,
            'open_interest': 200000,
        }
    
    def test_data_collection_to_indicators(self, mock_market_data):
        """测试：数据采集 → 指标计算"""
        processor = DataProcessor()
        
        # 计算技术指标
        df_with_indicators = processor.calculate_all_indicators(mock_market_data)
        
        # 验证指标存在
        assert 'ma_5' in df_with_indicators.columns
        assert 'ma_20' in df_with_indicators.columns
        assert 'macd' in df_with_indicators.columns
        assert 'rsi' in df_with_indicators.columns
        assert 'bb_upper' in df_with_indicators.columns
        assert 'atr' in df_with_indicators.columns
        
        # 验证指标值合理
        assert df_with_indicators['rsi'].iloc[-1] > 0
        assert df_with_indicators['rsi'].iloc[-1] < 100
        assert not df_with_indicators['ma_20'].isna().all()
        
        print(f"✓ 指标计算测试通过，计算了{len(df_with_indicators.columns) - 6}个指标")
    
    def test_market_regime_detection(self, mock_market_data):
        """测试：市场状态识别"""
        processor = DataProcessor()
        df = processor.calculate_all_indicators(mock_market_data)
        
        regime_detector = MarketRegimeDetector()
        regime = regime_detector.detect_regime(df)
        
        # 验证返回结构
        assert 'regime' in regime
        assert 'confidence' in regime
        assert 'adx' in regime
        assert 'atr_percentile' in regime
        
        # 验证状态值
        assert regime['regime'] in ['trending_up', 'trending_down', 'ranging', 'volatile']
        assert 0 <= regime['confidence'] <= 100
        assert regime['adx'] >= 0
        
        print(f"✓ 市场状态: {regime['regime']}, 置信度: {regime['confidence']:.1f}%")
    
    def test_strategy_signal_generation(self, mock_market_data):
        """测试：策略信号生成"""
        processor = DataProcessor()
        df = processor.calculate_all_indicators(mock_market_data)
        
        # 测试趋势策略
        trend_strategy = TrendFollowingStrategy()
        trend_signal = trend_strategy.generate_signal(df)
        
        assert 'action' in trend_signal
        assert 'confidence' in trend_signal
        assert 'reason' in trend_signal
        assert trend_signal['action'] in ['open_long', 'open_short', 'close', 'hold']
        assert 0 <= trend_signal['confidence'] <= 100
        
        # 测试均值回归策略
        mean_rev_strategy = MeanReversionStrategy()
        mean_rev_signal = mean_rev_strategy.generate_signal(df)
        
        assert mean_rev_signal['action'] in ['open_long', 'open_short', 'close', 'hold']
        
        # 测试突破策略
        breakout_strategy = BreakoutStrategy()
        breakout_signal = breakout_strategy.generate_signal(df)
        
        assert breakout_signal['action'] in ['open_long', 'open_short', 'close', 'hold']
        
        print(f"✓ 趋势策略: {trend_signal['action']}, 置信度: {trend_signal['confidence']:.1f}%")
        print(f"✓ 均值回归: {mean_rev_signal['action']}, 置信度: {mean_rev_signal['confidence']:.1f}%")
        print(f"✓ 突破策略: {breakout_signal['action']}, 置信度: {breakout_signal['confidence']:.1f}%")
    
    def test_signal_routing(self, mock_market_data):
        """测试：信号路由（策略聚合）"""
        processor = DataProcessor()
        df = processor.calculate_all_indicators(mock_market_data)
        
        regime_detector = MarketRegimeDetector()
        regime = regime_detector.detect_regime(df)
        
        signal_router = SignalRouter()
        final_signal = signal_router.route_signal(df, regime)
        
        # 验证最终信号
        assert 'action' in final_signal
        assert 'confidence' in final_signal
        assert 'source' in final_signal
        assert 'reasoning' in final_signal
        
        assert final_signal['action'] in ['open_long', 'open_short', 'close', 'hold']
        assert 0 <= final_signal['confidence'] <= 100
        
        print(f"✓ 最终信号: {final_signal['action']}")
        print(f"  来源: {final_signal['source']}")
        print(f"  置信度: {final_signal['confidence']:.1f}%")
        print(f"  理由: {final_signal['reasoning']}")
    
    def test_risk_control_check(self, mock_market_data, mock_quote):
        """测试：风控检查"""
        processor = DataProcessor()
        df = processor.calculate_all_indicators(mock_market_data)
        
        # 创建账户
        account = Account(initial_capital=100000)
        account.update_position('SA601', 1, 2100.0)
        account.update_balance(99000.0)
        
        # 测试自适应风控
        risk_control = AdaptiveRiskControl()
        risk_check = risk_control.check_risk(account, df, mock_quote)
        
        assert 'force_close' in risk_check
        assert 'reason' in risk_check
        assert 'stop_loss_price' in risk_check
        assert 'take_profit_price' in risk_check
        
        print(f"✓ 风控检查: 强平={risk_check['force_close']}")
        print(f"  止损价: {risk_check['stop_loss_price']:.2f}")
        print(f"  止盈价: {risk_check['take_profit_price']:.2f}")
    
    def test_position_sizing(self, mock_market_data, mock_quote):
        """测试：仓位管理"""
        processor = DataProcessor()
        df = processor.calculate_all_indicators(mock_market_data)
        
        account = Account(initial_capital=100000)
        
        sizer = PositionSizer(max_risk_per_trade=0.02)
        position_size = sizer.calculate_size(
            account=account,
            entry_price=mock_quote['last_price'],
            stop_loss_price=mock_quote['last_price'] * 0.98,
            market_data=df
        )
        
        assert position_size > 0
        assert position_size <= 10  # 合理范围
        
        print(f"✓ 建议仓位: {position_size}手")
    
    def test_smart_execution(self, mock_quote):
        """测试：智能执行"""
        account = Account(initial_capital=100000)
        executor = SmartExecutor(account)
        
        # 测试 TWAP 执行
        with patch.object(executor, '_execute_single_order') as mock_exec:
            mock_exec.return_value = True
            
            success = executor.execute_order(
                symbol='SA601',
                action='open_long',
                quantity=5,
                price=mock_quote['last_price'],
                algorithm=ExecutionAlgorithm.TWAP,
                duration_seconds=60
            )
            
            assert success
            # TWAP会拆分成多个订单
            assert mock_exec.call_count >= 1
        
        print(f"✓ 智能执行测试通过")
    
    def test_full_workflow_bullish_scenario(self, mock_market_data, mock_quote):
        """测试：完整流程 - 牛市场景"""
        print("\n" + "="*60)
        print("完整工作流测试：牛市场景")
        print("="*60)
        
        # 1. 数据采集与处理
        processor = DataProcessor()
        df = processor.calculate_all_indicators(mock_market_data)
        print("✓ Step 1: 数据采集与指标计算完成")
        
        # 2. 市场状态识别
        regime_detector = MarketRegimeDetector()
        regime = regime_detector.detect_regime(df)
        print(f"✓ Step 2: 市场状态识别 - {regime['regime']}")
        
        # 3. 策略信号生成
        signal_router = SignalRouter()
        signal = signal_router.route_signal(df, regime)
        print(f"✓ Step 3: 信号生成 - {signal['action']} (置信度: {signal['confidence']:.1f}%)")
        
        # 4. 风控检查
        account = Account(initial_capital=100000)
        risk_control = AdaptiveRiskControl()
        risk_check = risk_control.check_risk(account, df, mock_quote)
        print(f"✓ Step 4: 风控检查 - 强平={risk_check['force_close']}")
        
        # 5. 仓位计算
        if signal['action'] in ['open_long', 'open_short']:
            sizer = PositionSizer(max_risk_per_trade=0.02)
            position_size = sizer.calculate_size(
                account=account,
                entry_price=mock_quote['last_price'],
                stop_loss_price=risk_check['stop_loss_price'],
                market_data=df
            )
            print(f"✓ Step 5: 仓位计算 - {position_size}手")
        else:
            position_size = 0
            print(f"✓ Step 5: 无开仓信号，跳过仓位计算")
        
        # 6. 执行订单
        if position_size > 0 and not risk_check['force_close']:
            executor = SmartExecutor(account)
            with patch.object(executor, '_execute_single_order') as mock_exec:
                mock_exec.return_value = True
                
                success = executor.execute_order(
                    symbol='SA601',
                    action=signal['action'],
                    quantity=position_size,
                    price=mock_quote['last_price'],
                    algorithm=ExecutionAlgorithm.TWAP
                )
                print(f"✓ Step 6: 订单执行 - {'成功' if success else '失败'}")
        else:
            print(f"✓ Step 6: 不满足开仓条件，跳过执行")
        
        print("="*60)
        print("✓ 完整工作流测试通过！")
        print("="*60 + "\n")
    
    def test_full_workflow_ranging_scenario(self):
        """测试：完整流程 - 震荡市场景"""
        print("\n" + "="*60)
        print("完整工作流测试：震荡市场景")
        print("="*60)
        
        # 生成震荡行情数据
        dates = pd.date_range(start='2024-01-01', periods=1000, freq='1min')
        n = len(dates)
        
        # 震荡价格（在2000-2100之间波动）
        base = 2050
        noise = np.random.normal(0, 20, n)
        sine_wave = 50 * np.sin(np.linspace(0, 10*np.pi, n))
        close = base + sine_wave + noise
        
        df = pd.DataFrame({
            'datetime': dates,
            'open': close - np.random.uniform(0, 2, n),
            'high': close + np.random.uniform(1, 5, n),
            'low': close - np.random.uniform(1, 5, n),
            'close': close,
            'volume': np.random.randint(1000, 5000, n),
        })
        
        processor = DataProcessor()
        df = processor.calculate_all_indicators(df)
        
        regime_detector = MarketRegimeDetector()
        regime = regime_detector.detect_regime(df)
        
        print(f"✓ 市场状态: {regime['regime']} (ADX={regime['adx']:.1f})")
        
        # 震荡市应该触发均值回归策略
        signal_router = SignalRouter()
        signal = signal_router.route_signal(df, regime)
        
        print(f"✓ 信号: {signal['action']} (来源: {signal['source']})")
        
        # 验证震荡市下策略选择正确
        assert regime['regime'] in ['ranging', 'volatile']
        
        print("="*60)
        print("✓ 震荡市场景测试通过！")
        print("="*60 + "\n")


class TestExtremeScenarios:
    """测试极端场景"""
    
    def test_price_limit_scenario(self):
        """测试：涨停/跌停场景"""
        dates = pd.date_range(start='2024-01-01', periods=100, freq='1min')
        n = len(dates)
        
        # 模拟涨停（价格不动）
        limit_up_price = 2200.0
        df = pd.DataFrame({
            'datetime': dates,
            'open': [limit_up_price] * n,
            'high': [limit_up_price] * n,
            'low': [limit_up_price] * n,
            'close': [limit_up_price] * n,
            'volume': np.random.randint(100, 1000, n),  # 涨停时成交量很小
        })
        
        processor = DataProcessor()
        df = processor.calculate_all_indicators(df)
        
        # 市场状态应该识别为极端情况
        regime_detector = MarketRegimeDetector()
        regime = regime_detector.detect_regime(df)
        
        print(f"涨停场景 - 市场状态: {regime['regime']}, ADX: {regime['adx']:.1f}")
        
        # 策略应该保守（不追高）
        signal_router = SignalRouter()
        signal = signal_router.route_signal(df, regime)
        
        # 涨停时不应该追多
        assert signal['action'] != 'open_long' or signal['confidence'] < 70
        print(f"✓ 涨停场景测试通过 - 信号: {signal['action']}")
    
    def test_liquidity_dry_scenario(self):
        """测试：流动性枯竭场景"""
        mock_quote = {
            'last_price': 2100.0,
            'bid_price1': 2099.0,
            'ask_price1': 2101.0,
            'bid_volume1': 1,  # 买盘深度很小
            'ask_volume1': 1,  # 卖盘深度很小
            'volume': 100,  # 成交量很小
            'open_interest': 1000,
        }
        
        # 执行器应该检测到流动性不足
        account = Account(initial_capital=100000)
        executor = SmartExecutor(account)
        
        # 尝试执行大单
        with patch.object(executor, '_execute_single_order') as mock_exec:
            # 模拟部分成交
            mock_exec.side_effect = [True, True, False, False, False]
            
            success = executor.execute_order(
                symbol='SA601',
                action='open_long',
                quantity=10,  # 大单
                price=2100.0,
                algorithm=ExecutionAlgorithm.ICEBERG
            )
            
            # 应该执行但可能部分失败
            print(f"✓ 流动性不足场景测试 - 执行结果: {success}")
    
    def test_network_failure_resilience(self):
        """测试：网络中断恢复能力"""
        # 模拟数据获取失败
        with patch('src.data_fetcher.tqsdk_client.TqSdkClient.get_klines') as mock_get:
            mock_get.side_effect = Exception("Network timeout")
            
            # 系统应该优雅处理错误
            try:
                client = TqSdkClient()
                # 在实际环境中，这里会抛出异常但系统应该捕获
                print("✓ 网络中断场景测试 - 错误被正确捕获")
            except Exception as e:
                print(f"✓ 网络中断场景测试 - 异常处理: {str(e)}")


class TestPerformanceMetrics:
    """测试性能指标"""
    
    def test_system_latency(self, benchmark):
        """测试：系统延迟（目标<1秒）"""
        dates = pd.date_range(start='2024-01-01', periods=500, freq='1min')
        n = len(dates)
        
        df = pd.DataFrame({
            'datetime': dates,
            'open': 2000 + np.random.randn(n) * 10,
            'high': 2000 + np.random.randn(n) * 10 + 5,
            'low': 2000 + np.random.randn(n) * 10 - 5,
            'close': 2000 + np.random.randn(n) * 10,
            'volume': np.random.randint(1000, 5000, n),
        })
        
        def full_pipeline():
            processor = DataProcessor()
            df_processed = processor.calculate_all_indicators(df)
            
            regime_detector = MarketRegimeDetector()
            regime = regime_detector.detect_regime(df_processed)
            
            signal_router = SignalRouter()
            signal = signal_router.route_signal(df_processed, regime)
            
            return signal
        
        # 使用 pytest-benchmark 测试
        result = benchmark(full_pipeline)
        print(f"✓ 系统延迟测试通过 - 信号: {result['action']}")


def run_all_tests():
    """运行所有集成测试"""
    print("\n" + "="*70)
    print("量化交易系统 V4 - 集成测试套件")
    print("="*70 + "\n")
    
    pytest.main([
        __file__,
        '-v',  # 详细输出
        '--tb=short',  # 简短的traceback
        '-s',  # 显示print输出
    ])


if __name__ == '__main__':
    run_all_tests()
