# 回测模块 (Backtest Module)

## 概述

本模块实现了基于 TqSDK 和 LLM 的智能交易回测系统，支持多种决策模式、多周期分析和完整的风险管理。

## 文件结构

```
backtest/
├── __init__.py                   # 模块初始化
├── llm_decision_backtest.py      # 主程序入口
├── README.md                     # 本文件
├── core/
│   └── backtester.py             # 核心回测引擎
├── engines/                      # 决策引擎
│   ├── llm_engine.py            # LLM决策引擎
│   ├── quant_engine.py          # 量化决策引擎
│   └── hybrid_engine.py         # 混合决策引擎
└── models/                       # 数据模型
    ├── decision.py              # 决策模型
    ├── config.py                # 配置模型
    └── position.py              # 持仓模型
```

## 核心组件

### 1. Backtester (core/backtester.py)

基于 TqSDK 的事件驱动回测引擎。

**主要特性**:
- 使用 TqSDK 的 `TargetPosTask` 自动处理订单
- 事件驱动架构（`api.wait_update()`）
- 多时间框架支持（任意分钟级周期）
- 双层止损体系（硬止损 + 软止损）
- 自动技术指标计算
- 完整的审计日志

### 2. 决策引擎 (engines/)

#### SimpleQuantEngine (quant_engine.py)
基于MA均线交叉和RSI过滤的量化策略。

**信号逻辑**:
- 金叉 (MA10 > MA30) + RSI < 70 → 开多
- 死叉 (MA10 < MA30) + RSI > 30 → 开空
- 使用ATR计算止损止盈

#### LLMDirectEngine (llm_engine.py)
纯LLM决策引擎，基于市场数据和技术指标。

**特性**:
- 自动生成市场特征表示
- 支持多周期分析
- 缓存机制减少API调用
- 完整的四步推理链

#### HybridEngine (hybrid_engine.py)
混合决策模式：量化信号 + LLM审核。

**工作流程**:
1. 量化引擎生成信号
2. 如果置信度低，提交LLM审核
3. LLM批准或拒绝信号

### 3. 数据模型 (models/)

#### Decision (decision.py)
交易决策的完整表示，包含：
- 基本动作和仓位
- 止损止盈点位
- 置信度和理由
- LLM调整请求

#### BTConfig (config.py)
回测配置模型，支持：
- 单周期和多周期配置
- 自动K线数量计算
- 时区管理

#### Position (position.py)
持仓状态的简单表示。

## 使用方法

### 基本回测

```bash
# 默认模式（LLM直接决策）
python src/backtest/llm_decision_backtest.py

# 指定时间范围和合约
python src/backtest/llm_decision_backtest.py \
  --symbol KQ.m@CZCE.SA \
  --start 2024-09-01 \
  --end 2024-10-31
```

### 多周期分析

```bash
# 日线主周期 + 4小时和1小时辅助
python src/backtest/llm_decision_backtest.py \
  --decision-period 1440 \
  --auxiliary-periods 60,240 \
  --start 2024-09-01 --end 2024-10-31
```

### 最新K线分析

```bash
# 仅分析最新数据，不运行完整回测
python src/backtest/llm_decision_backtest.py --latest

# 显示详细推理过程
python src/backtest/llm_decision_backtest.py --latest --show_rationale
```

### 可视化

```bash
# 启用TqSDK Web GUI
python src/backtest/llm_decision_backtest.py --web-gui

# 指定自定义地址
python src/backtest/llm_decision_backtest.py --web-gui=http://192.168.1.100:9876
```

## 关键参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--mode` | 决策模式 | llm_direct |
| `--symbol` | 交易合约 | KQ.m@CZCE.SA |
| `--decision-period` | 主决策周期（分钟） | 自动 |
| `--auxiliary-periods` | 辅助周期（逗号分隔） | None |
| `--initial_units` | 初始持仓单位 | 2.0 |
| `--margin_ratio` | 保证金比例 | 0.18 |
| `--show_rationale` | 显示决策理由 | False |
| `--latest` | 仅分析最新K线 | False |

## 止损止盈体系

### 双层止损机制

**硬止损（Hard Stop Loss）**
- 基于ATR的固定风险控制
- 多头：开仓价 - 3 × ATR
- 空头：开仓价 + 3 × ATR
- **不可被LLM覆盖**，确保风险底线

**软止损（Soft Stop Loss）**
- 默认基准：1.5 × ATR
- LLM可以调整或临时忽略
- 需要提供调整理由（审计日志）

### 止盈机制

**硬止盈（Hard Take Profit）**
- 目标：开仓价 ± 5 × ATR
- 触发后自动平仓

**软止盈（Soft Take Profit）**
- LLM可根据市场情况动态调整
- 支持移动止盈

### LLM调整审核

所有LLM的止损止盈调整请求都会经过审核：
1. **硬止损检查**：不能超过硬止损边界
2. **放宽限制**：止损放宽不超过50%
3. **方向验证**：止盈不能低于/高于开仓价（多/空）
4. **审计日志**：所有调整记录到 `logs/stop_loss_adjustments.log`

## 技术指标

系统使用TqSDK自动计算以下指标：

- **均线**: MA10, MA30, MA60
- **动量**: RSI(14)
- **波动率**: ATR(14)
- **MACD**: MACD线、信号线、柱状图

所有指标在K线更新时自动重新计算，无需手动管理。

## 配置文件

### config/api_keys.yaml

```yaml
tqsdk:
  username: "your_username"
  password: "your_password"
  use_sim: true

openai:
  api_key: "sk-..."
  base_url: "https://api.openai.com/v1"
  model: "gpt-4"

claude:
  api_key: "sk-ant-..."
```

### config/trading_params.yaml

```yaml
system:
  timezone: "Asia/Shanghai"
  
backtest:
  initial_capital: 100000.0
  margin_ratio: 0.18
  max_position: 1
```
