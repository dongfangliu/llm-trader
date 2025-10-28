# 订单流实时计算架构

## 概述

订单流分析已从**基于数据库的轮询模式**重构为**基于实时Tick数据的WebSocket推送模式**，实现真正的实时计算和推送。

## 架构变更

### 旧架构（已弃用）
```
前端轮询(2s) → API端点 → 数据库查询 → 返回历史数据
```
问题：
- ❌ 延迟高（2秒轮询间隔）
- ❌ 数据库读写压力大
- ❌ 无法捕捉瞬时市场变化
- ❌ 需要维护额外的数据表

### 新架构（当前）
```
TqSDK Tick事件 → OrderFlowService计算 → WebSocket推送 → 前端实时更新
```
优势：
- ✅ 毫秒级延迟（事件驱动）
- ✅ 零数据库压力（内存计算）
- ✅ 捕捉所有市场变化
- ✅ 简化数据流

## 核心组件

### 1. OrderFlowService (`src/data/order_flow_service.py`)
实时订单流分析服务，基于Tick数据计算：

**功能模块：**
- **VPIN计算器** (`OrderFlowToxicity`)
  - 按成交量分桶（默认50手/桶）
  - 计算买卖失衡度
  - 输出毒性等级（low/medium/high）

- **订单簿追踪器** (`OrderBookDynamics`)
  - 监控五档盘口深度
  - 计算深度变化率
  - 识别买卖压力

- **大单检测器** (`LargeOrderDetector`)
  - 基于移动平均识别异常大单
  - 阈值：平均成交量的2.5倍
  - 实时记录大单列表

**数据流：**
```python
tick_data → on_tick() → {
    'vpin': {...},
    'orderbook': {...},
    'large_order': {...}  # 如果检测到大单
}
```

### 2. RealtimePushService集成 (`web_v2/server/services/realtime_push_service.py`)

订单流服务已集成到实时推送服务中：

```python
def _push_quote_update(self):
    # ... 处理Tick数据
    
    # 计算订单流
    if self.order_flow_service:
        order_flow_data = self.order_flow_service.on_tick(data)
    
    # WebSocket推送
    if order_flow_data:
        order_flow_message = {
            'type': 'order_flow',
            'data': order_flow_data
        }
        asyncio.run_coroutine_threadsafe(
            self.ws_manager.broadcast(order_flow_message),
            self.event_loop
        )
```

### 3. API端点简化 (`web_v2/server/api/order_flow.py`)

所有API端点从推送服务的内存缓存读取数据：

```python
@router.get("/vpin/current")
async def get_current_vpin():
    push_service = bridge.get_push_service()
    vpin_data = push_service.get_order_flow_vpin()
    return StandardResponse(data=vpin_data)

@router.get("/orderbook/snapshot")
async def get_orderbook_snapshot():
    push_service = bridge.get_push_service()
    orderbook_data = push_service.get_order_flow_orderbook()
    return StandardResponse(data=orderbook_data)

@router.get("/large-orders")
async def get_large_orders(count: int = 20):
    push_service = bridge.get_push_service()
    large_orders_data = push_service.get_order_flow_large_orders(count)
    return StandardResponse(data=large_orders_data)
```

### 4. 前端WebSocket订阅 (`web_v2/frontend/src/pages/OrderFlow.tsx`)

前端监听`order_flow`类型的WebSocket消息：

```typescript
ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    
    if (message.type === 'order_flow') {
        const data = message.data;
        
        // 更新VPIN
        if (data.vpin) {
            setVpinData({...});
        }
        
        // 更新订单簿
        if (data.orderbook) {
            const levels = buildOrderBookLevels(data.orderbook);
            setOrderBook(levels);
        }
        
        // 更新大单
        if (data.large_order) {
            setLargeOrders(prev => [data.large_order, ...prev.slice(0, 19)]);
        }
    }
};
```

## 计算逻辑详解

### 1. VPIN（订单流毒性）

**计算步骤：**
1. 判断成交方向（基于价格变化和盘口位置）
2. 累积到体积桶（默认50手）
3. 桶满后计算失衡度：`|买量 - 卖量| / 总量`
4. VPIN = 最近10个桶的平均失衡度

**毒性等级：**
- `< 0.3`: 低毒性 → 市场健康，流动性交易为主
- `0.3-0.6`: 中毒性 → 存在知情交易，需谨慎
- `≥ 0.6`: 高毒性 → 大量知情交易，警惕反转

### 2. 订单簿深度动态

**监控指标：**
- `bid_depth`: 买盘前5档总量
- `ask_depth`: 卖盘前5档总量
- `imbalance`: `(bid_depth - ask_depth) / (bid_depth + ask_depth)`
- `depth_ratio`: `bid_depth / ask_depth`

**变化率计算：**
- 保留最近1000次深度更新
- 取最近20次计算变化率
- `bid_depth_change_rate = (最新 - 最早) / 最早`

**解读规则：**
```python
if bid_rate > 0.2 and accel > 0.1:
    return "买盘快速堆积，可能是支撑或大资金吸筹"
elif ask_rate > 0.2 and accel < -0.1:
    return "卖盘快速堆积，可能是压力或大资金派发"
elif bid_rate < -0.2:
    return "买盘快速撤离，支撑可能虚假，警惕下跌"
# ...
```

### 3. 大单检测

**检测逻辑：**
1. 维护最近100笔成交的滑动窗口
2. 计算平均成交量
3. 当前成交量 ≥ 平均值 × 2.5 → 大单

**输出信息：**
```python
{
    'timestamp': '2025-10-23T14:19:17.418',
    'direction': 'buy',
    'price': 2105.5,
    'volume': 125,
    'avg_volume': 50.2,
    'multiplier': 2.49  # 倍数
}
```

## 数据格式

### WebSocket推送消息格式

```json
{
  "type": "order_flow",
  "data": {
    "vpin": {
      "vpin": 0.35,
      "level": "medium",
      "description": "订单流毒性中等...",
      "buy_volume": 120,
      "sell_volume": 80,
      "imbalance": 20.0,
      "timestamp": "2025-10-23T14:19:17.418"
    },
    "orderbook": {
      "bid_depth": 500,
      "ask_depth": 450,
      "imbalance": 0.053,
      "depth_ratio": 1.11,
      "timestamp": "2025-10-23T14:19:17.418",
      "bids": [
        {"price": 2105.5, "volume": 100},
        {"price": 2105.0, "volume": 90},
        ...
      ],
      "asks": [
        {"price": 2106.0, "volume": 95},
        {"price": 2106.5, "volume": 85},
        ...
      ]
    },
    "large_order": {  // 仅在检测到大单时出现
      "timestamp": "2025-10-23T14:19:17.418",
      "direction": "buy",
      "price": 2105.5,
      "volume": 125,
      "avg_volume": 50.2,
      "multiplier": 2.49
    }
  }
}
```

### API响应格式

**GET /order-flow/vpin/current**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "vpin": 0.35,
    "level": "medium",
    "description": "订单流毒性中等...",
    "buy_volume": 120,
    "sell_volume": 80,
    "imbalance": 20.0,
    "timestamp": "2025-10-23T14:19:17.418"
  }
}
```

**GET /order-flow/orderbook/snapshot**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "bid_depth": 500,
    "ask_depth": 450,
    "imbalance": 0.053,
    "depth_ratio": 1.11,
    "bids": [...],
    "asks": [...],
    "timestamp": "2025-10-23T14:19:17.418"
  }
}
```

**GET /order-flow/large-orders?count=20**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "orders": [
      {
        "timestamp": "2025-10-23T14:19:17.418",
        "direction": "buy",
        "price": 2105.5,
        "volume": 125,
        "avg_volume": 50.2,
        "multiplier": 2.49
      },
      ...
    ],
    "count": 15
  }
}
```

**GET /order-flow/orderbook/dynamics**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "bid_depth_change_rate": 0.058,
    "ask_depth_change_rate": 0.068,
    "imbalance_acceleration": -0.005,
    "interpretation": "盘口相对稳定"
  }
}
```

## 性能优化

### 1. 内存管理
- VPIN桶：最多保留50个（约2500手成交量）
- 订单簿历史：最多保留1000次更新
- 大单记录：最多保留100笔

### 2. 计算优化
- 使用`deque`实现O(1)的添加和删除
- 只在数据变化时计算，避免重复计算
- 使用缓存减少重复序列化

### 3. WebSocket推送策略
- 只在有新数据时推送
- VPIN和订单簿每次Tick都推送
- 大单仅在检测到时推送（低频）

## 测试

运行测试：
```bash
python tests/test_order_flow_realtime.py
```

测试覆盖：
- ✅ OrderFlowService初始化
- ✅ Tick数据处理
- ✅ VPIN计算
- ✅ 订单簿追踪
- ✅ 大单检测
- ✅ 动态分析

## 迁移注意事项

### 已废弃的功能
- ❌ VPIN历史数据API (`/vpin/history`)
- ❌ 订单簿历史数据API（基于数据库查询的版本）
- ❌ 数据库表：`vpin_history`, `order_book_snapshots`, `large_orders`

### 新增功能
- ✅ 实时WebSocket推送
- ✅ 内存缓存访问
- ✅ 更低延迟（毫秒级）
- ✅ 更精准的实时计算

### 数据持久化（可选）
如果需要历史数据分析，可以在订单流服务中添加数据库写入逻辑：
```python
def on_tick(self, tick_data: Dict) -> Dict:
    result = # ... 计算
    
    # 可选：异步写入数据库
    if self.enable_persistence:
        asyncio.create_task(self._save_to_db(result))
    
    return result
```

## 总结

订单流分析的重构实现了：
1. **真正的实时性** - 从Tick事件到前端展示的端到端实时链路
2. **更高的性能** - 内存计算，零数据库延迟
3. **更简洁的架构** - 减少中间层，降低维护成本
4. **更准确的数据** - 捕捉每一个市场变化，无遗漏

这个架构符合高频交易系统的设计理念，为后续的策略优化和风控提供了坚实的数据基础。
