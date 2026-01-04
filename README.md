# LLM Decision Backtest System

基于LLM的量化交易回测系统，支持多种决策模式和多周期分析。

## 项目结构

```
trader/
├── config/                 # 配置文件目录
│   ├── api_keys.yaml      # API密钥配置
│   └── trading_params.yaml # 交易参数配置
├── data/                  # 数据缓存目录
├── logs/                  # 日志输出目录
├── src/
│   ├── backtest/          # 回测核心模块
│   │   ├── core/         # 核心回测引擎
│   │   │   └── backtester.py  # 主回测引擎
│   │   ├── engines/      # 决策引擎
│   │   │   ├── llm_engine.py     # LLM决策引擎
│   │   │   ├── quant_engine.py   # 量化决策引擎
│   │   │   └── hybrid_engine.py  # 混合决策引擎
│   │   ├── models/       # 数据模型
│   │   │   ├── decision.py   # 决策模型
│   │   │   ├── config.py     # 配置模型
│   │   │   └── position.py   # 持仓模型
│   │   └── llm_decision_backtest.py  # 主程序入口
│   └── llm_engine/        # LLM引擎模块
│       ├── llm_factory.py        # LLM工厂类
│       ├── claude_client.py      # Claude客户端
│       ├── openai_client.py      # OpenAI客户端
│       ├── market_representation.py  # 市场特征表示
│       ├── prompt_builder.py     # 提示词构建
│       ├── response_parser.py    # 响应解析
│       └── *_agent.py           # 各种Agent实现
├── requirements.txt       # Python依赖
└── README.md             # 项目文档
```

## 核心功能

### 1. 多种决策模式

- **quant_only**: 纯量化策略（MA均线交叉 + RSI过滤）
- **llm_direct**: 纯LLM决策（基于市场数据和技术指标）
- **hybrid**: 混合模式（量化信号 + LLM审核）

### 2. 多周期分析

支持多时间框架技术分析，可配置主决策周期和多个辅助周期：

- 主决策周期：用于生成交易信号
- 辅助周期：提供更全面的市场视角（如1小时/4小时/日线）

### 3. 止损止盈管理

双层止损体系：

- **硬止损/硬止盈**: 基于ATR的固定风险控制（3ATR止损，5ATR止盈）
- **软止损/软止盈**: LLM可调整的灵活止损（1.5ATR基准）
- **动态调整**: LLM可根据市场情况调整止损止盈点位

### 4. 技术指标

使用TqSDK计算的标准技术指标：

- 均线：MA10, MA30, MA60
- 动量指标：RSI(14)
- 波动率：ATR(14)
- MACD指标：MACD线、信号线、柱状图

## 使用方法

### 基本回测

```bash
# 使用默认参数回测
python src/backtest/llm_decision_backtest.py

# 指定时间范围
python src/backtest/llm_decision_backtest.py --start 2024-09-01 --end 2024-10-31

# 指定合约和初始持仓
python src/backtest/llm_decision_backtest.py --symbol KQ.m@CZCE.SA --initial_units 2.0
```

### 多周期分析

```bash
# 日线主周期 + 4小时和1小时辅助周期
python src/backtest/llm_decision_backtest.py \
  --decision-period 1440 \
  --auxiliary-periods 60,240 \
  --start 2024-09-01 --end 2024-10-31
```

### 最新K线分析

仅分析最新K线，不运行完整回测：

```bash
# 基本分析
python src/backtest/llm_decision_backtest.py --latest

# 显示详细理由
python src/backtest/llm_decision_backtest.py --latest --show_rationale

# 多周期分析
python src/backtest/llm_decision_backtest.py --latest --decision-period 1440 --auxiliary-periods 60,240
```

### 可视化

启用TqSDK Web GUI进行可视化：

```bash
# 使用默认地址
python src/backtest/llm_decision_backtest.py --web-gui

# 指定自定义地址
python src/backtest/llm_decision_backtest.py --web-gui=http://192.168.1.100:9876
```

### 参数说明

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--mode` | 决策模式 (quant_only/hybrid/llm_direct) | llm_direct |
| `--symbol` | 交易合约 | KQ.m@CZCE.SA |
| `--decision-period` | 主决策周期（分钟） | None |
| `--auxiliary-periods` | 辅助周期（逗号分隔） | None |
| `--count` | K线数量 | 自动计算 |
| `--cache` | 缓存文件路径 | None |
| `--start` | 回测开始时间 | 2024-09-01 09:00 |
| `--end` | 回测结束时间 | 2024-10-31 15:00 |
| `--initial_units` | 初始持仓单位 | 2.0 |
| `--margin_ratio` | 保证金比例 | 0.18 |
| `--show_rationale` | 显示决策理由 | False |
| `--debug` | 调试模式 | False |
| `--web-gui` | 启用Web GUI | None |
| `--latest` | 仅分析最新K线 | False |

## 配置文件

### api_keys.yaml

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

### trading_params.yaml

```yaml
system:
  timezone: "Asia/Shanghai"
  
backtest:
  initial_capital: 100000.0
  margin_ratio: 0.18
  max_position: 1
  
risk:
  hard_stop_loss_atr: 3.0
  soft_stop_loss_atr: 1.5
  hard_take_profit_atr: 5.0
```

## 日志和审计

系统会自动生成以下日志文件：

- `logs/llm_backtest_YYYYMMDD_HHMMSS.log` - 主日志文件
- `logs/stop_loss_adjustments.log` - 止损调整审计日志

## 依赖安装

```bash
pip install -r requirements.txt
```

主要依赖：

- tqsdk: 期货数据和回测
- pandas: 数据处理
- loguru: 日志管理
- openai/anthropic: LLM API客户端

## 开发说明

### 添加新的决策引擎

1. 在 `src/backtest/engines/` 创建新引擎文件
2. 实现 `decide(row, df)` 方法，返回 `Decision` 对象
3. 在 `backtester.py` 的 `_create_engine()` 方法中注册

### 扩展技术指标

在 `backtester.py` 的 `_calculate_technical_indicators()` 方法中添加新指标计算。

### 自定义LLM提示词

修改 `src/llm_engine/prompt_builder.py` 中的提示词模板。

## 注意事项

1. **数据预热**: 系统会自动预热技术指标，需要至少60根K线
2. **硬止损优先**: 硬止损不可被LLM覆盖，确保风险控制
3. **缓存机制**: 使用缓存可减少LLM API调用次数
4. **时区配置**: 确保时区配置正确，避免时间错位
5. **资金管理**: 初始资金会根据持仓单位和保证金比例自动计算

## License

MIT License
