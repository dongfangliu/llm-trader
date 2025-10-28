"""
测试手动交易API端点
"""

import sys
import io
from pathlib import Path
import platform

# Windows console UTF-8 support
if platform.system() == "Windows":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root / "web_v2"))

print("=" * 70)
print("手动交易API测试")
print("=" * 70)

# 测试bridge方法
print("\n📋 测试 bridge.manual_trade() 方法:")
print("-" * 70)

from server.core.bridge import bridge

# 测试1: 正常开多仓
print("\n测试1: 开多仓")
result = bridge.manual_trade(action='open', direction='long', volume=1)
print(f"  状态: {result['status']}")
print(f"  消息: {result['message']}")
if result.get('trade_id'):
    print(f"  交易ID: {result['trade_id']}")

# 测试2: 正常平空仓
print("\n测试2: 平空仓")
result = bridge.manual_trade(action='close', direction='short', volume=2)
print(f"  状态: {result['status']}")
print(f"  消息: {result['message']}")

# 测试3: 无效的action
print("\n测试3: 无效的action (应该失败)")
result = bridge.manual_trade(action='invalid', direction='long', volume=1)
print(f"  状态: {result['status']}")
print(f"  消息: {result['message']}")

# 测试4: 无效的direction
print("\n测试4: 无效的direction (应该失败)")
result = bridge.manual_trade(action='open', direction='invalid', volume=1)
print(f"  状态: {result['status']}")
print(f"  消息: {result['message']}")

# 测试5: 无效的volume
print("\n测试5: 无效的volume (应该失败)")
result = bridge.manual_trade(action='open', direction='long', volume=0)
print(f"  状态: {result['status']}")
print(f"  消息: {result['message']}")

print("\n" + "=" * 70)
print("✅ Bridge方法测试完成")
print("=" * 70)

# 测试API端点（需要启动服务器）
print("\n💡 提示:")
print("  要测试完整的API端点，请运行:")
print("  1. 启动后端: python start_web_v2.py")
print("  2. 访问文档: http://localhost:8000/docs")
print("  3. 找到 POST /api/v1/control/manual_trade")
print("  4. 测试参数: {\"action\": \"open\", \"direction\": \"long\", \"volume\": 1}")
print("=" * 70)
