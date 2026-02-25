# 股票回测 —— AKShare 数据源使用指南

## 概述

`stock_backtest.py` 是为 A股、港股、美股设计的独立回测脚本。  
与期货回测不同，**不依赖 TqSDK** 获取数据或下单，完全基于 AKShare 提供的历史行情运行。

三种决策引擎（纯量化 / 混合 / 纯LLM）与期货回测完全共用，无需任何修改。

---

## 快速开始

```bash
# 安装依赖（已内置于 requirements.txt）
pip install akshare ta

# A股 贵州茅台，纯量化，日线
python src/backtest/stock_backtest.py --symbol 600519 --market a --start 20240101 --end 20241231

# 港股 腾讯，纯量化，日线
python src/backtest/stock_backtest.py --symbol 00700 --market hk --start 20240101 --end 20241231

# 美股 苹果，纯量化，日线
python src/backtest/stock_backtest.py --symbol AAPL --market us --start 20240101 --end 20241231
```

---

## 命令行参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--symbol` | 股票代码（必填） | — |
| `--market` | 市场：`a` / `hk` / `us` | `a` |
| `--mode` | 决策模式：`quant_only` / `hybrid` / `llm_direct` | `quant_only` |
| `--period` | K线周期：`daily` 或分钟数 `1`/`5`/`15`/`30`/`60` | `daily` |
| `--start` | 开始日期 `YYYYMMDD` 或 `YYYY-MM-DD` | 过去1年 |
| `--end` | 结束日期 `YYYYMMDD` 或 `YYYY-MM-DD` | 今天 |
| `--adjust` | 复权方式：`qfq`（前复权）/ `hfq`（后复权）/ `` 不复权 | `qfq` |
| `--capital` | 初始资金（元） | `100000` |
| `--max-position` | 最大持仓股数 | `100` |
| `--cache` | LLM决策缓存文件路径（llm_direct模式可用） | 不缓存 |
| `--show-rationale` | 每根K线打印决策理由 | `False` |
| `--debug` | 开启 DEBUG 日志 | `False` |

---

## 使用示例

### 1. 纯量化回测

```bash
# A股，日线，前复权
python src/backtest/stock_backtest.py \
  --symbol 600519 --market a \
  --start 20240101 --end 20241231 \
  --capital 200000 --max-position 100

# 港股，60分钟线（分钟线数据来自东财，需网络畅通）
python src/backtest/stock_backtest.py \
  --symbol 00700 --market hk \
  --period 60 --start 20241001 --end 20241231
```

### 2. LLM 决策回测

```bash
# 需先配置 config/api_keys.yaml 中的 LLM provider

python src/backtest/stock_backtest.py \
  --symbol AAPL --market us \
  --mode llm_direct \
  --cache llm_decision_cache.json \
  --show-rationale \
  --start 20240101 --end 20241231
```

### 3. 在 Python 代码中直接使用

```python
from src.data.akshare_fetcher import fetch_stock_data
from src.backtest.stock_backtest import StockBacktester
from src.backtest.models.decision import DecisionMode

# ① 只拉取数据 + 指标（不运行回测）
df = fetch_stock_data("600519", market="a", start_date="20240101", end_date="20241231")
print(df[["close", "ma10", "ma30", "rsi", "atr", "macd"]].tail())

# ② 运行完整回测
bt = StockBacktester(
    symbol="600519",
    market="a",
    mode=DecisionMode.QUANT_ONLY,
    initial_capital=100_000,
    max_position=100,
)
report = bt.run(start_date="20240101", end_date="20241231")
print(f"收益率: {report['return_pct']:+.2f}%")
print(f"交易次数: {len([t for t in report['trades'] if t['side'] == 'BUY'])}")
print(f"盈/亏: {report['wins']}/{report['losses']}")
```

---

## 股票代码格式

| 市场 | 格式 | 示例 |
|------|------|------|
| A股（沪市）| 6位纯数字，以 `6` 开头 | `600519`、`601318` |
| A股（深市）| 6位纯数字，以 `0`/`3` 开头 | `000858`、`300750` |
| A股（北交所）| 6位纯数字，以 `4`/`8` 开头 | `430047` |
| 港股 | 5位数字（前补零） | `00700`、`09988` |
| 美股 | 英文字母 Ticker | `AAPL`、`TSLA`、`NVDA` |

---

## 数据源说明

| 市场 | 日线来源 | 分钟线来源 |
|------|----------|-----------|
| A股 | 新浪财经（稳定） | 东方财富（需网络畅通） |
| 港股 | Yahoo Finance（稳定） | 东方财富（需网络畅通） |
| 美股 | Yahoo Finance（稳定） | 东方财富（需网络畅通） |

> **注意**：分钟线数据来源于东方财富 CDN，部分网络环境（代理/防火墙）可能无法访问。  
> 日线数据均使用稳定的国内/雅虎源，一般不受此影响。

---

## 技术指标

与期货回测完全一致，使用 `ta` 库计算（而非 TqSDK）：

| 指标 | 参数 | 列名 |
|------|------|------|
| 移动平均 | 10 / 30 / 60 日 | `ma10` `ma30` `ma60` |
| RSI | 14 日 | `rsi` |
| ATR | 14 日 | `atr` |
| MACD | 12 / 26 / 9 | `macd` `macd_dea` `macd_bar` |

前 29 根 K 线的 MA30 为 NaN（预热期），前 59 根 K 线的 MA60 为 NaN，属正常现象。

---

## 交易规则说明

| 规则 | A股 | 港股 | 美股 |
|------|-----|------|------|
| 做多 | ✅ | ✅ | ✅ |
| 做空 | ❌（T+1 限制简化处理） | ✅ | ✅ |
| 手续费 | 0.03%（双边） | 0.1%（双边） | 0.01%（双边） |

> 当前回测为**简化版撮合**：以当根K线收盘价成交，不模拟涨跌停、流动性等限制。  
> 如需更精确的模拟，可在 `StockBacktester` 中扩展成交逻辑。

---

## 与期货回测的区别

| 项目 | 期货回测 (`llm_decision_backtest.py`) | 股票回测 (`stock_backtest.py`) |
|------|---------------------------------------|-------------------------------|
| 数据源 | TqSDK（天勤）| AKShare（新浪/雅虎）|
| 下单撮合 | TqSDK `TargetPosTask` | 内置简单撮合 |
| 止损执行 | 硬止损 / 软止损双层 | 无自动止损（由引擎决策控制）|
| 保证金杠杆 | ✅（期货合约乘数） | ❌（现货，1倍） |
| 分钟线 | ✅ 稳定 | ⚠️ 依赖东财（可能不稳定）|
| 决策引擎 | 共用（quant / hybrid / llm） | 共用（quant / hybrid / llm）|
