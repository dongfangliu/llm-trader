# 市场态势计算服务 (Market Regime Service)

## 概述

市场态势计算服务是V2架构的核心组件，负责实时识别市场状态并推荐交易策略。

### 核心特性

✅ **实时计算**：纯量化算法，<100ms响应
✅ **无数据库依赖**：内存计算，无I/O阻塞
✅ **无LLM参与**：确定性规则，可回测可优化
✅ **自适应触发**：定时 + 事件双重触发机制
✅ **WebSocket推送**：状态改变时立即推送前端
✅ **参数可配置**：前端可调整计算参数

---

## 市场状态分类

系统识别4种市场状态：

| 状态 | 英文 | 条件 | 推荐策略 |
|------|------|------|---------|
| **趋势市** | trend | ADX > 25 且趋势一致性 > 0.7 | 趋势跟踪 (Trend Following) |
| **震荡市** | ranging | ADX < 20 且布林带宽度 < 0.03 | 均值回归 (Mean Reversion) |
| **突破市** | breakout | ADX 20-30 且波动率适中 | 突破策略 (Breakout) |
| **异常市** | abnormal | ATR > 5% 或波动率 > 0.05 | 保守策略 (Conservative) |

---

## 计算触发机制

### 1. 定时触发（默认15分钟）

```yaml
market_regime:
  periodic_interval: 900  # 15分钟（秒）
```

### 2. 事件触发

满足任一条件立即重算：

| 触发条件 | 默认阈值 | 说明 |
|---------|---------|------|
| 价格变动 | 0.5% | 价格相对10个tick前变化超过阈值 |
| 成交量突增 | 2倍 | 当前成交量超过最近10个tick平均值的2倍 |
| ADX变化 | 5点 | ADX相对上次计算变化超过5点 |

### 3. 手动触发

前端点击"刷新"按钮立即重算（可选忽略冷却期）。

---

## 防抖机制

为避免频繁切换状态，设置**冷却期**（默认5分钟）：

```yaml
market_regime:
  regime_switch_cooldown: 300  # 5分钟（秒）
```

状态切换后5分钟内不会再次切换（手动强制触发除外）。

---

## 技术指标计算

### 1. ADX (趋势强度)

简化版ADX基于方向运动比例：

```python
up_moves = max(price_changes, 0)
down_moves = abs(min(price_changes, 0))
directional_ratio = |up_moves - down_moves| / (up_moves + down_moves)
ADX = directional_ratio × 50
```

### 2. ATR (波动率)

简化版ATR使用价格变化的平均值：

```python
true_ranges = abs(diff(prices))
ATR = mean(true_ranges[-14:])
```

### 3. 布林带宽度

```python
bb_width = (2 × std(prices)) / mean(prices)
```

### 4. 趋势一致性

检查多周期均线的排列：

```python
ma5 = mean(prices[-5:])
ma20 = mean(prices[-20:])
ma60 = mean(prices[-60:])

if price > ma5 > ma20 > ma60:
    trend_alignment = 0.9  # 强上升趋势
elif price < ma5 < ma20 < ma60:
    trend_alignment = 0.9  # 强下降趋势
else:
    trend_alignment = 0.5  # 无明显趋势
```

---

## API 端点

### 1. 获取当前市场状态

```http
GET /api/market-regime/current
```

响应示例：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "regime": "trend",
    "confidence": 0.85,
    "features": {
      "adx": 32.5,
      "atr": 12.3,
      "volatility": 0.023,
      "bollinger_width": 0.035,
      "trend_alignment": 0.9
    },
    "active_strategy": "trend_following",
    "duration_minutes": 45,
    "timestamp": "2025-10-23T12:00:00",
    "trigger_reason": "price_change"
  }
}
```

### 2. 强制重新计算

```http
POST /api/market-regime/recalculate?force=true
```

参数：
- `force` (boolean): 是否忽略冷却期，默认false

### 3. 获取配置

```http
GET /api/market-regime/config
```

### 4. 更新配置

```http
POST /api/market-regime/config

{
  "periodic_interval": 600,
  "triggers": {
    "price_change_threshold": 0.01
  }
}
```

---

## 前端使用

### 1. 市场态势面板

位置：`Dashboard > MarketRegimePanel`

功能：
- 显示当前市场状态和置信度
- 展示技术指标（ADX、ATR、趋势一致性）
- 显示激活策略和持续时间
- 刷新按钮（普通/强制）
- 配置按钮

### 2. 配置面板

可调整参数：
- 定时触发间隔（60-3600秒）
- 价格变动阈值（0.1%-10%）
- 成交量突增阈值（1-10倍）
- ADX变化阈值（1-20点）
- 状态切换冷却期（60-600秒）

### 3. WebSocket实时推送

前端监听WebSocket消息：

```typescript
{
  "type": "market_regime",
  "data": {
    "regime": "trend",
    "confidence": 0.85,
    ...
  }
}
```

状态改变时自动推送，前端无需轮询。

---

## 架构集成

### 数据流

```
TqSDK Tick数据
    ↓
RealtimePushService (后台线程)
    ↓
MarketRegimeService.on_tick()
    ↓
检查触发条件
    ├── 定时触发？
    ├── 价格变动？
    ├── 成交量突增？
    └── ADX变化？
    ↓
计算市场态势（<100ms）
    ↓
状态改变？
    ├── 是 → WebSocket推送
    └── 否 → 跳过
```

### 初始化流程

1. `start_web_v2.py` 启动FastAPI服务
2. `RealtimePushService` 初始化TqSDK连接
3. `MarketRegimeService` 单例初始化
4. 从TqSDK加载历史K线（200根）
5. 用历史K线初始化`price_history`缓冲区
6. 开始接收实时tick数据
7. 根据触发条件自动计算市场状态

---

## 配置文件

`config/trading_params.yaml`：

```yaml
market_regime:
  # 定时触发（秒）
  periodic_interval: 900  # 15分钟
  
  # 事件触发阈值
  triggers:
    price_change_threshold: 0.005  # 0.5% 价格变动
    volume_spike_threshold: 2.0    # 2倍成交量突增
    adx_change_threshold: 5.0      # 5点 ADX变化
  
  # 技术指标计算周期
  lookback_periods:
    adx_period: 14
    atr_period: 14
    ma_periods: [5, 20, 60]
  
  # 状态切换防抖（秒）
  regime_switch_cooldown: 300  # 5分钟
```

---

## 性能指标

| 指标 | 目标 | 实测 |
|------|------|------|
| 计算耗时 | < 100ms | ~10-30ms |
| 内存占用 | < 50MB | ~20MB |
| 触发频率 | 3-5次/小时 | 取决于市场波动 |
| WebSocket延迟 | < 100ms | ~10-50ms |

---

## 调试与监控

### 日志

```python
logger.info("⏰ 定时触发：已过900秒")
logger.info("📈 价格变动触发重算")
logger.info("⚡ 市场态势计算完成，耗时 25.3ms")
logger.info("🔄 市场状态切换: ranging → trend (置信度: 85%)")
logger.debug("📡 市场态势已通过WebSocket推送")
```

### 诊断脚本

```bash
# 测试服务是否正常
curl http://localhost:8000/api/market-regime/current

# 强制触发重算
curl -X POST http://localhost:8000/api/market-regime/recalculate?force=true

# 查看配置
curl http://localhost:8000/api/market-regime/config
```

---

## 未来扩展

### Phase 1（已完成）
- ✅ 基础市场状态识别
- ✅ 自适应触发机制
- ✅ WebSocket实时推送
- ✅ 前端配置界面

### Phase 2（计划中）
- ⏳ 更精确的ADX计算（使用TA-Lib）
- ⏳ 订单流数据集成（VPIN、订单簿深度）
- ⏳ 多周期趋势一致性分析
- ⏳ 历史状态切换记录

### Phase 3（待定）
- ⏳ 机器学习优化触发阈值
- ⏳ 回测框架集成
- ⏳ 性能监控面板

---

## 常见问题

### Q: 为什么不用数据库？

A: 市场态势计算需要实时响应（<100ms），数据库I/O会增加延迟。内存计算更快，且状态数据量小（<1KB）。

### Q: 为什么不用LLM？

A: 市场状态识别是确定性问题，量化规则已经足够准确且快速。LLM推理需要3-5秒，不适合实时计算。

### Q: 如何避免频繁切换状态？

A: 使用冷却期机制（默认5分钟）。状态切换后的5分钟内不会再次切换，除非手动强制触发。

### Q: 如何调整计算频率？

A: 在前端配置面板调整`periodic_interval`（定时触发间隔）和各种事件触发阈值。

### Q: 数据不足怎么办？

A: 系统启动时会从TqSDK加载200根1分钟K线作为初始数据。如果数据仍不足，会返回`unknown`状态。

---

## 参考资料

- 设计文档：`docs/QUANT_EXPERT_SYSTEM_DESIGN.md`
- 源代码：`src/strategy/market_regime_service.py`
- API实现：`web_v2/server/api/market_regime.py`
- 前端组件：`web_v2/frontend/src/components/Dashboard/MarketRegimePanel.tsx`
