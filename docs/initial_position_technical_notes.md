# 初始持仓功能 - 技术说明

## 问题修复记录

### 修复1: 浮动盈亏计算Fallback机制

**问题**: 在回测开始时设置初始持仓后，TqSDK的 `float_profit_long` 或 `float_profit_short` 可能为 `None`，导致警告日志：
```
WARNING | TqSDK 多头持仓浮动盈亏为 None，可能数据有问题
```

**原因**: TqSDK在持仓刚建立时，浮动盈亏数据需要几个更新周期才能完全初始化。

**解决方案**: 添加手工计算作为fallback机制

#### 修改位置
`src/backtest/engines/llm_engine.py` - `_build_enhanced_prompt()` 方法

#### 修改内容
```python
# 原逻辑：仅依赖TqSDK数据，为None时报警告并设为0
if tq_pos_pnl_long is not None:
    float_pnl = tq_pos_pnl_long
else:
    logger.warning(f"TqSDK 多头持仓浮动盈亏为 None，可能数据有问题")
    float_pnl = 0.0

# 新逻辑：TqSDK数据为None时自动fallback到手工计算
if tq_pos_pnl_long is not None:
    float_pnl = tq_pos_pnl_long
else:
    # Fallback: 手工计算多头盈亏
    price_diff = current_price - entry_price
    float_pnl = price_diff * contract_multiplier * qty
    logger.debug(f"TqSDK多头浮动盈亏为None，使用手工计算: {float_pnl:.2f}")
```

#### 计算公式
- **多头盈亏**: `(当前价 - 开仓价) × 合约乘数 × 手数`
- **空头盈亏**: `(开仓价 - 当前价) × 合约乘数 × 手数`

### 修复2: 初始持仓建立等待机制优化

**问题**: 使用固定的5次 `wait_update()` 可能不足以让TqSDK完全建立持仓。

**解决方案**: 改为主动检查持仓状态，最多等待10次更新。

#### 修改位置
`src/backtest/core/backtester.py` - `run_tqsdk()` 方法

#### 修改内容
```python
# 原逻辑：固定等待5次
for _ in range(5):
    api.wait_update()

# 新逻辑：检查持仓确认，最多等待10次
max_wait_attempts = 10
for attempt in range(max_wait_attempts):
    api.wait_update()
    current_pos = position.pos_long - position.pos_short
    if current_pos == self.cfg.initial_position:
        logger.debug(f"初始持仓已确认: {current_pos}手")
        break
else:
    logger.warning(f"等待初始持仓建立超时...")
```

## 技术实现细节

### 1. 盈亏数据来源优先级

AI在分析持仓时，按以下优先级获取浮动盈亏数据：

1. **TqSDK持仓级盈亏** (最优先)
   - `position.float_profit_long` (多头)
   - `position.float_profit_short` (空头)

2. **手工计算盈亏** (Fallback 1)
   - 基于价差 × 合约乘数 × 手数
   - 在TqSDK数据为None时自动使用

3. **TqSDK账户级盈亏** (Fallback 2)
   - `account.float_profit`
   - 仅在无持仓时使用

4. **零盈亏** (最后Fallback)
   - 当所有数据源都不可用时

### 2. 初始持仓注入流程

```
设置初始持仓
    ↓
target_pos_task.set_target_volume(initial_position)
    ↓
等待并验证持仓建立 (最多10次wait_update)
    ↓
检查: position.pos_long - position.pos_short == initial_position
    ↓
注入到engine.current_pos (Position对象)
    ↓
每个决策周期前同步持仓状态到snapshot
    ↓
LLM引擎从snapshot提取盈亏数据
    ↓
如果为None，触发手工计算fallback
```

### 3. 日志级别说明

- **DEBUG**: 手工计算fallback时的详细计算过程
- **INFO**: 初始持仓建立确认
- **WARNING**: 持仓建立超时或所有数据源都不可用

### 4. 为什么需要Fallback？

TqSDK在回测模式下，持仓数据有以下特点：

1. **异步更新**: 持仓建立后需要几个tick才能完全初始化
2. **数据延迟**: 特别是在回测开始的第一根K线时
3. **字段初始值**: `float_profit_long/short` 初始可能为 `None` 或 `nan`

手工计算fallback确保：
- ✅ 即使TqSDK数据未就绪，AI也能看到合理的盈亏估算
- ✅ 避免误导性的"盈亏为0"或警告信息
- ✅ 在数据就绪后自动切换回TqSDK官方数据

## 测试建议

### 验证Fallback机制
```bash
# 测试初始持仓的盈亏计算
python src\backtest\llm_decision_backtest.py \
    --start 2024-09-01 \
    --end 2024-09-02 \
    --initial-position 2 \
    --entry-price 5000 \
    --debug \
    --show_rationale
```

查看日志中的：
- "初始持仓已确认" - 确认持仓建立成功
- "使用手工计算" (DEBUG级别) - 确认fallback机制工作
- AI决策中的盈亏信息 - 确认数据传递正确

### 对比验证
```bash
# 测试1: 无初始持仓（基准）
python src\backtest\llm_decision_backtest.py --start 2024-09-01 --end 2024-10-31

# 测试2: 有初始持仓（对比）
python src\backtest\llm_decision_backtest.py --start 2024-09-01 --end 2024-10-31 --initial-position 2 --entry-price 5000
```

对比两次回测的：
- 初始权益
- AI决策差异
- 最终收益

## 已知限制

1. **回测模式专用**: 手工计算fallback主要用于回测场景，实盘时TqSDK数据应该总是可用
2. **简化计算**: 手工计算不考虑手续费、滑点等，仅作为盈亏估算参考
3. **单向持仓**: 不支持同时持有多空（期货交易的通用限制）

## 性能考虑

- 手工计算fallback的性能开销极小（简单算术运算）
- 初始持仓等待最多增加10次 `wait_update()`，约增加1-2秒启动时间
- 对整体回测性能影响可忽略不计

## 未来改进方向

1. **自适应等待**: 根据TqSDK响应速度动态调整等待次数
2. **更精确的手工计算**: 考虑滑点、手续费等因素
3. **多持仓支持**: 如果业务需求扩展到多品种组合
4. **持仓校验**: 定期校验TqSDK持仓与内部记录的一致性
