# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

An intelligent futures trading system for Soda Ash (SA601) contracts combining quantitative strategies with LLM expert review. The system follows a V2 hybrid architecture where quantitative strategies make 95% of decisions, and LLM reviews only complex/ambiguous situations (3-5x/day).

**Target Instrument**: Soda Ash futures (纯碱 SA601)
**Architecture**: V2 - Quantitative-first with LLM assistance
**Language**: Python 3.x
**Platform**: Windows (primary), cross-platform compatible

## Quick Start Commands

### Development Setup

```bash
# Install Python dependencies
pip install -r requirements.txt

# Install TA-Lib (Windows - manual installation required)
# Download wheel from: https://www.lfd.uci.edu/~gohlke/pythonlibs/#ta-lib
# For Python 3.13: TA_Lib-0.4.28-cp313-cp313-win_amd64.whl
pip install TA_Lib-0.4.28-cp313-cp313-win_amd64.whl

# Install frontend dependencies
cd web_v2/frontend
npm install
cd ../..
```

### Configuration

```bash
# Copy and configure API keys
cp config/api_keys.yaml.example config/api_keys.yaml
# Edit config/api_keys.yaml with your credentials
```

### Running the System

```bash
# Web interface (recommended - includes backend + data collection)
python start_web_v2.py
# Access at: http://localhost:8000

# Alternative: Full startup script (PowerShell - starts backend in separate window + frontend)
./start.ps1

# Main trading system (V2 - Quantitative + LLM)
python src/main_v2.py
```

### Testing

```bash
# Test LLM connection
python -c "from src.llm_engine.llm_factory import LLMFactory; client = LLMFactory.create_client(); print('✓ Connected')"

# Test quantitative strategies
python tests/test_phase2_strategies.py

# Full integration test
python tests/test_integration.py

# Other test suites
python tests/test_llm_system.py
python tests/test_execution.py
python tests/test_stress.py
```

### Backtesting

```bash
# Run strategy backtest
python src/backtest/strategy_backtester.py

# Performance analysis
python src/backtest/performance_analyzer.py
```

### Database & Data Management

```bash
# Initialize real-time data (run during trading hours)
python scripts/init_realtime_data.py

# Diagnose data issues
python scripts/diagnose_data.py
python scripts/diagnose_data_validity.py

# Check system status
python scripts/check_system_status.py

# Clear all data (careful!)
python scripts/clear_all_data.py
```

### Frontend Development

```bash
cd web_v2/frontend

# Development server (with hot reload)
npm run dev

# Build for production
npm run build

# Type checking
npm run type-check

# Linting
npm run lint

# Format code
npm run format
```

## Architecture Overview

### V2 Hybrid Architecture Flow

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

**Source Directory**: `src/`

1. **Quantitative Strategies** (`src/strategy/`)
   - `market_regime.py` - Market regime detection (trend/range/volatile)
   - `trend_following.py` - Trend following strategy
   - `mean_reversion.py` - Mean reversion strategy
   - `breakout.py` - Breakout strategy
   - `signal_router.py` - Routes signals to appropriate strategies

2. **LLM Expert System** (`src/llm_engine/`)
   - `llm_factory.py` - Factory for creating LLM clients (Claude, OpenAI, DeepSeek, etc.)
   - `llm_trigger.py` - Intelligent triggering (only calls LLM when needed)
   - `response_parser.py` - Parses LLM responses
   - `daily_review_agent.py` - Daily performance review
   - `prompts/` - Prompt templates for different scenarios

3. **Data Collection** (`src/data/`)
   - `data_collector_v2.py` - Real-time data collection
   - `multi_timeframe_kline_v2.py` - Multi-timeframe K-line data
   - `indicators_v2.py` - Technical indicators (MA, MACD, RSI, etc.)
   - `order_flow_v2.py` - Order flow analysis

4. **Data Fetcher** (`src/data_fetcher/`)
   - `tqsdk_client.py` - TqSDK client for market data
   - `database.py` - SQLite database operations
   - `data_processor.py` - Data processing utilities
   - `data_source_factory.py` - Factory for creating data sources

5. **Risk Control** (`src/risk_control/`)
   - `adaptive_risk_control.py` - ATR-based dynamic risk management
   - `position_sizer.py` - Position sizing calculations
   - `realtime_monitor.py` - Real-time risk monitoring
   - `trailing_stop.py` - Trailing stop loss

6. **Smart Execution** (`src/execution/`)
   - `smart_executor.py` - Main execution coordinator
   - `twap_order.py` - Time-weighted average price orders
   - `iceberg_order.py` - Iceberg orders
   - `chase_order.py` - Chase orders
   - `slippage_control.py` - Slippage control

7. **Backtesting** (`src/backtest/`)
   - `strategy_backtester.py` - Strategy backtesting engine
   - `performance_analyzer.py` - Performance analysis
   - `visualizer.py` - Visualization tools
   - `report_generator.py` - Report generation

8. **Optimization** (`src/optimization/`)
   - `grid_search.py` - Grid search optimization
   - `walk_forward.py` - Walk-forward analysis
   - `monte_carlo.py` - Monte Carlo simulation

### Web V2 Architecture

**Directory**: `web_v2/`

The Web V2 system provides a unified interface with automatic data collection:

```
User starts: python start_web_v2.py
    ↓
FastAPI Server Starts
├── Initialize bridge (connects to database + TqSDK)
├── Start data collector service (background thread)
├── Start WebSocket pushes
└── Start HTTP API
    ↓
Data Collector Service (background)
├── Check if database is empty
├── If empty: pull 180 days daily + 3000 min bars
└── Start real-time collection (every 3s)
    ↓
Frontend polls API (every 3s)
└── ECharts incremental updates
```

**Backend** (`web_v2/server/`):
- `main.py` - FastAPI application entry
- `core/bridge.py` - Data bridge layer connecting to trading system core
- `core/websocket.py` - WebSocket manager for real-time updates
- `api/` - API endpoints (kline, account, signal, control, etc.)
- `services/data_collector_service.py` - Background data collection service
- `models/schemas.py` - Pydantic models
- `utils/config.py` - Configuration management

**Frontend** (`web_v2/frontend/`):
- **Framework**: React 18 + TypeScript + Vite
- **UI Library**: Ant Design 5
- **Charts**: ECharts 5
- **State**: Zustand
- **HTTP**: Axios + TanStack Query
- `src/components/Dashboard/` - Main dashboard components
- `src/api/` - API client functions
- `src/hooks/useWebSocket.ts` - WebSocket hook

**Key Frontend Features**:
- Real-time K-line charts with user interaction preservation
- Incremental chart updates (`notMerge: false`) maintain zoom/scroll state
- 3-second polling interval for data updates
- WebSocket support for real-time pushes

## Database Schema

**Location**: `data/market_data.db` (SQLite)

**Tables**:
- `kline_minute` - Minute K-lines (periods: 1/5/15/60/240)
- `kline_daily` - Daily K-lines
- `trades` - Trade records
- `signals` - Strategy signals
- `accounts` - Account snapshots

## Configuration Files

### `config/trading_params.yaml`
Main trading parameters:
- `trading.symbol` - Symbol to trade (SA0 for Soda Ash)
- `trading.tqsdk_symbol` - TqSDK symbol format (KQ.m@CZCE.SA)
- `trading.initial_capital` - Initial capital
- `trading.max_position` - Maximum position size
- `decision.strategic_interval` - Strategic decision interval (240 min)
- `decision.tactical_interval` - Tactical decision interval (15 min)
- `risk.stop_loss` - Stop loss amount
- `risk.daily_max_loss` - Daily max loss limit

### `config/api_keys.yaml`
API credentials (gitignored, use `api_keys.yaml.example` as template):
- `provider` - LLM provider (claude/openai/deepseek/etc.)
- `providers.<name>.api_key` - API key for each provider
- `tqsdk.username` - TqSDK username
- `tqsdk.password` - TqSDK password
- `tqsdk.use_sim` - Use simulation account (true/false)

## LLM Providers

Supported providers (configured via `llm_factory.py`):
- **Claude (Anthropic)** - Best quality
- **OpenAI** - GPT-4, GPT-3.5-turbo
- **DeepSeek** - Cost-effective, Chain-of-Thought (recommended for development)
- **Tongyi Qianwen** - Chinese LLM
- **Zhipu AI (GLM)** - Chinese GLM models
- **Kimi (Moonshot)** - Long context
- **Local Ollama** - Offline, free
- **Custom** - Any OpenAI-compatible API

## Important Development Notes

### Data Collection Strategy

- **Automatic Data Collection**: The web server automatically starts data collection in a background thread
- **First Run**: If database is empty, pulls 180 days of daily K-lines and 3000 minute bars (~2 days)
- **Real-time Updates**: Every 3 seconds, fetches tick data from TqSDK and accumulates into minute bars
- **Trading Hours**: Data collection only works during trading hours; avoid running initialization scripts during non-trading hours (they'll pull invalid/empty data)

### Frontend Chart Updates

The K-line chart uses incremental updates to preserve user interaction:
- `notMerge: false` in ECharts `setOption()` - critical for incremental updates
- `lazyUpdate: true` - improves performance
- User zoom/scroll positions are preserved during updates
- Only full reload on period change (1m → 5m)

### Path Management

All imports in `src/` modules use relative imports within the package. When working in `web_v2/server/`, the code adds project root to `sys.path` to import from `src/`.

### Windows-Specific Considerations

- PowerShell scripts use `start.ps1` for automated startup
- UTF-8 encoding is explicitly set for console output (emoji support)
- Use `Get-ChildItem`, `Select-Object`, etc. for file operations in PowerShell
- Path separators handled automatically by `pathlib.Path`

### Testing Strategy

- Unit tests in `tests/` for individual components
- Integration tests for full system workflow
- Stress tests for high-load scenarios
- Always test with simulation account (`use_sim: true`) first

### Risk Management

- **Default Mode**: Simulation account (TqSDK SimNow)
- **Real Trading**: Change `use_sim: false` in `config/api_keys.yaml` (use with extreme caution)
- All market data is real, regardless of account type
- Risk limits enforced at multiple levels: position sizing, stop loss, daily max loss, drawdown control

### Backtesting

- Uses TqSDK native backtesting engine
- Realistic cost model: commission + slippage
- Performance metrics: Sharpe ratio, max drawdown, win rate
- Walk-forward analysis for robustness testing

## Common Development Patterns

### Adding a New Strategy

1. Create strategy class in `src/strategy/`
2. Inherit from base strategy interface
3. Implement `generate_signal()` method
4. Register in `signal_router.py`
5. Add tests in `tests/test_phase2_strategies.py`
6. Backtest before deployment

### Adding a New API Endpoint

1. Create endpoint in `web_v2/server/api/`
2. Define Pydantic models in `server/models/schemas.py`
3. Register router in `server/main.py`
4. Create frontend API client in `web_v2/frontend/src/api/`
5. Use in components with TanStack Query

### Adding a New LLM Provider

1. Create client class in `src/llm_engine/` (e.g., `new_provider_client.py`)
2. Implement standard interface (same as `claude_client.py`)
3. Register in `llm_factory.py`
4. Add configuration to `api_keys.yaml.example`
5. Test with `python -c "from src.llm_engine.llm_factory import LLMFactory; ..."`

## Debugging Tips

### Backend Issues
```bash
# Check API server logs
Get-Content web_v2/server/logs/api.log -Tail 50

# Test database connection
python scripts/diagnose_data.py

# Verify TqSDK connection
python -c "from src.data_fetcher.tqsdk_client import TqSDKClient; import yaml; config = yaml.safe_load(open('config/api_keys.yaml')); client = TqSDKClient(config); print('Connected')"
```

### Frontend Issues
```bash
# Check browser console for errors
# Verify API is running: http://localhost:8000/docs
# Check network tab for failed requests

# Frontend diagnostics
python scripts/diagnose_frontend.py
```

### Data Issues
```bash
# Verify data validity
python scripts/diagnose_data_validity.py

# Check API compatibility
python scripts/check_api_compatibility.py

# Clear and reinitialize (during trading hours only)
python scripts/clear_all_data.py
python scripts/init_realtime_data.py
```

## Project-Specific Conventions

- **Logging**: Use `loguru` logger, not `print()` statements
- **Configuration**: All config in YAML files, never hardcode
- **Type Hints**: Use type hints for all function signatures
- **Error Handling**: Graceful degradation (system continues with reduced functionality if LLM fails)
- **Time Management**: Use `datetime` with `Asia/Shanghai` timezone
- **Data Validation**: Pydantic models for API schemas
- **Async/Await**: Use async for I/O operations (API calls, database queries)

## Access Points

- **API Documentation**: http://localhost:8000/docs (Swagger UI)
- **ReDoc**: http://localhost:8000/redoc (Alternative API docs)
- **Frontend**: http://localhost:8000 (served by FastAPI)
- **Frontend Dev Server**: http://localhost:3000 (Vite dev server)
- **WebSocket**: ws://localhost:8000/ws
- **Health Check**: http://localhost:8000/health

## File Organization

```
trader/
├── config/                  # Configuration files
│   ├── trading_params.yaml  # Trading parameters
│   └── api_keys.yaml        # API credentials (gitignored)
├── src/                     # Core trading system
│   ├── strategy/            # Quantitative strategies
│   ├── llm_engine/          # LLM expert system
│   ├── data/                # Data collection
│   ├── data_fetcher/        # Data sources
│   ├── risk_control/        # Risk management
│   ├── execution/           # Order execution
│   ├── backtest/            # Backtesting engine
│   ├── optimization/        # Strategy optimization
│   ├── monitoring/          # Performance monitoring
│   └── main_v2.py           # Main entry point
├── web_v2/                  # Web interface
│   ├── server/              # FastAPI backend
│   │   ├── api/             # API endpoints
│   │   ├── core/            # Bridge & WebSocket
│   │   ├── services/        # Background services
│   │   ├── models/          # Pydantic schemas
│   │   └── main.py          # FastAPI app
│   └── frontend/            # React frontend
│       ├── src/
│       │   ├── components/  # React components
│       │   ├── api/         # API clients
│       │   ├── hooks/       # Custom hooks
│       │   └── pages/       # Page components
│       └── package.json
├── tests/                   # Test suites
├── scripts/                 # Utility scripts
├── data/                    # Database files
└── start_web_v2.py          # Web launcher
```
