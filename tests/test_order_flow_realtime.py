"""
测试订单流实时计算
"""

import sys
from pathlib import Path
from datetime import datetime

# 添加项目根目录到路径
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from src.data.order_flow_service import get_order_flow_service
from loguru import logger


def test_order_flow_service():
    """测试订单流服务"""
    logger.info("="*60)
    logger.info("订单流实时计算测试")
    logger.info("="*60)
    
    service = get_order_flow_service()
    
    # 模拟Tick数据流
    logger.info("\n[测试1] 模拟Tick数据...")
    
    base_price = 2100.0
    base_volume = 1000
    
    for i in range(50):
        # 模拟价格波动
        price_change = (i % 10 - 5) * 0.5  # -2.5 到 +2.5
        price = base_price + price_change
        volume = base_volume + i * 10
        
        tick_data = {
            'price': price,
            'volume': volume,
            'bid_price1': price - 0.5,
            'bid_volume1': 100 + i,
            'bid_price2': price - 1.0,
            'bid_volume2': 80,
            'bid_price3': price - 1.5,
            'bid_volume3': 60,
            'bid_price4': price - 2.0,
            'bid_volume4': 40,
            'bid_price5': price - 2.5,
            'bid_volume5': 20,
            'ask_price1': price + 0.5,
            'ask_volume1': 90 + i,
            'ask_price2': price + 1.0,
            'ask_volume2': 70,
            'ask_price3': price + 1.5,
            'ask_volume3': 50,
            'ask_price4': price + 2.0,
            'ask_volume4': 30,
            'ask_price5': price + 2.5,
            'ask_volume5': 10,
            'timestamp': datetime.now().isoformat()
        }
        
        result = service.on_tick(tick_data)
        
        if i % 10 == 0:
            logger.info(f"\n第{i}次Tick:")
            if 'vpin' in result:
                logger.info(f"  VPIN: {result['vpin']}")
            if 'orderbook' in result:
                logger.info(f"  订单簿: bid_depth={result['orderbook']['bid_depth']}, "
                          f"ask_depth={result['orderbook']['ask_depth']}, "
                          f"imbalance={result['orderbook']['imbalance']}")
            if 'large_order' in result:
                logger.info(f"  🔥 大单: {result['large_order']}")
    
    # 获取最终状态
    logger.info("\n[测试2] 最终状态...")
    vpin = service.get_latest_vpin()
    logger.info(f"最新VPIN: {vpin}")
    
    orderbook = service.get_latest_orderbook()
    logger.info(f"最新订单簿: {orderbook}")
    
    large_orders = service.get_large_orders(10)
    logger.info(f"大单数量: {large_orders['count']}")
    if large_orders['orders']:
        logger.info(f"最近大单: {large_orders['orders'][:3]}")
    
    dynamics = service.get_orderbook_dynamics()
    logger.info(f"订单簿动态: {dynamics}")
    
    logger.info("\n" + "="*60)
    logger.info("✅ 测试完成")
    logger.info("="*60)


if __name__ == "__main__":
    test_order_flow_service()
