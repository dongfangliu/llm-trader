# 订单流参数配置指南

## 概述

订单流参数现在支持**在线实时配置**，无需重启系统。通过前端界面或API端点即可动态调整VPIN、大单检测、订单簿等参数。

## 配置方式

### 1. 前端界面配置（推荐）

**步骤：**
1. 打开订单流Tab
2. 点击右上角"参数配置"按钮
3. 在配置面板中调整参数
4. 点击"保存配置"立即生效

**优势：**
- ✅ 可视化界面，直观易用
- ✅ 参数验证和提示
- ✅ 实时预览参数范围
- ✅ 一键恢复和重置

### 2. API配置

**获取当前配置：**
```bash
curl http://localhost:8000/api/order-flow/config
```

**响应示例：**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "vpin": {
      "bucket_size": 50
    },
    "large_order": {
      "lookback": 100,
      "threshold_multiplier": 2.5
    },
    "orderbook": {
      "max_history": 1000
    }
  }
}
```

**更新配置：**
```bash
curl -X POST http://localhost:8000/api/order-flow/config \
  -H "Content-Type: application/json" \
  -d '{
    "vpin": {"bucket_size": 40},
    "large_order": {"lookback": 80, "threshold_multiplier": 3.0},
    "orderbook": {"max_history": 800}
  }'
```

**响应示例：**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "success": true,
    "message": "配置已更新并立即生效",
    "current_config": {
      "vpin": {"bucket_size": 40},
      "large_order": {"lookback": 80, "threshold_multiplier": 3.0},
      "orderbook": {"max_history": 800}
    }
  }
}
```

### 3. Python脚本配置

```python
import requests

# 更新配置
config = {
    "vpin": {"bucket_size": 40},
    "large_order": {
        "lookback": 80,
        "threshold_multiplier": 3.0
    },
    "orderbook": {"max_history": 800}
}

response = requests.post(
    "http://localhost:8000/api/order-flow/config",
    json=config
)

print(response.json())
```

## 参数说明

### VPIN参数

#### bucket_size（成交桶大小）
- **类型**：整数（手）
- **范围**：10 - 500
- **默认值**：50
- **含义**：每个桶累积多少手成交量后计算一次失衡度
- **影响**：
  - **值越小** → 更敏感，更新频率高，但噪音大
  - **值越大** → 更稳定，过滤噪音，但反应慢

**调优建议：**
```
清淡市场：30-40（捕捉小资金动作）
正常市场：50-60（平衡灵敏度和稳定性）
活跃市场：70-100（过滤频繁波动）
```

### 大单检测参数

#### lookback（回看窗口）
- **类型**：整数（笔）
- **范围**：10 - 500
- **默认值**：100
- **含义**：用最近多少笔成交计算平均成交量
- **影响**：
  - **值越小** → 快速适应成交量变化，但容易误判
  - **值越大** → 稳定的基线，但反应慢

**调优建议：**
```
高频市场：50-70（快速适应）
正常市场：80-120（稳定基线）
低频市场：150-200（长期平均）
```

#### threshold_multiplier（大单阈值倍数）
- **类型**：浮点数
- **范围**：1.5 - 10.0
- **默认值**：2.5
- **含义**：成交量超过平均值的多少倍算大单
- **影响**：
  - **值越小** → 更容易触发，捕捉中等大单
  - **值越大** → 只捕捉超大单，严格筛选

**调优建议：**
```
关注所有异常：2.0-2.5
只关注大单：3.0-4.0
只关注超大单：5.0+
```

### 订单簿参数

#### max_history（历史记录数）
- **类型**：整数（次）
- **范围**：100 - 5000
- **默认值**：1000
- **含义**：保留多少次深度更新用于计算变化率
- **影响**：
  - **值越小** → 占用内存少，但计算精度低
  - **值越大** → 更精准的变化率，但占用内存多

**调优建议：**
```
内存受限：500-700
正常环境：800-1200
高精度需求：1500-2000
```

## 参数验证

所有参数在更新时会进行验证：

| 参数 | 最小值 | 最大值 | 错误信息 |
|------|--------|--------|----------|
| bucket_size | 10 | 500 | "bucket_size 范围: 10-500" |
| lookback | 10 | 500 | "lookback 范围: 10-500" |
| threshold_multiplier | 1.5 | 10.0 | "threshold_multiplier 范围: 1.5-10" |
| max_history | 100 | 5000 | "max_history 范围: 100-5000" |

无效配置会返回HTTP 400错误。

## 场景化配置方案

### 场景1：日内短线交易
```json
{
  "vpin": {"bucket_size": 30},
  "large_order": {
    "lookback": 50,
    "threshold_multiplier": 2.0
  },
  "orderbook": {"max_history": 800}
}
```
**特点**：高敏感度，快速响应，适合捕捉短期机会

### 场景2：趋势跟随
```json
{
  "vpin": {"bucket_size": 80},
  "large_order": {
    "lookback": 150,
    "threshold_multiplier": 3.5
  },
  "orderbook": {"max_history": 1500}
}
```
**特点**：稳定信号，过滤噪音，只关注主力资金

### 场景3：大单监控
```json
{
  "vpin": {"bucket_size": 50},
  "large_order": {
    "lookback": 100,
    "threshold_multiplier": 4.0
  },
  "orderbook": {"max_history": 1000}
}
```
**特点**：专注超大单，严格筛选，减少误报

### 场景4：高频交易
```json
{
  "vpin": {"bucket_size": 20},
  "large_order": {
    "lookback": 30,
    "threshold_multiplier": 1.8
  },
  "orderbook": {"max_history": 500}
}
```
**特点**：极高敏感度，快速反应，适合高频策略

## 实时生效机制

配置更新后**立即生效**，无需重启：

1. **VPIN桶大小** - 从下一个桶开始使用新值
2. **大单阈值** - 立即应用到后续成交
3. **回看窗口** - 重建deque，保留现有数据
4. **历史记录** - 重建deque，保留现有数据

**注意**：历史数据不会重新计算，只影响新数据。

## 监控配置效果

### 观察VPIN变化
```python
# 调整bucket_size后观察VPIN更新频率
# 更小的bucket_size → 更频繁的VPIN更新
```

### 观察大单检测
```python
# 调整threshold_multiplier后观察大单数量
# 更小的threshold → 更多大单被检测到
```

### 内存使用
```python
# max_history × 单次更新大小 ≈ 内存占用
# 1000次 × ~200字节 ≈ 200KB（可忽略）
```

## 测试配置

运行测试脚本验证配置功能：

```bash
python tests/test_order_flow_config.py
```

**测试内容：**
1. ✅ 获取当前配置
2. ✅ 更新配置
3. ✅ 验证配置已更新
4. ✅ 恢复默认配置
5. ✅ 无效配置处理

## 常见问题

### Q1: 配置多久生效？
A: **立即生效**。配置更新后，下一个Tick数据就会使用新参数。

### Q2: 配置会持久化吗？
A: **不会**。配置仅在运行时生效，重启后恢复默认值。如需持久化，请修改代码中的默认值。

### Q3: 能否回滚到之前的配置？
A: 前端界面支持"恢复"按钮，恢复到页面加载时的配置。API需要手动记录历史配置。

### Q4: 配置错误会怎样？
A: 返回HTTP 400错误，配置不会生效，原有配置保持不变。

### Q5: 多个客户端配置冲突？
A: 后更新的配置覆盖先更新的，建议团队协调配置管理。

## 最佳实践

1. **先测试再应用** - 在模拟环境测试参数效果
2. **小步调整** - 每次只调整1-2个参数，观察效果
3. **记录配置** - 记录有效的配置方案，便于复用
4. **监控指标** - 配置后观察VPIN、大单数量等指标
5. **定期复盘** - 根据市场变化调整参数策略

## 进阶技巧

### 自适应配置（手动）
```python
# 根据市场成交量自动调整bucket_size
avg_volume = get_average_volume()  # 获取平均成交量
bucket_size = max(30, min(100, avg_volume // 20))

update_config({"vpin": {"bucket_size": bucket_size}})
```

### A/B测试
```python
# 配置A：激进策略
config_a = {"large_order": {"threshold_multiplier": 2.0}}

# 配置B：保守策略
config_b = {"large_order": {"threshold_multiplier": 3.5}}

# 分时段测试效果
```

### 配置版本管理
```python
# 保存配置快照
configs = {
    "v1_default": {...},
    "v2_aggressive": {...},
    "v3_conservative": {...}
}

# 一键切换
apply_config(configs["v2_aggressive"])
```

## 总结

订单流参数配置功能提供了灵活的调优能力：
- ✅ 在线实时配置，立即生效
- ✅ 前端界面友好，API支持
- ✅ 参数验证严格，防止误配
- ✅ 场景化方案，开箱即用

通过合理调整参数，可以让订单流分析更好地适应不同市场环境和交易策略。
