# 回测模块 (Backtest Module)

## 概述

本模块实现了基于 TqSDK 原生回测功能的完整回测系统，支持事件驱动的历史数据模拟和真实的订单执行。

## 文件结构

```
backtest/
├── __init__.py           # 模块初始化
├── backtester.py         # TqSDK 回测引擎（核心）
├── performance.py        # 性能分析器
└── README.md            # 本文件
```

## 核心类

### TqBacktester (`backtester.py`)

基于 TqSDK 的事件驱动回测引擎。

**主要特性**:
- 使用 TqSDK 的 `BacktestFinished` 机制
- 事件驱动架构（`api.wait_update()`）
- 真实订单执行（`api.insert_order()`）
- 多时间框架支持（1m, 15m, 1h, 1d）
- 集成战略/战术决策层
- 自动盈亏计算

**使用示例**:
```python
from src.backtest.backtester import TqBacktester

backtester = TqBacktester(
    symbol='CZCE.SA601',
    start_date='2024-01-01',
    end_date='2024-01-31',
    initial_capital=50000,
    config=config,
    api_keys_config=api_keys
)

report = backtester.run()
```

### PerformanceAnalyzer (`performance.py`)

计算回测的各项性能指标。

**支持的指标**:
- 基础指标：总收益率、最终权益
- 交易统计：胜率、盈亏比、平均盈利/亏损
- 风险指标：最大回撤、夏普比率、Calmar比率
- 时间指标：平均持仓时间、最长持仓时间

**使用示例**:
```python
from src.backtest.performance import PerformanceAnalyzer

analyzer = PerformanceAnalyzer(
    initial_capital=50000,
    trades=all_trades,
    equity_curve=equity_curve
)

report = analyzer.generate_report()
analyzer.print_report(report)
```

## 工作流程

```
1. 初始化 TqBacktester
   ├─ 加载配置（合约、日期、资金）
   ├─ 初始化 TqSDK API（回测模式）
   ├─ 初始化决策层（战略/战术）
   └─ 初始化风控和性能追踪

2. 运行回测 (run())
   ├─ 订阅合约和 K线数据
   ├─ 进入主事件循环
   │   ├─ api.wait_update() - 等待 TqSDK 推送
   │   ├─ 记录权益曲线
   │   ├─ 战略决策（每4小时）
   │   ├─ 战术决策（每15分钟）
   │   └─ 风控检查（实时）
   └─ 捕获 BacktestFinished 异常

3. 生成报告
   ├─ PerformanceAnalyzer 分析
   ├─ 计算所有性能指标
   └─ 输出结果
```

## 关键方法

### `_init_tqsdk_api()`
初始化 TqSDK 回测环境。

**功能**:
- 创建 TqSim 模拟账户
- 创建 TqApi（回测模式）
- 设置回测时间范围

### `_run_strategic_decision()`
运行战略层决策（每N小时）。

**输入**:
- 日K线数据
- 小时K线数据

**输出**:
- 市场趋势判断（bullish/bearish/neutral）
- 关键价格位（支撑/阻力）

### `_run_tactical_decision()`
运行战术层决策（每N分钟）。

**输入**:
- 15分钟K线数据
- 1分钟K线数据
- 战略层结果
- 持仓信息
- 账户信息

**输出**:
- 具体交易动作（open_long/open_short/close/hold）
- 置信度
- 止损价

### `_execute_decision()`
执行交易决策。

**支持的操作**:
- 开多仓：`BUY + OPEN`
- 平多仓：`SELL + CLOSE`
- 开空仓：`SELL + OPEN`
- 平空仓：`BUY + CLOSE`

### `_run_risk_control()`
实时风控检查。

**检查项**:
- 止损触发（-500元）
- 最大持仓时间
- 其他风控规则

## 配置要求

### TqSDK 认证

**config/api_keys.yaml**:
```yaml
tqsdk:
  username: "your_username"
  password: "your_password"
```

### 交易参数

**config/trading_params.yaml**:
```yaml
trading:
  tqsdk_symbol: CZCE.SA601  # 合约代码

decision:
  strategic_interval_hours: 4
  tactical_interval_minutes: 15
  min_confidence: 70

risk:
  single_stop_loss: 500
  max_drawdown_percent: 10
  max_holding_hours: 8
```

## 性能报告格式

```python
{
    'initial_capital': 50000.00,
    'final_equity': 52450.00,
    'total_return': 4.90,       # %
    'max_drawdown': 2.30,        # %
    'sharpe_ratio': 1.85,
    'calmar_ratio': 2.13,
    'total_trades': 12,
    'win_trades': 7,
    'loss_trades': 5,
    'win_rate': 58.33,           # %
    'avg_win': 480.50,
    'avg_loss': -220.30,
    'largest_win': 850.00,
    'largest_loss': -450.00,
    'profit_factor': 1.65,
    'avg_hold_time_hours': 3.5,
    'max_hold_time_hours': 7.2
}
```

## 与旧系统对比

| 特性 | 旧系统 | 新系统 (TqSDK) |
|------|--------|----------------|
| 数据回放 | DataFrame 遍历 | TqSDK 事件驱动 |
| 订单执行 | MockExecutor | TqSDK API |
| 撮合引擎 | 简单模拟 | TqSDK 内置 |
| 盈亏计算 | 手动 | 自动 |
| 准确性 | 中等 | 高 |
| 维护成本 | 高 | 低 |

## 常见问题

### Q1: 回测需要网络连接吗？
**A**: 是的，即使是历史数据回测也需要连接 TqSDK 服务器。

### Q2: 回测会调用 LLM API 吗？
**A**: 是的，决策层会真实调用 LLM API，注意控制成本。

### Q3: 如何加快回测速度？
**A**: 
1. 减少回测天数
2. 增加决策间隔（如改为30分钟）
3. 使用更快的 LLM 模型

### Q4: 支持多品种回测吗？
**A**: 当前版本仅支持单品种，多品种需要扩展代码。

### Q5: 如何验证回测结果的准确性？
**A**: 
1. 与实盘结果对比（小资金测试）
2. 与其他回测平台对比
3. 检查订单成交记录的合理性

## 扩展指南

### 添加自定义指标
在 `performance.py` 中扩展 `PerformanceAnalyzer`:

```python
def _calculate_custom_metrics(self) -> Dict:
    """计算自定义指标"""
    # 您的指标计算逻辑
    return {...}
```

### 修改决策逻辑
回测使用与实盘相同的决策模块，修改这些文件：
- `src/llm_engine/strategic_agent.py`
- `src/llm_engine/tactical_agent.py`

### 使用不同订单类型
在 `_execute_decision()` 中使用 TqSDK 的高级订单:

```python
# 限价单
order = self.api.insert_order(
    symbol=self.symbol,
    direction="BUY",
    offset="OPEN",
    volume=1,
    limit_price=target_price
)

# 止损单
self.api.insert_order(
    symbol=self.symbol,
    direction="SELL",
    offset="CLOSE",
    volume=1,
    stop_price=stop_loss_price
)
```

## 相关文档

- 完整文档: `../../docs/TQSDK_BACKTEST.md`
- 快速开始: `../../BACKTEST_QUICKSTART.md`
- 重构总结: `../../BACKTEST_REFACTOR_SUMMARY.md`
- TqSDK 设置: `../../docs/TQSDK_SETUP.md`

## 版本历史

### v2.0 (2025-01-16)
- 完全重写，基于 TqSDK 原生回测
- 移除 MockExecutor，使用真实 API
- 事件驱动架构
- 性能和准确性大幅提升

### v1.0 (初始版本)
- 基于 DataFrame 遍历
- 自定义 MockExecutor
- 手动盈亏计算

---

**开始使用**: `python -m src.backtest.backtester`
