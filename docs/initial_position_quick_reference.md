# 初始持仓配置 - 快速参考

## 快速开始

### 基本语法
```bash
python src\backtest\llm_decision_backtest.py [其他参数] --initial-position <数量> --entry-price <价格>
```

### 参数说明

| 参数 | 类型 | 说明 | 示例 |
|------|------|------|------|
| `--initial-position` | 整数 | 持仓数量（正=多，负=空） | `2` (多2手) / `-3` (空3手) |
| `--entry-price` | 浮点数 | 开仓价格 | `5000.0` |

### 常用命令

#### 1. 回测 - 多头持仓
```bash
python src\backtest\llm_decision_backtest.py --start 2024-09-01 --end 2024-10-31 --initial-position 2 --entry-price 5000
```

#### 2. 回测 - 空头持仓
```bash
python src\backtest\llm_decision_backtest.py --start 2024-09-01 --end 2024-10-31 --initial-position -3 --entry-price 5200
```

#### 3. 最新分析 - 多头
```bash
python src\backtest\llm_decision_backtest.py --latest --initial-position 2 --entry-price 5100 --show_rationale
```

#### 4. 最新分析 - 空头
```bash
python src\backtest\llm_decision_backtest.py --latest --initial-position -1 --entry-price 5300 --show_rationale
```

#### 5. 多周期分析 + 持仓
```bash
python src\backtest\llm_decision_backtest.py --latest --initial-position 2 --entry-price 5000 --decision-period 1440 --auxiliary-periods 60,240
```

## 重要提示

⚠️ **必须同时设置**: 设置了 `--initial-position` 就必须设置 `--entry-price`，否则会报错

✅ **持仓方向**:
- 正数 = 多头（看涨）
- 负数 = 空头（看跌）
- 0 = 空仓（默认）

📊 **AI会看到**:
- 持仓方向和数量
- 开仓价 vs 当前价
- 浮动盈亏（金额和百分比）
- 止损止盈距离

## 错误处理

### 常见错误1: 缺少开仓价
```bash
# ❌ 错误
python src\backtest\llm_decision_backtest.py --latest --initial-position 2

# ✅ 正确
python src\backtest\llm_decision_backtest.py --latest --initial-position 2 --entry-price 5000
```

### 常见错误2: 价格为0
```bash
# ❌ 错误
python src\backtest\llm_decision_backtest.py --latest --initial-position 2 --entry-price 0

# ✅ 正确
python src\backtest\llm_decision_backtest.py --latest --initial-position 2 --entry-price 5000
```

## 实际应用场景

### 场景1: 被套后求助
你在5200做多2手，现价4900，想知道AI建议：
```bash
python src\backtest\llm_decision_backtest.py --latest --initial-position 2 --entry-price 5200 --show_rationale
```

### 场景2: 盈利中求建议
你在5300做空1手，现价5000，想知道是否平仓：
```bash
python src\backtest\llm_decision_backtest.py --latest --initial-position -1 --entry-price 5300 --show_rationale
```

### 场景3: 回测持仓管理
测试从某持仓开始的后续表现：
```bash
python src\backtest\llm_decision_backtest.py --start 2024-09-01 --end 2024-10-31 --initial-position 2 --entry-price 5100
```

## 更多帮助

- 详细文档: `docs/initial_position_config.md`
- 查看所有参数: `python src\backtest\llm_decision_backtest.py --help`
