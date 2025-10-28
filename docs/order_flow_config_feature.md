# 订单流在线配置功能说明

## 功能概述

新增订单流参数在线配置功能，允许用户通过前端界面或API实时调整VPIN、大单检测、订单簿等参数，无需重启系统。

## 新增文件

### 前端
- `web_v2/frontend/src/components/OrderFlow/ConfigPanel.tsx` - 配置面板组件

### 测试
- `tests/test_order_flow_config.py` - 配置API测试脚本

### 文档
- `docs/order_flow_config_guide.md` - 完整配置指南

## 修改文件

### 后端API
- `web_v2/server/api/order_flow.py`
  - ✅ 新增 `GET /api/order-flow/config` - 获取当前配置
  - ✅ 新增 `POST /api/order-flow/config` - 更新配置

### 前端页面
- `web_v2/frontend/src/pages/OrderFlow.tsx`
  - ✅ 添加"参数配置"按钮
  - ✅ 集成ConfigPanel组件
  - ✅ 使用Drawer显示配置面板

## 功能特性

### 1. 可配置参数

| 分类 | 参数 | 范围 | 默认值 | 说明 |
|------|------|------|--------|------|
| **VPIN** | bucket_size | 10-500 | 50 | 成交桶大小（手） |
| **大单检测** | lookback | 10-500 | 100 | 回看窗口（笔） |
| **大单检测** | threshold_multiplier | 1.5-10.0 | 2.5 | 大单阈值倍数 |
| **订单簿** | max_history | 100-5000 | 1000 | 历史记录数（次） |

### 2. 配置界面

**位置**：订单流Tab → 右上角"参数配置"按钮

**功能**：
- ✅ 实时显示当前参数值
- ✅ 参数输入验证（范围检查）
- ✅ 提示信息（Tooltip说明每个参数）
- ✅ 保存、恢复、重置按钮
- ✅ 操作提示和说明

**界面截图示意：**
```
┌─────────────────────────────────┐
│  订单流参数配置            [刷新] │
├─────────────────────────────────┤
│  VPIN（订单流毒性）              │
│  ┌───────────────────────────┐  │
│  │ 成交桶大小（手） ⓘ        │  │
│  │ [50        ] 手           │  │
│  └───────────────────────────┘  │
│                                  │
│  大单检测                        │
│  ┌───────────────────────────┐  │
│  │ 回看窗口（笔） ⓘ          │  │
│  │ [100       ] 笔           │  │
│  ├───────────────────────────┤  │
│  │ 大单阈值倍数 ⓘ            │  │
│  │ [2.5       ] 倍           │  │
│  └───────────────────────────┘  │
│                                  │
│  订单簿深度                      │
│  ┌───────────────────────────┐  │
│  │ 历史记录数 ⓘ              │  │
│  │ [1000      ] 次           │  │
│  └───────────────────────────┘  │
│                                  │
│  [保存配置] [恢复] [重置默认]   │
│                                  │
│  提示：                          │
│  • 配置立即生效，无需重启        │
│  • 建议在市场清淡时调整          │
└─────────────────────────────────┘
```

### 3. API端点

#### 获取配置
```bash
GET /api/order-flow/config

Response:
{
  "code": 0,
  "message": "success",
  "data": {
    "vpin": {"bucket_size": 50},
    "large_order": {"lookback": 100, "threshold_multiplier": 2.5},
    "orderbook": {"max_history": 1000}
  }
}
```

#### 更新配置
```bash
POST /api/order-flow/config
Content-Type: application/json

{
  "vpin": {"bucket_size": 40},
  "large_order": {"lookback": 80, "threshold_multiplier": 3.0},
  "orderbook": {"max_history": 800}
}

Response:
{
  "code": 0,
  "message": "success",
  "data": {
    "success": true,
    "message": "配置已更新并立即生效",
    "current_config": {...}
  }
}
```

## 使用方法

### 方法1：前端界面（推荐）

1. 启动系统：`python start_web_v2.py`
2. 打开浏览器访问：`http://localhost:8000`
3. 切换到"订单流"Tab
4. 点击右上角"参数配置"按钮
5. 调整参数并点击"保存配置"

### 方法2：API调用

```python
import requests

# 更新配置
config = {
    "vpin": {"bucket_size": 40},
    "large_order": {
        "lookback": 80,
        "threshold_multiplier": 3.0
    }
}

response = requests.post(
    "http://localhost:8000/api/order-flow/config",
    json=config
)

print(response.json())
```

### 方法3：命令行测试

```bash
# 运行测试脚本
python tests/test_order_flow_config.py
```

## 配置效果

### 立即生效
- ✅ 配置更新后，下一个Tick数据立即使用新参数
- ✅ 无需重启任何服务
- ✅ WebSocket连接保持不断

### 参数影响

**bucket_size（成交桶大小）**
- 减小 → VPIN更新更频繁，更敏感
- 增大 → VPIN更新更稳定，过滤噪音

**threshold_multiplier（大单阈值）**
- 减小 → 更多交易被识别为大单
- 增大 → 只识别超大单，严格筛选

**lookback（回看窗口）**
- 减小 → 快速适应成交量变化
- 增大 → 更稳定的基线

**max_history（历史记录）**
- 减小 → 节省内存，变化率精度降低
- 增大 → 更精准的变化率计算

## 场景化配置

### 日内短线
```json
{
  "vpin": {"bucket_size": 30},
  "large_order": {"lookback": 50, "threshold_multiplier": 2.0}
}
```
高敏感度，快速响应

### 趋势跟随
```json
{
  "vpin": {"bucket_size": 80},
  "large_order": {"lookback": 150, "threshold_multiplier": 3.5}
}
```
稳定信号，过滤噪音

### 大单监控
```json
{
  "vpin": {"bucket_size": 50},
  "large_order": {"lookback": 100, "threshold_multiplier": 4.0}
}
```
专注超大单

## 技术实现

### 后端实现
```python
# 获取订单流服务实例
push_service = bridge.get_push_service()
service = push_service.order_flow_service

# 更新参数（立即生效）
service.vpin_calculator.bucket_size = 40
service.large_order_detector.threshold_multiplier = 3.0

# 重建deque（保留现有数据）
from collections import deque
service.large_order_detector.recent_trades = deque(
    service.large_order_detector.recent_trades,
    maxlen=80
)
```

### 前端实现
```typescript
// ConfigPanel组件
const handleSave = async () => {
  const config = {...};
  
  const response = await fetch('/api/order-flow/config', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(config)
  });
  
  if (response.ok) {
    message.success('配置已保存并生效');
  }
};
```

## 测试验证

### 单元测试
```bash
python tests/test_order_flow_config.py
```

**测试覆盖：**
- ✅ 获取当前配置
- ✅ 更新有效配置
- ✅ 无效配置拒绝（范围检查）
- ✅ 部分更新支持
- ✅ 配置持久性验证

### 集成测试
1. 启动系统
2. 打开订单流配置面板
3. 修改参数并保存
4. 观察VPIN和大单检测效果
5. 验证参数已生效

## 注意事项

### ⚠️ 配置不持久化
- 配置仅在运行时生效
- 系统重启后恢复默认值
- 如需持久化，需修改代码默认值

### ⚠️ 历史数据不重算
- 配置更新只影响新数据
- 历史VPIN/大单不会重新计算
- 建议在数据少时调整参数

### ⚠️ 参数范围限制
- 超出范围的配置会被拒绝
- 返回HTTP 400错误
- 原配置保持不变

### ⚠️ 多客户端冲突
- 后更新的配置覆盖先更新的
- 建议团队协调配置管理
- 考虑实现配置锁或版本控制

## 最佳实践

1. **小步调整** - 每次只改1-2个参数
2. **观察效果** - 调整后观察指标变化
3. **记录方案** - 记录有效的配置
4. **定期复盘** - 根据市场调整策略
5. **测试先行** - 在模拟环境测试

## 未来扩展

- [ ] 配置持久化（保存到文件/数据库）
- [ ] 配置历史记录和回滚
- [ ] 预设配置方案（一键切换）
- [ ] 配置推荐（AI自动调优）
- [ ] 配置分享（团队协作）
- [ ] 配置对比（A/B测试）

## 相关文档

- 详细指南：`docs/order_flow_config_guide.md`
- 快速参考：`docs/order_flow_quick_reference.md`
- 架构文档：`docs/order_flow_realtime_architecture.md`

## 总结

订单流在线配置功能让参数调优变得简单高效：
- ✅ 前端界面友好，操作直观
- ✅ 立即生效，无需重启
- ✅ 参数验证严格，防止误配
- ✅ API支持，便于自动化
- ✅ 场景化方案，开箱即用

这个功能极大提升了订单流分析的灵活性和实用性！🚀
