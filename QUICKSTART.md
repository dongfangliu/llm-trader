# 快速开始指南

## 环境准备

### 1. 安装依赖

```bash
pip install -r requirements.txt
```

主要依赖：
- `tqsdk` - 期货数据和回测引擎
- `pandas` - 数据处理
- `loguru` - 日志管理
- `openai` / `anthropic` - LLM API客户端

### 2. 配置API密钥

创建 `config/api_keys.yaml` 文件：

```yaml
# TqSDK 配置（必需）
tqsdk:
  username: "your_username"
  password: "your_password"
  use_sim: true  # 使用模拟账户

# OpenAI 配置（LLM模式需要）
openai:
  api_key: "sk-..."
  base_url: "https://api.openai.com/v1"
  model: "gpt-4"

# Claude 配置（可选）
claude:
  api_key: "sk-ant-..."
```

### 3. 配置交易参数

创建 `config/trading_params.yaml` 文件：

```yaml
system:
  timezone: "Asia/Shanghai"

backtest:
  initial_capital: 100000.0
  margin_ratio: 0.18
  max_position: 1
```

## 运行示例

### 示例1: 基本回测（纯量化）

最简单的方式，无需配置LLM API：

```bash
python src/backtest/llm_decision_backtest.py \
  --mode quant_only \
  --start 2024-09-01 \
  --end 2024-09-30
```

**特点**：
- 使用MA均线交叉策略
- 不调用LLM，速度快
- 适合快速测试和验证

### 示例2: LLM决策回测

使用LLM进行决策：

```bash
python src/backtest/llm_decision_backtest.py \
  --mode llm_direct \
  --start 2024-09-01 \
  --end 2024-09-30 \
  --show_rationale
```

**特点**：
- LLM分析市场并做出决策
- 显示每次决策的理由
- 需要配置OpenAI或Claude API

### 示例3: 最新K线分析

仅分析最新数据，不运行完整回测：

```bash
python src/backtest/llm_decision_backtest.py --latest
```

**输出示例**：
```
=== 最新K线分析结果 ===
合约: KQ.m@CZCE.SA
时间: 2024-10-31 14:45:00
当前价格: 6850.0

决策: open_long
建议仓位: 1
置信度: 0.75
止损点位: 6750.0
止盈点位: 7050.0

=== AI研判详情 ===
[LLM的详细分析...]
```

### 示例4: 多周期分析

使用多个时间框架进行分析：

```bash
python src/backtest/llm_decision_backtest.py \
  --decision-period 1440 \
  --auxiliary-periods 60,240 \
  --start 2024-09-01 \
  --end 2024-09-30
```

**说明**：
- `--decision-period 1440`：主决策周期为日线（1440分钟）
- `--auxiliary-periods 60,240`：辅助周期为1小时（60分钟）和4小时（240分钟）

### 示例5: 可视化回测

启用TqSDK的Web GUI进行可视化：

```bash
python src/backtest/llm_decision_backtest.py \
  --start 2024-09-01 \
  --end 2024-09-30 \
  --web-gui
```

然后在浏览器中打开显示的地址（如 `http://127.0.0.1:9876`）查看可视化界面。

## 常用参数

### 基本参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--mode` | 决策模式 (quant_only/hybrid/llm_direct) | llm_direct |
| `--symbol` | 交易合约 | KQ.m@CZCE.SA |
| `--start` | 回测开始时间 (YYYY-MM-DD) | 2024-09-01 |
| `--end` | 回测结束时间 (YYYY-MM-DD) | 2024-10-31 |

### 高级参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--decision-period` | 主决策周期（分钟） | 自动计算 |
| `--auxiliary-periods` | 辅助周期（逗号分隔） | None |
| `--initial_units` | 初始持仓单位 | 2.0 |
| `--margin_ratio` | 保证金比例 | 0.18 |
| `--cache` | 缓存文件路径 | None |
| `--show_rationale` | 显示决策理由 | False |
| `--debug` | 调试模式 | False |
| `--latest` | 仅分析最新K线 | False |
| `--web-gui` | 启用Web GUI | None |

## 输出说明

### 回测输出

```
=== Backtest Summary ===
Mode: llm_direct
Initial: 100000.00
Final:   105230.00
Return:  5.23%
Trades:  12
Wins/Losses: 7/5
Note: 以 TqSDK '模拟交易账户' 汇总为准；本脚本摘要仅供快速参考。
```

### 日志文件

- `logs/llm_backtest_YYYYMMDD_HHMMSS.log` - 主日志
- `logs/stop_loss_adjustments.log` - 止损调整审计日志

### 缓存文件

使用 `--cache` 参数可以缓存LLM决策，减少API调用：

```bash
python src/backtest/llm_decision_backtest.py \
  --cache llm_decision_cache.json \
  --start 2024-09-01 \
  --end 2024-09-30
```

## 常见问题

### Q1: 提示"No module named 'tqsdk'"

**A**: 需要安装依赖：
```bash
pip install -r requirements.txt
```

### Q2: 提示"TqSDK认证失败"

**A**: 需要在 `config/api_keys.yaml` 中配置TqSDK账号。可以在 [天勤量化官网](https://www.shinnytech.com/tqsdk) 免费注册。

### Q3: LLM模式提示"API key not found"

**A**: 需要在 `config/api_keys.yaml` 中配置OpenAI或Claude的API密钥。

### Q4: 回测速度很慢

**A**: 
1. 使用 `--mode quant_only` 不调用LLM
2. 减少回测时间范围
3. 使用 `--cache` 参数缓存LLM决策
4. 增大决策周期（如使用日线）

### Q5: 如何查看详细日志

**A**: 
1. 使用 `--debug` 参数启用调试模式
2. 使用 `--show_rationale` 显示决策理由
3. 查看 `logs/` 目录下的日志文件

## 下一步

- 阅读完整文档：[README.md](README.md)
- 了解回测模块：[src/backtest/README.md](src/backtest/README.md)
- 查看代码示例：[examples.py](examples.py)
- 调整配置参数：`config/trading_params.yaml`

## 获取帮助

查看所有可用参数：
```bash
python src/backtest/llm_decision_backtest.py --help
```

## 许可证

MIT License
