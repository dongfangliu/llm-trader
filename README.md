# LLM-Powered Soda Ash Futures Trading System

🤖 An intelligent futures trading system combining quantitative strategies with LLM expert review for Soda Ash (SA601) contracts.

## 🌟 Features

### V2 Hybrid Architecture (Current)
- **Quantitative-First Approach**: Traditional quant strategies make 95% of decisions
- **LLM Expert Review**: AI reviews only complex/ambiguous situations (3-5x/day)
- **95% Cost Reduction**: ~$5/month vs $50/month pure LLM approach
- **Multi-Strategy System**: Trend following, mean reversion, breakout strategies
- **Market Regime Detection**: Automatic strategy selection based on market conditions
- **Adaptive Risk Control**: ATR-based dynamic stops, position sizing, drawdown management

### Web Interface (FastAPI + React)
- Real-time K-line charts with ECharts
- Live position and account monitoring
- Strategy performance analytics
- WebSocket streaming data
- Interactive API documentation

### Advanced Features
- **Smart Execution**: TWAP, Iceberg, Chase orders with slippage control
- **Backtesting Engine**: TqSDK native backtesting with performance analysis
- **Order Flow Analysis**: Bid/ask imbalance, large order detection, VWAP tracking
- **Performance Monitoring**: Real-time metrics and alerting
- **Multi-Timeframe Analysis**: 1m, 15m, 1h, 4h, 1d K-lines

## 🚀 Quick Start

### Installation

```bash
# Install Python dependencies
pip install -r requirements.txt

# Install TA-Lib (Windows)
# Download wheel from https://www.lfd.uci.edu/~gohlke/pythonlibs/#ta-lib
pip install TA_Lib‑0.4.XX‑cpXX‑cpXX‑win_amd64.whl

# Install web frontend dependencies (optional)
cd web_v2/frontend
npm install
cd ../..
```

### Configuration

1. Copy API keys template:
```bash
cp config/api_keys.yaml.example config/api_keys.yaml
```

2. Edit `config/api_keys.yaml` with your credentials:
```yaml
provider: deepseek  # claude, openai, deepseek, etc.

providers:
  deepseek:
    api_key: sk-your-api-key
    base_url: https://api.deepseek.com

tqsdk:
  username: your_username
  password: your_password
  use_sim: true  # Use simulation account
```

3. Adjust trading parameters in `config/trading_params.yaml`

### Running the System

```bash
# Main trading system (V2 - Quantitative + LLM)
python src/main_v2.py

# Web interface
python start_web_v2.py
# Access at http://localhost:8000
```

## 📊 Architecture

```
Data Collection (every 3s)
    ↓
Quantitative Strategy Layer (every 15min)
├── Market Regime Detection
├── Strategy Signal Generation
└── Confidence Scoring
    ↓
LLM Trigger Check (only when needed)
├── Low confidence? → expert_review
├── Market abnormal? → abnormal_analysis
└── Signal conflict? → conflict_resolution
    ↓
Risk Control (every 3s)
    ↓
Order Execution
    ↓
Daily Review (21:00)
```

### Core Components

- **Quantitative Strategies** (`src/strategy/`): Trend following, mean reversion, breakout
- **LLM Expert System** (`src/llm_engine/`): Intelligent triggering, expert review, daily analysis
- **Risk Control** (`src/risk_control/`): Adaptive stops, position sizing, real-time monitoring
- **Smart Execution** (`src/execution/`): TWAP, iceberg, chase orders
- **Web Interface** (`web_v2/`): FastAPI backend + React frontend
- **Backtesting** (`src/backtest/`): Strategy testing and optimization

## 🧪 Testing

```bash
# Test LLM connection
python -c "from src.llm_engine.llm_factory import LLMFactory; client = LLMFactory.create_client(); print('✓ Connected')"

# Test quantitative strategies
python tests/test_phase2_strategies.py

# Full integration test
python tests/test_integration.py

# Run backtest
python src/backtest/strategy_backtester.py
```

## 📖 Documentation

- `CLAUDE.md`: Comprehensive development guide
- `config/README_CONFIG.md`: LLM provider configuration
- `docs/QUANT_EXPERT_SYSTEM_DESIGN.md`: V2 architecture design
- `web_v2/docs/DEVELOPMENT.md`: Web interface development guide

## 🎯 Supported LLM Providers

- **Claude (Anthropic)**: Best quality
- **OpenAI**: GPT-4, GPT-3.5-turbo
- **DeepSeek**: Cost-effective, Chain-of-Thought (recommended for development)
- **Tongyi Qianwen**: Chinese LLM
- **Zhipu AI (GLM)**: Chinese GLM models
- **Kimi (Moonshot)**: Long context
- **Local Ollama**: Offline, free
- **Custom**: Any OpenAI-compatible API

## 📈 Performance

V2 vs V1 Comparison:
- **LLM Cost**: $5/month vs $50/month (95% reduction)
- **Decision Speed**: <100ms vs 3-5s (98% faster)
- **Reliability**: Runs without LLM if API fails
- **Backtestability**: Full strategy backtesting support
- **Intelligence**: LLM reviews complex situations

## ⚠️ Disclaimer

**This system is for educational and research purposes only.**

- Uses **simulation mode** by default (TqSDK SimNow)
- Futures trading involves substantial risk of loss
- Test extensively before considering real trading
- Not financial advice

## 📝 License

Private repository - All rights reserved

## 🤝 Contributing

This is a private repository. For questions or issues, please contact the repository owner.

---

**Target Instrument**: Soda Ash futures (纯碱SA601)  
**Language**: Python 3.x  
**Architecture**: V2 - Quantitative-first with LLM assistance
