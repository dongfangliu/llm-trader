# Copilot Instructions

## What This Project Does

LLM-powered futures trading backtest system for Chinese futures markets (primarily soda ash `KQ.m@CZCE.SA`). Combines TqSDK (天勤量化) for market data/execution with LLM inference (Claude/OpenAI/DeepSeek) for trading decisions.

## Running the System

```bash
# Install dependencies
pip install -r requirements.txt

# Run backtest (default: llm_direct mode)
python src/backtest/llm_decision_backtest.py --start 2024-09-01 --end 2024-10-31

# Quant-only (no LLM needed)
python src/backtest/llm_decision_backtest.py --mode quant_only --start 2024-09-01 --end 2024-09-30

# Analyze latest bar only (no full backtest)
python src/backtest/llm_decision_backtest.py --latest --show_rationale

# Multi-timeframe: daily primary + 4h and 1h auxiliary
python src/backtest/llm_decision_backtest.py --decision-period 1440 --auxiliary-periods 60,240
```

There are no automated tests in this repo. Syntax-check a file with:
```bash
python -m py_compile src/backtest/core/backtester.py
```

## Architecture

```
src/
├── backtest/
│   ├── llm_decision_backtest.py   # CLI entry point (argparse → Backtester)
│   ├── core/backtester.py         # TqSDK event loop, stop-loss enforcement, engine dispatch
│   ├── engines/                   # Decision engines (all return Decision objects)
│   │   ├── quant_engine.py        # MA10/MA30 crossover + RSI filter
│   │   ├── llm_engine.py          # LLM prompt + parse + cache
│   │   └── hybrid_engine.py       # Quant signal → LLM review if confidence < threshold
│   └── models/
│       ├── decision.py            # Decision dataclass (the contract between engines and backtester)
│       ├── config.py              # BTConfig dataclass
│       └── position.py            # Position state
└── llm_engine/
    ├── llm_factory.py             # Reads config/api_keys.yaml, returns ClaudeClient or OpenAIClient
    ├── market_representation.py   # Three-level market data → text (raw / feature / state summary)
    ├── prompt_builder.py          # Prompt templates for strategic/tactical layers
    ├── response_parser.py         # Strips markdown, parses JSON, fills defaults
    ├── prompts/                   # Modular prompt templates (signal_conflict, expert_review, etc.)
    └── *_agent.py                 # Strategic / tactical / review / daily-review agents
```

**Data flow**: `llm_decision_backtest.py` → `Backtester` (TqSDK event loop) → engine `.decide(row, df)` → `Decision` → `TargetPosTask` (TqSDK order execution).

## Key Conventions

### Adding a New Decision Engine
1. Create `src/backtest/engines/my_engine.py`, implement `decide(row: pd.Series, df: pd.DataFrame) -> Decision`
2. Register it in `Backtester._create_engine()` in `core/backtester.py`

### Extending Technical Indicators
Add calculations in `Backtester._calculate_technical_indicators()` in `core/backtester.py`. Indicators are recomputed every bar automatically.

### LLM Decision Caching
Cached decisions are keyed by ISO timestamp (`tafunc.time_to_datetime(row["timestamp"]).isoformat()`). Pass `--cache llm_decision_cache.json` to reuse decisions across runs. `LLMDirectEngine.current_pos` and `current_balance` are injected by `Backtester` before each bar.

### Stop-Loss Rules
- **Hard stop** (3× ATR): enforced in `Backtester`, LLM cannot override it
- **Soft stop** (1.5× ATR): LLM can adjust via `Decision.adjust_stop_loss` / `override_stop_loss`, but max loosening is 50%; all adjustments are audit-logged to `logs/stop_loss_adjustments.log`

### LLM Response Parsing
All LLM responses go through `ResponseParser.clean_response()` before JSON parsing — it strips markdown code fences and `//` comments. Prompts should instruct the model to return raw JSON without markdown.

### LLM Provider Configuration
Set `provider:` in `config/api_keys.yaml` to `claude`, `openai`, `deepseek`, or `custom`. Provider-specific model/temperature overrides live in `trading_params.yaml` under `llm.provider_overrides.<provider>`. Environment variables (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`) take precedence over the config file.

## Configuration Files

| File | Purpose |
|------|---------|
| `config/api_keys.yaml` | LLM provider selection + API keys + TqSDK credentials |
| `config/trading_params.yaml` | Risk params, LLM model/temperature, backtest defaults |

Copy `config/api_keys.yaml.example` to `config/api_keys.yaml` to get started.

## Logging

- `logs/llm_backtest_YYYYMMDD_HHMMSS.log` — main run log (loguru)
- `logs/stop_loss_adjustments.log` — audit log for every LLM stop-loss change
- Use `--debug` flag for verbose output; `--show_rationale` to print LLM reasoning per bar
