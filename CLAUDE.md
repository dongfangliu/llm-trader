# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an LLM-powered intelligent futures trading system for Soda Ash (SA601) contracts. The system has evolved from pure LLM-based decision-making to a hybrid "Quantitative Strategies + LLM Expert Review" architecture, combining the speed and reliability of quantitative strategies with the deep reasoning capabilities of LLMs.

**Target Instrument**: Soda Ash futures (纯碱SA601)
**Language**: Python 3.x
**Mode**: Simulated trading with market data from TqSDK
**Architecture**: V4 - Quantitative-first with LLM assistance

## Commands

### Run the System

**Main trading system**:

```bash
# V2 - Quantitative + LLM (Current version)
# Quantitative strategies as primary decision maker, LLM for complex situations
python src/main_v2.py
```

**Launch web interface**:
```bash
# FastAPI + React web interface (V2 - Current)
python start_web_v2.py

# Access at:
# - Interactive API docs: http://localhost:8000/docs
# - ReDoc documentation: http://localhost:8000/redoc
# - WebSocket: ws://localhost:8000/ws
```

**Note**: The legacy V1 pure LLM system (`src/main.py`) and old web interfaces (Flask/Streamlit) have been deprecated in favor of the V2 architecture.

**Run backtest**:
```bash
# TqSDK native backtesting engine
python -m src.backtest.backtester

# Strategy backtesting with optimization
python src/backtest/strategy_backtester.py
```

### Development & Testing

**Install dependencies**:
```bash
# Python dependencies
pip install -r requirements.txt

# Web frontend dependencies (optional, for web interface)
cd web_v2/frontend
npm install
cd ../..
```

**Note**: TA-Lib requires manual installation on Windows. Download wheel from https://www.lfd.uci.edu/~gohlke/pythonlibs/#ta-lib

See `INSTALL.md` for detailed installation instructions.

**Test individual modules**:
```bash
# Test LLM connection
python -c "from src.llm_engine.llm_factory import LLMFactory; client = LLMFactory.create_client(); print(f'✓ LLM client created: {type(client).__name__}')"

# Test data source
python src/data_fetcher/data_source_factory.py

# Test quantitative strategies
python tests/test_phase2_strategies.py

# Test LLM system integration
python tests/test_llm_system.py

# Full integration test
python tests/test_integration.py

# Test Week 15 fixes
python scripts/test_fixes.py
```

**Optimize database**:
```bash
# Run database performance optimization
python scripts/optimize_database.py
```

**Monitor performance**:
```python
# Get system performance statistics
from src.monitoring.performance_monitor import get_monitor

monitor = get_monitor()
monitor.print_summary()  # Print performance summary
alerts = monitor.check_alerts()  # Check for performance alerts
```

**View logs**:
```powershell
# Windows (PowerShell)
Get-Content logs/trading_$(Get-Date -Format "yyyyMMdd").log -Wait -Tail 50

# Linux/Mac
tail -f logs/trading_YYYYMMDD.log
```

**Query database**:
```python
from src.data_fetcher.database import Database
db = Database("data/market_data.db")

# Get today's trades
trades = db.get_today_trades()

# Get recent lessons (for V1 system)
lessons = db.get_active_lessons(limit=5)
```

## Architecture

### V2 Hybrid Architecture (main_v2.py)

The V2 system implements a "quantitative-first" approach where traditional quantitative strategies make most decisions, with LLM providing expert review only when needed:

```
Data Collection (every 3s)
    ↓
Quantitative Strategy Layer (every 15min)
├── Market Regime Detection (trend/ranging/breakout/abnormal)
├── Strategy Signal Generation (trend following, mean reversion, breakout)
└── Calculate confidence score
    ↓
LLM Trigger Check
├── Confidence < 85%?        → expert_review
├── Market abnormal?          → abnormal_analysis
├── Signal conflict?          → signal_conflict
└── Manual request?           → manual_request
    ↓
LLM Expert Review (triggered 3-5x/day, not every decision)
├── Build context-specific prompt
├── Call LLM API
├── Parse response (100% fault-tolerant)
└── Return adjustment recommendation
    ↓
Risk Control (every 3s)
    ↓
Order Execution
    ↓
Daily Review (21:00) → Extract lessons
```

**Key Advantages of V2**:
- **95% lower LLM cost**: From $50/month → <$5/month
- **Faster decisions**: <100ms for quantitative signals vs 3-5s for LLM
- **Higher reliability**: System runs without LLM if API fails
- **Backtestable**: All quantitative strategies can be backtested and optimized
- **Still intelligent**: LLM reviews complex/ambiguous situations

### Quantitative Strategy Layer

**Market Regime Detection** (`src/strategy/market_regime.py`):
- Analyzes ADX, volatility, Bollinger Bands to identify market state
- Returns: `trend` / `ranging` / `breakout` / `abnormal`
- Used by signal router to select appropriate strategy

**Signal Router** (`src/strategy/signal_router.py`):
- Routes signals to appropriate strategy based on market regime
- Trend market → Trend Following Strategy
- Ranging market → Mean Reversion Strategy
- Breakout setup → Breakout Strategy
- Abnormal market → Conservative/LLM review

**Three Core Strategies**:

1. **Trend Following** (`src/strategy/trend_following.py`):
   - Multi-timeframe trend alignment
   - Enters on pullbacks in strong trends
   - Uses ATR for dynamic stops

2. **Mean Reversion** (`src/strategy/mean_reversion.py`):
   - Bollinger Band reversals
   - RSI overbought/oversold
   - Works best in ranging markets

3. **Breakout Strategy** (`src/strategy/breakout.py`):
   - Volume-confirmed breakouts
   - False breakout filtering
   - Key support/resistance levels

### LLM Expert System (V2)

**Four Trigger Scenarios**:

1. **Expert Review** (`src/llm_engine/prompts/expert_review.py`):
   - Triggered when quantitative signal confidence < 85%
   - LLM reviews signal and provides approve/reject recommendation
   - ~500 tokens per call

2. **Abnormal Analysis** (`src/llm_engine/prompts/abnormal_analysis.py`):
   - Triggered when market regime is "abnormal"
   - LLM analyzes unusual market conditions
   - Helps protect positions during volatility spikes

3. **Signal Conflict** (`src/llm_engine/prompts/signal_conflict.py`):
   - Triggered when multiple strategies give contradictory signals
   - LLM arbitrates between conflicting recommendations

4. **Daily Review** (`src/llm_engine/prompts/daily_review.py`):
   - Runs at 21:00 every day
   - LLM analyzes all trades and extracts lessons
   - Lessons stored in database for future reference

**LLM Trigger Logic** (`src/llm_engine/llm_trigger.py`):
```python
# Intelligent triggering - only calls LLM when truly needed
should_trigger, trigger_type = llm_trigger.should_trigger(
    signal={'action': 'open_long', 'confidence': 0.78},  # Low confidence
    market_state={'regime': 'abnormal'}  # Market volatility
)
# Returns: (True, 'expert_review')
```

**Response Parser** (`src/llm_engine/response_parser.py`):
- 100% fault-tolerant: Always returns valid response even if LLM output is malformed
- Handles JSON parsing errors gracefully
- Provides safe defaults when parsing fails

### Legacy Components

The codebase includes some legacy modules from the deprecated V1 architecture (pure LLM decision-making):
- `src/llm_engine/strategic_agent.py` - Strategic layer (4h intervals)
- `src/llm_engine/tactical_agent.py` - Tactical layer (15min intervals)
- `src/llm_engine/review_agent.py` - Daily review agent

These are kept for reference but are not used in the current V2 system. The V2 architecture uses:
- Quantitative strategies for decision-making
- `src/llm_engine/llm_trigger.py` for intelligent LLM triggering
- `src/llm_engine/daily_review_agent.py` for daily reviews

### Data Architecture

**Multi-Timeframe K-line System** (`src/data/multi_timeframe_kline_v2.py`):
- Manages 1m, 15m, 1h, 4h, 1d K-lines simultaneously
- Automatic alignment and resampling
- Used by quantitative strategies for multi-timeframe analysis

**Technical Indicators** (`src/data/indicators_v2.py`):
- Comprehensive indicator library: MA, MACD, RSI, Bollinger, ATR, ADX, etc.
- Optimized for performance with pandas/numpy
- Used by all quantitative strategies

**Order Flow Analysis** (`src/data/order_flow_v2.py`):
- Bid/ask imbalance tracking
- Large order detection
- VWAP deviation analysis
- Provides microstructure insights

**Data Collection** (`src/data/data_collector_v2.py`):
- Centralized data collection from TqSDK
- Automatic indicator calculation
- Thread-safe storage to database

**Database** (`src/data_fetcher/database.py`):
- SQLite storage for K-lines, trades, decisions, reviews, lessons
- All tables use AUTOINCREMENT IDs
- K-lines have UNIQUE constraints on (timestamp, period)

### Risk Control

**Adaptive Risk Control** (`src/risk_control/adaptive_risk_control.py`):
- ATR-based dynamic stop-loss
- Position sizing based on volatility
- Drawdown-based exposure reduction
- More sophisticated than V1's fixed stops

**Position Sizer** (`src/risk_control/position_sizer.py`):
- Kelly Criterion for optimal position sizing
- Risk-per-trade limits
- Account balance scaling

**Realtime Monitor** (`src/risk_control/realtime_monitor.py`):
- Continuous position monitoring
- Automatic stop-loss/take-profit execution
- Emergency controls

### Execution Layer

**Smart Executor** (`src/execution/smart_executor.py`):
- Supports multiple execution algorithms:
  - TWAP (Time-Weighted Average Price)
  - Iceberg orders (hide large orders)
  - Chase orders (follow market)
  - Slippage control

**Order Algorithms**:
- `twap_order.py`: Break large orders into small time slices
- `iceberg_order.py`: Display only portion of order size
- `chase_order.py`: Aggressive execution to capture momentum
- `slippage_control.py`: Monitor and limit slippage

### Web Interface (V2)

**FastAPI + React Architecture** (`web_v2/`):
- **Backend** (`web_v2/server/`):
  - FastAPI RESTful API with auto-generated OpenAPI docs
  - WebSocket support for real-time data streaming
  - CORS middleware for frontend communication
  - Pydantic models for data validation
  - Bridge layer connects to trading system database

- **Frontend** (`web_v2/frontend/`):
  - React 18 + Vite build system
  - Ant Design UI component library
  - ECharts for real-time K-line charts
  - Zustand for state management
  - Axios for API communication

- **API Modules** (`web_v2/server/api/`):
  - `kline.py`: K-line data endpoints (multi-timeframe)
  - `account.py`: Account balance and position info
  - `signal.py`: Trading signals and strategy status
  - `control.py`: Start/stop trading, manual orders
  - `system.py`: System health, logs, performance metrics

- **Launch**: `python start_web_v2.py`
- **Access**:
  - Frontend: http://localhost:8000 (default)
  - API Docs: http://localhost:8000/docs
  - WebSocket: ws://localhost:8000/ws

**Configuration** (`web_v2/server/utils/config.py`):
- Port: 8000 (default)
- CORS origins: localhost:3000, localhost:5173
- Mock data mode: Set `USE_MOCK_DATA` for testing without trading system

## Configuration

**Main config**: `config/trading_params.yaml`
- `decision`: Strategic/tactical intervals, confidence threshold, max trades
- `risk`: Stop-loss amounts, drawdown limits, holding time
- `llm`: Model selection, temperature, token limits
- `trading`: Initial capital, position sizing, symbol
- `data`: Fetch intervals, history depth

**API keys**: `config/api_keys.yaml`
```yaml
provider: deepseek  # claude, openai, deepseek, custom

providers:
  claude:
    api_key: sk-ant-xxx...

  openai:
    api_key: sk-xxx...
    base_url: https://api.openai.com/v1

  deepseek:
    api_key: sk-xxx...
    base_url: https://api.deepseek.com

  custom:
    api_key: YOUR_API_KEY_HERE
    base_url: https://your-api-endpoint.com/v1

tqsdk:
  username: your_username
  password: your_password
  use_sim: true  # Use simulation account
```

**Supported LLM Providers**:
- **Claude (Anthropic)**: Best quality (claude-3-5-sonnet-20241022)
- **OpenAI**: GPT-4, GPT-3.5-turbo
- **DeepSeek**: Cost-effective, supports Chain-of-Thought (recommended for development)
- **Tongyi Qianwen**: Chinese LLM (base_url: https://dashscope.aliyuncs.com/compatible-mode/v1)
- **Zhipu AI (GLM)**: base_url: https://open.bigmodel.cn/api/paas/v4
- **Kimi (Moonshot)**: Long context (base_url: https://api.moonshot.cn/v1)
- **Local Ollama**: Offline, free (base_url: http://localhost:11434/v1)
- **Custom**: Any OpenAI-compatible API

**Test LLM connection**:
```bash
python -c "from src.llm_engine.llm_factory import LLMFactory; client = LLMFactory.create_client(); print('✓ Connected to', type(client).__name__)"
```

See `config/README_CONFIG.md` for detailed provider setup instructions.

## Key Technical Details

**Current System**:
- **main_v2.py** is the current production version (quantitative-first with LLM assistance)
- Legacy V1 pure LLM system has been deprecated
- V2 advantages: 95% lower LLM cost (~$5/month vs $50/month), faster decisions, higher reliability

**LLM Cost (V2)**:
- ~3-5 LLM calls/day × 500 tokens = 96K tokens/month ≈ <$5/month
- Quantitative strategies handle routine decisions without LLM

**Market Regime States**:
- `trend`: Strong directional movement (ADX > 25)
- `ranging`: Choppy sideways (ADX < 20, narrow Bollinger)
- `breakout`: Price near key levels with volume buildup
- `abnormal`: Volatility spike, liquidity issues, unusual patterns

**Soda Ash Contract Specs** (embedded in risk_rules.py):
- 1 contract = 5 tons
- 1 tick = 1 yuan
- Used for stop-loss price calculations

**Database Schema**:
- `kline_minute` / `kline_daily`: K-line data
- `trades`: Trade records
- `decisions`: Full LLM prompts and responses (V1) or trigger events (V2)
- `reviews`: Daily review results
- `lessons`: Extracted lessons with status (active/inactive)
- `signals`: Quantitative strategy signals (V2)

**Scheduling** (main_v2.py):
- Data fetch: every 3s
- Quantitative decision: every 15min
- Risk check: every 3s
- Daily review: 21:00

**Error Handling**:
- LLM failures → V2 uses quantitative signal, V1 logs warning and skips
- Data fetch failures → logged, retry on next cycle
- Risk rule violations → immediate force close

## Common Pitfalls

1. **TA-Lib not installed**: System will crash. Windows users must install wheel manually.

2. **API key not configured**: V2 can run without LLM (pure quantitative), V1 requires LLM. Check logs for warnings.

3. **Wrong main program**: Use `main_v2.py` for the current V2 architecture. The legacy `main.py` (V1) has been deprecated.

4. **TqSDK not configured**: System cannot fetch market data without TqSDK credentials in `config/api_keys.yaml`.

5. **Non-trading hours**: TqSDK may return stale data outside market hours. System handles gracefully but won't make decisions.

6. **Port conflicts**:
   - Web V2 (FastAPI): port 8000 (change in `web_v2/server/utils/config.py`)
   - If port 8000 is occupied, modify `PORT` setting or set `PORT` environment variable

7. **Database locks**: SQLite uses `check_same_thread=False` for multi-threaded access. Don't change this.

8. **Prompt format errors**: LLM responses must be pure JSON. If seeing parse errors, check LLM responses in database.

9. **Strategy conflicts**: If multiple strategies give signals, signal router uses confidence scores to select best. Check `signal_router.py` logic.

10. **Missing indicators**: V2 strategies require many technical indicators. Ensure data_processor calculates all needed indicators.

11. **Web frontend not building**:
   - Ensure Node.js >= 18.0.0 and npm >= 9.0.0
   - Run `npm install` in `web_v2/frontend/` directory
   - Frontend runs on port 5173 (dev) or 8000 (production)
   - Backend API must be running on port 8000 for frontend to fetch data

## Extending the System

**Add new quantitative strategy**:
1. Create strategy file in `src/strategy/` (see `trend_following.py` as template)
2. Implement `generate_signal(data)` method returning `{action, confidence, reason}`
3. Register in `signal_router.py`
4. Add tests in `tests/test_phase2_strategies.py`
5. Backtest with `strategy_backtester.py`

**Add new technical indicators**:
Edit `src/data/indicators_v2.py`. Add calculation method, then ensure it's called in `data_collector_v2.py`.

**Add new LLM trigger condition**:
Edit `src/llm_engine/llm_trigger.py:should_trigger()`. Add new condition check and corresponding trigger type.

**Modify LLM prompts**:
Edit files in `src/llm_engine/prompts/`. Keep prompts concise (<600 tokens) to minimize cost.

**Add new risk rules**:
Edit `src/risk_control/adaptive_risk_control.py` or `risk_rules.py` depending on whether rule is adaptive or fixed.

**Connect to real broker**:
System uses TqSDK which supports real accounts:
1. Set `use_sim: false` in `config/api_keys.yaml`
2. Provide real account credentials
3. TqSDK supports SimNow simulation and real futures accounts
4. For other brokers: Implement executor interface (see `tqsdk_executor.py`)

**Change LLM provider**:
Edit `config/api_keys.yaml`, set `provider` field and configure corresponding API key/base_url.

**Customize backtesting**:
- TqSDK backtester: `src/backtest/backtester.py` (event-driven, uses real order API)
- Strategy backtester: `src/backtest/strategy_backtester.py` (for quantitative strategies)
- Performance analysis: `src/backtest/performance_analyzer.py`
- Optimization: `src/optimization/grid_search.py`, `walk_forward.py`, `monte_carlo.py`

**Develop web frontend**:
The web_v2 frontend is a React + Vite application:
1. **Development mode** (with hot reload):
   ```bash
   cd web_v2/frontend
   npm run dev
   # Access at http://localhost:5173
   ```
2. **Production build**:
   ```bash
   cd web_v2/frontend
   npm run build
   # Built files go to dist/
   ```
3. **Backend and frontend architecture**:
   - Backend runs on port 8000 (FastAPI)
   - Frontend dev server runs on port 5173 (Vite)
   - CORS is configured to allow cross-origin requests
   - In production, frontend build can be served by FastAPI

## Documentation

**Installation & Setup**:
- `INSTALL.md`: Complete installation guide for Python, TA-Lib, and frontend dependencies
- `config/README_CONFIG.md`: Detailed LLM provider configuration guide

**User Guides**:
- `docs/USER_MANUAL.md`: End-user operation guide (if exists)
- `docs/OPERATIONS_GUIDE.md`: Daily operation procedures (if exists)

**Developer Guides**:
- `docs/DEVELOPER_GUIDE.md`: Code architecture, API docs (if exists)
- `docs/QUANT_EXPERT_SYSTEM_DESIGN.md`: V2 architecture design rationale (if exists)
- `docs/DATA_ARCHITECTURE_V4.md`: Data layer design (if exists)

**API Documentation**:
- Interactive API docs: http://localhost:8000/docs (when web_v2 is running)
- ReDoc: http://localhost:8000/redoc (alternative API documentation)

## Safety & Disclaimer

This system uses **simulation mode** by default. It does NOT place real orders unless explicitly configured with real broker credentials.

If extending for real trading:
1. Test extensively on simulation accounts (SimNow)
2. Start with very small position sizes
3. Understand that both quantitative strategies and LLMs can make errors
4. Keep risk limits very strict
5. Monitor continuously - do not leave unattended

**This system is for educational and research purposes only. Futures trading involves substantial risk of loss.**

## Project Maintenance

**Clean Python cache**:
```powershell
# Windows (PowerShell)
Get-ChildItem -Recurse -Directory -Filter "__pycache__" | Remove-Item -Recurse -Force

# Linux/Mac
find . -type d -name "__pycache__" -exec rm -rf {} +
```

**Update dependencies**:
```bash
pip list --outdated
pip install --upgrade package_name
```

**Run tests**:
```bash
# All tests
pytest

# Integration tests
python tests/test_integration.py

# Stress tests
python tests/test_stress.py
```
