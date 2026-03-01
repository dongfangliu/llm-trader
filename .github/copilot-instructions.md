# Copilot Instructions

## What This Project Does

LLM-powered trading analysis/backtest repository with two main surfaces:
- **Futures backtest engine** (`src/backtest`) built on TqSDK + configurable decision engines (`quant_only`, `llm_direct`, `hybrid`)
- **Web analyzer app**: FastAPI backend (`backend/src/api`) + Next.js frontend (`frontend`)

Primary futures use-case is soda ash `KQ.m@CZCE.SA`, but the web API/frontend also supports A/HK/US/futures symbols.

## Build, Test, Lint, and Run Commands

### Install
```bash
pip install -r requirements.txt
cd frontend && npm install
```

### Backtest / CLI runs
```bash
# Default LLM-direct backtest
python src/backtest/llm_decision_backtest.py --start 2024-09-01 --end 2024-10-31

# Quant-only (no LLM)
python src/backtest/llm_decision_backtest.py --mode quant_only --start 2024-09-01 --end 2024-09-30

# Latest bar only
python src/backtest/llm_decision_backtest.py --latest --show_rationale

# Multi-timeframe
python src/backtest/llm_decision_backtest.py --decision-period 1440 --auxiliary-periods 60,240
```

### Web app run
```bash
# One-command start (Windows)
.\start.ps1

# Or run separately
cd backend && set PYTHONPATH=src && python -m uvicorn src.api.main:app --port 8000
cd frontend && npm run dev
```

### Build / lint
```bash
# Frontend build
cd frontend && npm run build

# Frontend lint
cd frontend && npm run lint
```

### Test / verification
There is no stable automated test suite wired in this repo yet; `backend/test_api.py` and `backend/test_frontend.py` are integration scripts.

```bash
# Integration smoke suite (backend must already be running)
python backend/test_api.py

# "Single test" style check
python -c "from backend.test_api import test_health; print(test_health())"

# Syntax check of a core file
python -m py_compile src/backtest/core/backtester.py
```

## High-Level Architecture

### 1) Backtest pipeline
`src/backtest/llm_decision_backtest.py` (argparse entry) -> `Backtester` event loop (`src/backtest/core/backtester.py`) -> selected engine `.decide(row, df)` -> `Decision` dataclass -> TqSDK `TargetPosTask` execution.

### 2) Decision engines and LLM stack
- `src/backtest/engines/quant_engine.py`: MA10/MA30 crossover + RSI filter
- `src/backtest/engines/llm_engine.py`: LLM-driven decisions + cache
- `src/backtest/engines/hybrid_engine.py`: quant signal first, LLM review fallback
- `src/llm_engine/*`: provider factory, market representation, prompt builder, response parser, specialized agents

### 3) Web API + frontend
- `backend/src/api/main.py` exposes auth, market data, analyze, usage/subscription endpoints
- `frontend/src/app/page.tsx` is the main analysis UI and reads usage tier/limits to gate features

## Key Conventions (Repo-Specific)

1. **Engine contract is strict**
   - Every decision engine must return `Decision` from `src/backtest/models/decision.py`.
   - New engine flow: add file in `src/backtest/engines/` and register in `Backtester._create_engine()`.

2. **Indicators are centralized**
   - Add/modify technical indicators only in `Backtester._calculate_technical_indicators()`; all bars reuse that output.

3. **Risk controls: hard vs soft stop-loss**
   - Hard stop (3x ATR) is enforced in `Backtester` and cannot be overridden by LLM.
   - Soft stop baseline is 1.5x ATR; LLM adjustments are capped (max 50% loosening) and audit-logged to `logs/stop_loss_adjustments.log`.

4. **LLM response parsing path**
   - LLM outputs are cleaned through `ResponseParser.clean_response()` before JSON parse (strips code fences/comments).
   - Prompts should request raw JSON (no markdown fences).

5. **Caching semantics**
   - LLM decision cache is keyed by ISO timestamp (`tafunc.time_to_datetime(...).isoformat()`).
   - Use `--cache llm_decision_cache.json` to reuse results across runs.

6. **Subscription and multi-symbol behavior (important wording + behavior)**
   - Premium multi-symbol analysis is currently implemented at `/api/analyze/batch` with up to 5 symbols, and quota is consumed **per symbol**.
   - Product wording should treat this as **“连续多次单条查询，并可回看查询结果”** rather than “并行查询”.
   - If you modify this area, keep UI text, API semantics, and quota accounting aligned.

7. **Config precedence and locations**
   - Main configs: `config/api_keys.yaml`, `config/trading_params.yaml`.
   - Provider can be `claude`, `openai`, `deepseek`, `custom`.
   - Environment API keys (e.g., `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`) override file values.

8. **Operational logs**
   - Main run logs: `logs/llm_backtest_YYYYMMDD_HHMMSS.log`
   - Stop-loss adjustment audit: `logs/stop_loss_adjustments.log`
   - Use `--debug` and `--show_rationale` for investigation sessions.
