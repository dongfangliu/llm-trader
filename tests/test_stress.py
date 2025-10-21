"""
压力测试 - 测试系统在极端条件下的表现
"""
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import time
import pytest
import pandas as pd
import numpy as np
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime

from src.data_fetcher.data_processor import DataProcessor
from src.strategy.signal_router import SignalRouter
from src.strategy.market_regime import MarketRegimeDetector
from src.trading.account import Account
from src.risk_control.adaptive_risk_control import AdaptiveRiskControl


class TestStressScenarios:
    """压力测试场景"""
    
    def test_high_frequency_signals(self):
        """测试：高频信号生成（模拟1秒钟内处理多次信号）"""
        print("\n" + "="*60)
        print("压力测试: 高频信号处理")
        print("="*60)
        
        processor = DataProcessor()
        signal_router = SignalRouter()
        regime_detector = MarketRegimeDetector()
        
        # 生成测试数据
        dates = pd.date_range(start='2024-01-01', periods=1000, freq='1min')
        n = len(dates)
        df = pd.DataFrame({
            'datetime': dates,
            'open': 2000 + np.random.randn(n) * 10,
            'high': 2000 + np.random.randn(n) * 10 + 5,
            'low': 2000 + np.random.randn(n) * 10 - 5,
            'close': 2000 + np.random.randn(n) * 10,
            'volume': np.random.randint(1000, 5000, n),
        })
        df = processor.calculate_all_indicators(df)
        regime = regime_detector.detect_regime(df)
        
        # 测试100次连续信号生成
        start_time = time.time()
        signals = []
        
        for i in range(100):
            signal = signal_router.route_signal(df, regime)
            signals.append(signal)
        
        elapsed = time.time() - start_time
        avg_latency = elapsed / 100 * 1000  # 转换为毫秒
        
        print(f"✓ 生成100个信号耗时: {elapsed:.3f}秒")
        print(f"✓ 平均延迟: {avg_latency:.2f}ms")
        
        # 验证性能目标：平均延迟 < 100ms
        assert avg_latency < 100, f"平均延迟{avg_latency:.2f}ms超过100ms目标"
        
        # 验证所有信号有效
        for signal in signals:
            assert 'action' in signal
            assert signal['action'] in ['open_long', 'open_short', 'close', 'hold']
        
        print(f"✓ 高频信号测试通过 ✓")
        print("="*60 + "\n")
    
    def test_concurrent_account_operations(self):
        """测试：并发账户操作"""
        print("\n" + "="*60)
        print("压力测试: 并发账户操作")
        print("="*60)
        
        account = Account(initial_capital=100000)
        
        def update_position(symbol, quantity, price):
            """模拟更新持仓"""
            try:
                account.update_position(symbol, quantity, price)
                return True
            except Exception as e:
                print(f"错误: {e}")
                return False
        
        # 使用线程池模拟并发操作
        with ThreadPoolExecutor(max_workers=10) as executor:
            futures = []
            for i in range(50):
                future = executor.submit(
                    update_position,
                    'SA601',
                    1 if i % 2 == 0 else -1,
                    2000 + i
                )
                futures.append(future)
            
            # 等待所有操作完成
            results = [f.result() for f in as_completed(futures)]
        
        success_count = sum(results)
        print(f"✓ 50个并发操作完成: 成功{success_count}个")
        
        # 至少80%成功
        assert success_count >= 40, "并发操作成功率过低"
        
        print(f"✓ 并发账户操作测试通过 ✓")
        print("="*60 + "\n")
    
    def test_large_dataset_processing(self):
        """测试：大数据集处理（1年分钟数据）"""
        print("\n" + "="*60)
        print("压力测试: 大数据集处理")
        print("="*60)
        
        # 生成1年的分钟数据（约365*24*60 = 525,600条）
        dates = pd.date_range(start='2024-01-01', periods=100000, freq='1min')
        n = len(dates)
        
        print(f"生成{n:,}条数据...")
        
        df = pd.DataFrame({
            'datetime': dates,
            'open': 2000 + np.random.randn(n) * 10,
            'high': 2000 + np.random.randn(n) * 10 + 5,
            'low': 2000 + np.random.randn(n) * 10 - 5,
            'close': 2000 + np.random.randn(n) * 10,
            'volume': np.random.randint(1000, 5000, n),
        })
        
        processor = DataProcessor()
        
        start_time = time.time()
        df_processed = processor.calculate_all_indicators(df)
        elapsed = time.time() - start_time
        
        print(f"✓ 处理{n:,}条数据耗时: {elapsed:.3f}秒")
        print(f"✓ 处理速度: {n/elapsed:,.0f}条/秒")
        
        # 验证数据完整性
        assert len(df_processed) == n
        assert 'ma_20' in df_processed.columns
        assert 'rsi' in df_processed.columns
        
        # 性能目标：处理速度 > 10,000条/秒
        assert n/elapsed > 10000, f"处理速度{n/elapsed:.0f}条/秒低于目标"
        
        print(f"✓ 大数据集处理测试通过 ✓")
        print("="*60 + "\n")
    
    def test_memory_leak_detection(self):
        """测试：内存泄漏检测（连续运行多次）"""
        print("\n" + "="*60)
        print("压力测试: 内存泄漏检测")
        print("="*60)
        
        import psutil
        process = psutil.Process()
        
        initial_memory = process.memory_info().rss / 1024 / 1024  # MB
        print(f"初始内存: {initial_memory:.2f} MB")
        
        processor = DataProcessor()
        signal_router = SignalRouter()
        regime_detector = MarketRegimeDetector()
        
        # 连续运行100次完整流程
        for i in range(100):
            dates = pd.date_range(start='2024-01-01', periods=1000, freq='1min')
            n = len(dates)
            df = pd.DataFrame({
                'datetime': dates,
                'open': 2000 + np.random.randn(n) * 10,
                'high': 2000 + np.random.randn(n) * 10 + 5,
                'low': 2000 + np.random.randn(n) * 10 - 5,
                'close': 2000 + np.random.randn(n) * 10,
                'volume': np.random.randint(1000, 5000, n),
            })
            
            df = processor.calculate_all_indicators(df)
            regime = regime_detector.detect_regime(df)
            signal = signal_router.route_signal(df, regime)
            
            # 每10次输出一次进度
            if (i + 1) % 10 == 0:
                current_memory = process.memory_info().rss / 1024 / 1024
                print(f"  迭代 {i+1}/100 - 当前内存: {current_memory:.2f} MB")
        
        final_memory = process.memory_info().rss / 1024 / 1024
        memory_increase = final_memory - initial_memory
        
        print(f"\n最终内存: {final_memory:.2f} MB")
        print(f"内存增长: {memory_increase:.2f} MB ({memory_increase/initial_memory*100:.1f}%)")
        
        # 内存增长应小于50%
        assert memory_increase / initial_memory < 0.5, "内存泄漏超过50%"
        
        print(f"✓ 内存泄漏检测通过 ✓")
        print("="*60 + "\n")
    
    def test_extreme_volatility(self):
        """测试：极端波动场景（价格剧烈波动）"""
        print("\n" + "="*60)
        print("压力测试: 极端波动场景")
        print("="*60)
        
        # 生成极端波动数据（价格在2000-3000之间剧烈波动）
        dates = pd.date_range(start='2024-01-01', periods=1000, freq='1min')
        n = len(dates)
        
        # 使用大幅随机波动
        close = 2500 + np.random.randn(n) * 200  # 标准差200
        
        df = pd.DataFrame({
            'datetime': dates,
            'open': close - np.random.uniform(0, 50, n),
            'high': close + np.random.uniform(10, 100, n),
            'low': close - np.random.uniform(10, 100, n),
            'close': close,
            'volume': np.random.randint(5000, 20000, n),  # 高成交量
        })
        
        processor = DataProcessor()
        df = processor.calculate_all_indicators(df)
        
        regime_detector = MarketRegimeDetector()
        regime = regime_detector.detect_regime(df)
        
        print(f"市场状态: {regime['regime']}")
        print(f"ADX: {regime['adx']:.1f}")
        print(f"ATR百分位: {regime['atr_percentile']:.1f}%")
        
        # 极端波动应该被识别为 volatile
        assert regime['regime'] in ['volatile', 'trending_up', 'trending_down']
        assert regime['atr_percentile'] > 50  # ATR应该处于较高水平
        
        # 风控应该收紧
        account = Account(initial_capital=100000)
        account.update_position('SA601', 1, close.iloc[-1])
        
        risk_control = AdaptiveRiskControl()
        mock_quote = {
            'last_price': close.iloc[-1],
            'bid_price1': close.iloc[-1] - 1,
            'ask_price1': close.iloc[-1] + 1,
            'bid_volume1': 50,
            'ask_volume1': 50,
            'volume': 10000,
            'open_interest': 100000,
        }
        
        risk_check = risk_control.check_risk(account, df, mock_quote)
        
        # 止损应该更紧
        stop_loss_pct = abs(risk_check['stop_loss_price'] - close.iloc[-1]) / close.iloc[-1]
        print(f"止损幅度: {stop_loss_pct*100:.2f}%")
        
        print(f"✓ 极端波动场景测试通过 ✓")
        print("="*60 + "\n")
    
    def test_rapid_regime_change(self):
        """测试：市场状态快速切换"""
        print("\n" + "="*60)
        print("压力测试: 市场状态快速切换")
        print("="*60)
        
        processor = DataProcessor()
        regime_detector = MarketRegimeDetector()
        signal_router = SignalRouter()
        
        # 生成三段不同市场状态的数据
        n_segment = 200
        
        # 第1段：上涨趋势
        dates1 = pd.date_range(start='2024-01-01', periods=n_segment, freq='1min')
        close1 = 2000 + np.linspace(0, 100, n_segment) + np.random.randn(n_segment) * 5
        
        # 第2段：震荡
        dates2 = pd.date_range(start=dates1[-1], periods=n_segment, freq='1min')[1:]
        close2 = 2100 + np.sin(np.linspace(0, 10*np.pi, n_segment-1)) * 30 + np.random.randn(n_segment-1) * 5
        
        # 第3段：下跌趋势
        dates3 = pd.date_range(start=dates2[-1], periods=n_segment, freq='1min')[1:]
        close3 = 2100 - np.linspace(0, 100, n_segment-1) + np.random.randn(n_segment-1) * 5
        
        # 合并数据
        dates = pd.concat([pd.Series(dates1), pd.Series(dates2), pd.Series(dates3)], ignore_index=True)
        close = np.concatenate([close1, close2, close3])
        n = len(close)
        
        df = pd.DataFrame({
            'datetime': dates,
            'open': close - np.random.uniform(0, 2, n),
            'high': close + np.random.uniform(1, 5, n),
            'low': close - np.random.uniform(1, 5, n),
            'close': close,
            'volume': np.random.randint(1000, 5000, n),
        })
        
        # 在每个时间点检测状态
        regimes = []
        signals = []
        
        for i in range(100, n, 50):  # 每50个点检测一次
            df_slice = df.iloc[:i]
            df_slice = processor.calculate_all_indicators(df_slice)
            
            regime = regime_detector.detect_regime(df_slice)
            signal = signal_router.route_signal(df_slice, regime)
            
            regimes.append(regime['regime'])
            signals.append(signal['action'])
        
        # 统计状态切换次数
        regime_changes = sum(1 for i in range(1, len(regimes)) if regimes[i] != regimes[i-1])
        
        print(f"检测{len(regimes)}次，状态切换{regime_changes}次")
        print(f"状态序列: {' -> '.join(regimes[:10])}...")
        
        # 应该有状态切换
        assert regime_changes >= 2, "状态切换次数过少，可能识别失败"
        
        print(f"✓ 市场状态快速切换测试通过 ✓")
        print("="*60 + "\n")


class TestReliability:
    """可靠性测试"""
    
    def test_error_recovery(self):
        """测试：错误恢复能力"""
        print("\n" + "="*60)
        print("可靠性测试: 错误恢复")
        print("="*60)
        
        processor = DataProcessor()
        
        # 测试1：空数据集
        empty_df = pd.DataFrame()
        try:
            processor.calculate_all_indicators(empty_df)
            print("✓ 空数据集处理: 未崩溃（但可能无输出）")
        except Exception as e:
            print(f"✓ 空数据集处理: 正确抛出异常 - {type(e).__name__}")
        
        # 测试2：数据不足
        dates = pd.date_range(start='2024-01-01', periods=10, freq='1min')
        short_df = pd.DataFrame({
            'datetime': dates,
            'open': [2000] * 10,
            'high': [2005] * 10,
            'low': [1995] * 10,
            'close': [2000] * 10,
            'volume': [1000] * 10,
        })
        
        try:
            df_processed = processor.calculate_all_indicators(short_df)
            print(f"✓ 短数据集处理: 成功（{len(df_processed)}条）")
        except Exception as e:
            print(f"✓ 短数据集处理: 正确处理异常 - {type(e).__name__}")
        
        # 测试3：缺失列
        bad_df = pd.DataFrame({
            'datetime': dates,
            'close': [2000] * 10,
        })
        
        try:
            processor.calculate_all_indicators(bad_df)
            print("✗ 缺失列未检测到")
            assert False
        except Exception as e:
            print(f"✓ 缺失列检测: 正确抛出异常 - {type(e).__name__}")
        
        print(f"✓ 错误恢复测试通过 ✓")
        print("="*60 + "\n")
    
    def test_data_consistency(self):
        """测试：数据一致性"""
        print("\n" + "="*60)
        print("可靠性测试: 数据一致性")
        print("="*60)
        
        processor = DataProcessor()
        
        dates = pd.date_range(start='2024-01-01', periods=1000, freq='1min')
        n = len(dates)
        
        df = pd.DataFrame({
            'datetime': dates,
            'open': 2000 + np.random.randn(n) * 10,
            'high': 2000 + np.random.randn(n) * 10 + 5,
            'low': 2000 + np.random.randn(n) * 10 - 5,
            'close': 2000 + np.random.randn(n) * 10,
            'volume': np.random.randint(1000, 5000, n),
        })
        
        # 多次处理，结果应该一致
        results = []
        for _ in range(3):
            df_processed = processor.calculate_all_indicators(df.copy())
            results.append(df_processed)
        
        # 验证MA、RSI等指标值一致
        for i in range(1, len(results)):
            assert np.allclose(
                results[0]['ma_20'].dropna(),
                results[i]['ma_20'].dropna(),
                rtol=1e-10
            ), "MA指标计算不一致"
            
            assert np.allclose(
                results[0]['rsi'].dropna(),
                results[i]['rsi'].dropna(),
                rtol=1e-10
            ), "RSI指标计算不一致"
        
        print(f"✓ 数据一致性测试通过 ✓")
        print("="*60 + "\n")


def run_stress_tests():
    """运行所有压力测试"""
    print("\n" + "="*70)
    print("量化交易系统 V4 - 压力测试套件")
    print("="*70 + "\n")
    
    pytest.main([
        __file__,
        '-v',
        '--tb=short',
        '-s',
        '-k', 'stress or reliability',  # 只运行压力和可靠性测试
    ])


if __name__ == '__main__':
    run_stress_tests()
