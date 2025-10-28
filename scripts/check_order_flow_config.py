"""
检查订单流配置
"""

import sys
from pathlib import Path

# 添加项目根目录到路径
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

import yaml
from loguru import logger

def check_config():
    """检查配置文件"""
    config_path = project_root / 'config' / 'trading_params.yaml'
    
    print(f"\n{'='*60}")
    print(f"📋 订单流配置检查")
    print(f"{'='*60}\n")
    
    try:
        with open(config_path, 'r', encoding='utf-8') as f:
            params = yaml.safe_load(f)
        
        order_flow_config = params.get('order_flow', {})
        
        if not order_flow_config:
            print("❌ 配置文件中没有 order_flow 配置项")
            return
        
        print("✅ 配置文件存在订单流配置:\n")
        
        # VPIN配置
        vpin = order_flow_config.get('vpin', {})
        print(f"📊 VPIN配置:")
        print(f"  - 桶大小: {vpin.get('bucket_size', '未配置')} 手")
        
        # 大单检测配置
        large_order = order_flow_config.get('large_order', {})
        print(f"\n🎯 大单检测配置:")
        print(f"  - 回看窗口: {large_order.get('lookback', '未配置')} 笔")
        print(f"  - 阈值倍数: {large_order.get('threshold_multiplier', '未配置')} 倍")
        print(f"    → 成交量必须 ≥ 平均值 × {large_order.get('threshold_multiplier', '?')} 才算大单")
        
        # 订单簿配置
        orderbook = order_flow_config.get('orderbook', {})
        print(f"\n📖 订单簿配置:")
        print(f"  - 历史记录: {orderbook.get('max_history', '未配置')} 次")
        
        print(f"\n{'='*60}")
        print("💡 提示:")
        print("  - 如果28手被识别为大单，说明平均成交量很小")
        print(f"  - 平均成交量 = 28 / {large_order.get('threshold_multiplier', 2.5)} ≈ {28 / large_order.get('threshold_multiplier', 2.5):.1f} 手")
        print("  - 建议增加 threshold_multiplier 到 4.0 或更高")
        print(f"{'='*60}\n")
        
    except Exception as e:
        print(f"❌ 读取配置失败: {e}")

if __name__ == "__main__":
    check_config()
