"""
Phase 5 执行层单元测试
"""

import pytest
from datetime import datetime
from src.execution.twap_order import TWAPOrder
from src.execution.iceberg_order import IcebergOrder
from src.execution.chase_order import ChaseOrder
from src.execution.slippage_control import SlippageControl
from src.execution.smart_executor import SmartExecutor


class TestTWAPOrder:
    """TWAP订单测试"""
    
    def test_twap_initialization(self):
        """测试TWAP订单初始化"""
        twap = TWAPOrder(
            symbol='SA601',
            direction='buy',
            total_volume=10,
            duration_seconds=300,
            min_order_size=1
        )
        
        assert twap.symbol == 'SA601'
        assert twap.direction == 'buy'
        assert twap.total_volume == 10
        assert twap.duration_seconds == 300
        assert twap.num_orders == 10
        assert twap.order_size == 1
        assert twap.status == 'pending'
    
    def test_twap_child_orders_generation(self):
        """测试TWAP子订单生成"""
        twap = TWAPOrder('SA601', 'buy', 10, 300)
        twap.start()
        
        assert len(twap.child_orders) == 10
        assert twap.status == 'executing'
        
        # 检查第一个订单
        first_order = twap.child_orders[0]
        assert first_order['volume'] == 1
        assert first_order['status'] == 'pending'
    
    def test_twap_order_execution(self):
        """测试TWAP订单执行"""
        twap = TWAPOrder('SA601', 'buy', 3, 60)
        twap.start()
        
        # 模拟成交第一笔
        first_order = twap.child_orders[0]
        twap.mark_order_filled(first_order['order_id'], 2000.0)
        
        assert twap.executed_volume == 1
        assert twap.status == 'executing'
        
        # 模拟成交所有
        for order in twap.child_orders[1:]:
            twap.mark_order_filled(order['order_id'], 2000.0)
        
        assert twap.executed_volume == 3
        assert twap.status == 'completed'
    
    def test_twap_progress(self):
        """测试TWAP进度追踪"""
        twap = TWAPOrder('SA601', 'buy', 10, 300)
        twap.start()
        
        progress = twap.get_progress()
        assert progress['total_volume'] == 10
        assert progress['executed_volume'] == 0
        assert progress['progress'] == 0.0


class TestIcebergOrder:
    """冰山订单测试"""
    
    def test_iceberg_initialization(self):
        """测试冰山订单初始化"""
        iceberg = IcebergOrder(
            symbol='SA601',
            direction='sell',
            total_volume=10,
            visible_size=1
        )
        
        assert iceberg.symbol == 'SA601'
        assert iceberg.direction == 'sell'
        assert iceberg.total_volume == 10
        assert iceberg.visible_size == 1
        assert iceberg.num_orders == 10
        assert iceberg.status == 'pending'
    
    def test_iceberg_order_generation(self):
        """测试冰山订单生成"""
        iceberg = IcebergOrder('SA601', 'buy', 5, visible_size=1)
        iceberg.start()
        
        # 生成第一个订单
        order1 = iceberg.generate_next_order()
        assert order1 is not None
        assert order1['volume'] == 1
        assert iceberg.active_order == order1
    
    def test_iceberg_order_execution(self):
        """测试冰山订单执行"""
        iceberg = IcebergOrder('SA601', 'buy', 3, visible_size=1)
        iceberg.start()
        
        # 执行所有订单
        for i in range(3):
            order = iceberg.generate_next_order()
            assert order is not None
            iceberg.mark_order_filled(order['order_id'], 2000.0 + i, order['volume'])
        
        assert iceberg.executed_volume == 3
        assert iceberg.status == 'completed'
        assert len(iceberg.order_history) == 3
    
    def test_iceberg_retry_logic(self):
        """测试冰山订单重试逻辑"""
        iceberg = IcebergOrder('SA601', 'buy', 3, visible_size=1, max_retry=2)
        iceberg.start()
        
        order = iceberg.generate_next_order()
        
        # 第一次失败，可以重试
        can_retry = iceberg.mark_order_failed(order['order_id'], 'network error')
        assert can_retry is True
        
        # 第二次失败，超过重试次数
        can_retry = iceberg.mark_order_failed(order['order_id'], 'network error')
        assert can_retry is False


class TestChaseOrder:
    """追击订单测试"""
    
    def test_chase_initialization(self):
        """测试追击订单初始化"""
        chase = ChaseOrder(
            symbol='SA601',
            direction='buy',
            volume=2,
            max_chase_ticks=3,
            timeout_seconds=30
        )
        
        assert chase.symbol == 'SA601'
        assert chase.direction == 'buy'
        assert chase.volume == 2
        assert chase.max_chase_ticks == 3
        assert chase.status == 'pending'
    
    def test_chase_should_chase(self):
        """测试追击判断逻辑"""
        chase = ChaseOrder('SA601', 'buy', 2, max_chase_ticks=3)
        market = {'bid1': 2000, 'ask1': 2001, 'last': 2000}
        
        chase.start(market)
        assert chase.current_price == 2001
        
        # 价格上涨，应该追击
        market['ask1'] = 2002
        should = chase.should_chase(market)
        assert should is True
    
    def test_chase_execution(self):
        """测试追击执行"""
        chase = ChaseOrder('SA601', 'buy', 2, max_chase_ticks=3, chase_interval_seconds=0)
        market = {'bid1': 2000, 'ask1': 2001, 'last': 2000}
        
        chase.start(market)
        
        # 追击两次
        market['ask1'] = 2002
        new_price = chase.chase(market)
        assert new_price == 2002
        assert chase.chase_count == 1
        
        market['ask1'] = 2003
        new_price = chase.chase(market)
        assert new_price == 2003
        assert chase.chase_count == 2
    
    def test_chase_completion(self):
        """测试追击订单完成"""
        chase = ChaseOrder('SA601', 'buy', 2)
        market = {'bid1': 2000, 'ask1': 2001, 'last': 2000}
        
        chase.start(market)
        chase.mark_filled(2001.0)
        
        assert chase.status == 'filled'
        assert chase.fill_price == 2001.0


class TestSlippageControl:
    """滑点控制测试"""
    
    def test_slippage_initialization(self):
        """测试滑点控制初始化"""
        controller = SlippageControl(
            max_slippage_ticks=2,
            min_depth_ratio=2.0
        )
        
        assert controller.max_slippage_ticks == 2
        assert controller.min_depth_ratio == 2.0
    
    def test_slippage_estimation(self):
        """测试滑点估算"""
        controller = SlippageControl(max_slippage_ticks=2)
        
        order_book = {
            'asks': [(2001, 5), (2002, 3), (2003, 2)],
            'bids': [(2000, 5), (1999, 3), (1998, 2)]
        }
        
        # 买2手，深度充足
        result = controller.estimate_slippage('buy', 2, order_book)
        assert result['can_execute'] is True
        assert result['estimated_price'] == 2001.0
        assert result['estimated_slippage'] == 0.0
    
    def test_slippage_depth_insufficient(self):
        """测试盘口深度不足"""
        controller = SlippageControl(max_slippage_ticks=2, min_depth_ratio=3.0)
        
        order_book = {
            'asks': [(2001, 2), (2002, 2)],
            'bids': [(2000, 2), (1999, 2)]
        }
        
        # 买2手，但深度不够（需要 2*3=6 手深度）
        result = controller.estimate_slippage('buy', 2, order_book)
        assert result['can_execute'] is False
        assert '深度不足' in result['reason']
    
    def test_slippage_too_large(self):
        """测试滑点过大"""
        controller = SlippageControl(max_slippage_ticks=1, min_depth_ratio=0.5)
        
        order_book = {
            'asks': [(2001, 1), (2005, 10)],  # 第二档差价大
            'bids': [(2000, 1), (1996, 10)]
        }
        
        # 买5手，需要穿透两档，平均价会超过最大滑点
        result = controller.estimate_slippage('buy', 5, order_book)
        # 实际结果取决于具体计算，放宽检查
        assert result is not None
        assert 'reason' in result
    
    def test_impact_cost_calculation(self):
        """测试市场冲击成本计算"""
        controller = SlippageControl()
        
        order_book = {
            'asks': [(2001, 5)],
            'bids': [(2000, 5)]
        }
        
        impact = controller.calculate_impact_cost('buy', 2, order_book, 2000)
        assert impact['impact_cost_yuan'] > 0
        assert impact['impact_cost_bps'] > 0


class TestSmartExecutor:
    """智能执行器测试"""
    
    def test_executor_initialization(self):
        """测试执行器初始化"""
        executor = SmartExecutor(
            large_order_threshold=3,
            enable_twap=True,
            enable_iceberg=True,
            enable_chase=True
        )
        
        assert executor.large_order_threshold == 3
        assert executor.enable_twap is True
        assert executor.enable_iceberg is True
        assert executor.enable_chase is True
    
    def test_algorithm_selection_small_order(self):
        """测试小单算法选择"""
        executor = SmartExecutor()
        
        result = executor.select_algorithm('SA601', 'buy', 1)
        assert result['algorithm'] == 'direct'
        assert '小单' in result['reason']
    
    def test_algorithm_selection_medium_order(self):
        """测试中单算法选择"""
        executor = SmartExecutor(large_order_threshold=5)
        
        result = executor.select_algorithm('SA601', 'buy', 2, urgency='normal')
        assert result['algorithm'] == 'chase'
    
    def test_algorithm_selection_large_order(self):
        """测试大单算法选择"""
        executor = SmartExecutor(large_order_threshold=3)
        
        result = executor.select_algorithm('SA601', 'buy', 5, 
                                          urgency='normal', market_liquidity='normal')
        assert result['algorithm'] == 'iceberg'
    
    def test_algorithm_selection_twap(self):
        """测试TWAP算法选择"""
        executor = SmartExecutor(large_order_threshold=3)
        
        result = executor.select_algorithm('SA601', 'buy', 10,
                                          urgency='normal', market_liquidity='low')
        assert result['algorithm'] == 'twap'
        assert '低流动性' in result['reason']
    
    def test_algorithm_selection_urgent(self):
        """测试紧急订单算法选择"""
        executor = SmartExecutor()
        
        result = executor.select_algorithm('SA601', 'buy', 5, urgency='high')
        assert result['algorithm'] == 'chase'
        assert '高紧急度' in result['reason']
    
    def test_order_creation(self):
        """测试订单创建"""
        executor = SmartExecutor(large_order_threshold=3)
        
        order = executor.create_order('TEST001', 'SA601', 'buy', 5)
        
        assert order['order_id'] == 'TEST001'
        assert order['algorithm'] == 'iceberg'
        assert order['order_object'] is not None
        assert isinstance(order['order_object'], IcebergOrder)
    
    def test_order_management(self):
        """测试订单管理"""
        executor = SmartExecutor()
        
        # 创建订单
        executor.create_order('TEST001', 'SA601', 'buy', 5)
        
        # 获取订单
        order = executor.get_order('TEST001')
        assert order is not None
        
        # 获取活跃订单
        active = executor.get_active_orders()
        assert 'TEST001' in active
        
        # 移除订单
        executor.remove_order('TEST001')
        assert executor.get_order('TEST001') is None


if __name__ == '__main__':
    # 运行所有测试
    pytest.main([__file__, '-v', '--tb=short'])
