# 订单流功能快速参考

## 计算指标

### VPIN（订单流毒性）
- **含义**: 知情交易概率，反映市场信息不对称程度
- **范围**: 0.0 - 1.0
- **解读**:
  - `< 0.3`: 🟢 低毒性 - 市场健康，可跟随趋势
  - `0.3 - 0.6`: 🟡 中毒性 - 谨慎观望，存在知情交易
  - `≥ 0.6`: 🔴 高毒性 - 警惕反转，大量知情交易
- **更新频率**: 每个成交桶（50手）

### 订单簿失衡度（Imbalance）
- **计算**: `(买盘深度 - 卖盘深度) / (买盘深度 + 卖盘深度)`
- **范围**: -1.0 到 +1.0
- **解读**:
  - `> 0.2`: 🟢 买盘优势 - 支撑强
  - `-0.2 到 0.2`: 🟡 平衡 - 博弈中
  - `< -0.2`: 🔴 卖盘优势 - 压力大
- **更新频率**: 每次Tick

### 深度比率（Depth Ratio）
- **计算**: `买盘深度 / 卖盘深度`
- **范围**: 0 到 ∞
- **解读**:
  - `> 1.2`: 买盘深度远超卖盘
  - `0.8 - 1.2`: 买卖平衡
  - `< 0.8`: 卖盘深度远超买盘
- **更新频率**: 每次Tick

### 大单倍数（Large Order Multiplier）
- **计算**: `成交量 / 平均成交量`
- **阈值**: ≥ 2.5倍
- **解读**:
  - `2.5 - 5.0`: 🟡 中等大单
  - `5.0 - 10.0`: 🟠 较大大单
  - `> 10.0`: 🔴 超大单
- **更新频率**: 检测到时推送

## API端点

### 获取当前VPIN
```bash
GET /order-flow/vpin/current
```
返回最新的VPIN值和毒性等级。

### 获取订单簿快照
```bash
GET /order-flow/orderbook/snapshot
```
返回五档盘口和失衡度。

### 获取大单列表
```bash
GET /order-flow/large-orders?count=20
```
返回最近检测到的大单。

### 获取订单簿动态
```bash
GET /order-flow/orderbook/dynamics
```
返回深度变化率和市场解读。

## WebSocket订阅

### 连接
```javascript
const ws = new WebSocket('ws://localhost:8000/ws');
```

### 监听订单流消息
```javascript
ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    
    if (message.type === 'order_flow') {
        const { vpin, orderbook, large_order } = message.data;
        
        // 处理VPIN更新
        if (vpin) {
            console.log(`VPIN: ${vpin.vpin}, Level: ${vpin.level}`);
        }
        
        // 处理订单簿更新
        if (orderbook) {
            console.log(`Bid: ${orderbook.bid_depth}, Ask: ${orderbook.ask_depth}`);
        }
        
        // 处理大单
        if (large_order) {
            console.log(`🔥 Large order: ${large_order.direction} ${large_order.volume}`);
        }
    }
};
```

## 交易策略应用

### 1. VPIN反转策略
```
IF VPIN > 0.6 AND 价格接近阻力位:
    → 考虑做空（知情交易者可能在派发）

IF VPIN > 0.6 AND 价格接近支撑位:
    → 考虑做多（知情交易者可能在吸筹）
```

### 2. 订单簿失衡策略
```
IF imbalance > 0.2 AND 买盘深度快速增加:
    → 做多信号（大资金支撑）

IF imbalance < -0.2 AND 卖盘深度快速增加:
    → 做空信号（大资金压力）
```

### 3. 大单跟随策略
```
IF 连续3笔大买单 AND VPIN < 0.4:
    → 考虑跟随做多

IF 连续3笔大卖单 AND VPIN < 0.4:
    → 考虑跟随做空
```

### 4. 深度虚假突破识别
```
IF 价格突破阻力 BUT 买盘深度快速撤离:
    → 虚假突破，可能回调

IF 价格跌破支撑 BUT 卖盘深度快速撤离:
    → 虚假跌破，可能反弹
```

## 常见问题

### Q: VPIN一直是0怎么办？
A: VPIN需要足够的成交量才能计算。等待成交桶填满（默认50手），或者降低`bucket_size`参数。

### Q: 为什么看不到大单？
A: 大单检测需要建立成交量基线（至少10笔成交）。市场清淡时大单较少。

### Q: 订单簿失衡度总是接近0？
A: 这说明买卖盘比较平衡，市场处于震荡状态。突破时会出现明显失衡。

### Q: WebSocket断开怎么办？
A: 前端应实现自动重连逻辑。订单流数据是实时的，断线期间的数据会丢失。

### Q: 如何保存历史数据？
A: 当前版本不保存历史数据（内存计算）。如需历史分析，可在`OrderFlowService`中添加数据库写入。

## 性能监控

### 检查订单流服务状态
```python
from web_v2.server.services.realtime_push_service import get_push_service

push_service = get_push_service()
if push_service.order_flow_service:
    print("✅ 订单流服务运行中")
    vpin = push_service.get_order_flow_vpin()
    print(f"当前VPIN: {vpin}")
else:
    print("❌ 订单流服务未启动")
```

### 查看缓存状态
```python
# 检查推送服务状态
status = push_service.get_cache_status()
print(f"缓存状态: {status}")

# 检查订单流数据
large_orders = push_service.get_order_flow_large_orders(10)
print(f"大单数量: {large_orders['count']}")
```

## 调试技巧

### 1. 启用详细日志
```python
from loguru import logger
logger.add("order_flow_debug.log", level="DEBUG", filter=lambda r: "order_flow" in r["name"])
```

### 2. 测试订单流计算
```bash
python tests/test_order_flow_realtime.py
```

### 3. 模拟Tick数据
```python
from src.data.order_flow_service import get_order_flow_service

service = get_order_flow_service()
tick_data = {
    'price': 2105.0,
    'volume': 1000,
    'bid_price1': 2104.5, 'bid_volume1': 100,
    'ask_price1': 2105.5, 'ask_volume1': 90,
    # ...
}
result = service.on_tick(tick_data)
print(result)
```

## 配置参数

### 在线配置（推荐）

在订单流页面点击"参数配置"按钮，实时修改参数：

- **VPIN成交桶大小**：10-500手（默认50）
- **大单回看窗口**：10-500笔（默认100）
- **大单阈值倍数**：1.5-10倍（默认2.5）
- **订单簿历史记录**：100-5000次（默认1000）

配置立即生效，无需重启。

### API配置

```bash
# 获取当前配置
curl http://localhost:8000/api/order-flow/config

# 更新配置
curl -X POST http://localhost:8000/api/order-flow/config \
  -H "Content-Type: application/json" \
  -d '{
    "vpin": {"bucket_size": 40},
    "large_order": {"lookback": 80, "threshold_multiplier": 3.0},
    "orderbook": {"max_history": 800}
  }'
```

### 代码配置（初始化）

所有参数在 `src/data/order_flow_v2.py` 和 `src/data/order_flow_service.py` 中定义：

```python
# VPIN
bucket_size = 50  # 成交桶大小（手）

# 大单检测
lookback = 100  # 回看窗口（笔）
threshold_multiplier = 2.5  # 大单阈值倍数

# 订单簿
max_history = 1000  # 最大历史记录数
```

## 最佳实践

1. **不要单独使用订单流指标** - 结合K线、技术指标、市场态势综合判断
2. **注意市场流动性** - 流动性差时订单流信号不可靠
3. **区分日内和隔夜** - 开盘前后订单流会有明显变化
4. **关注持续性** - 单次大单不足为凭，连续信号更可靠
5. **设置告警阈值** - 高VPIN时谨慎开仓，考虑减仓或止损

## 参数调优建议

### 市场清淡时
- ✅ 降低 `bucket_size` (30-40手) - 更敏感
- ✅ 降低 `threshold_multiplier` (2.0) - 更容易触发大单

### 市场活跃时
- ✅ 提高 `bucket_size` (60-80手) - 降低噪音
- ✅ 提高 `threshold_multiplier` (3.0-4.0) - 只关注超大单

### 内存受限时
- ✅ 降低 `max_history` (500-700) - 减少内存占用
- ⚠️ 可能影响深度变化率计算精度

## 进阶功能

- [x] 在线参数配置
- [ ] VPIN趋势线（rising/falling/stable）
- [ ] 订单簿压力区域可视化
- [ ] 大单热力图
- [ ] 知情交易者画像
- [ ] 订单流与价格偏离度
- [ ] 自适应大单阈值
