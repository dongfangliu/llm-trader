"""FastAPI server for LLM Trading Strategy Analyzer."""
from __future__ import annotations

import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.api.jobs import job_manager
from src.ui.runner import load_preset_providers, load_tq_credentials, load_trading_params

app = FastAPI(title="LLM Trading Analyzer")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

_HTML_PATH = ROOT / "src" / "ui" / "static" / "index.html"


@app.get("/", response_class=HTMLResponse)
def index():
    return _HTML_PATH.read_text(encoding="utf-8")


@app.get("/api/config/defaults")
def get_defaults():
    tp = load_trading_params()
    tq = load_tq_credentials()
    presets = load_preset_providers()
    llm_def = tp.get("llm") or {}
    trading_def = tp.get("trading") or {}
    decision_def = tp.get("decision") or {}
    raw_conf = decision_def.get("confidence_threshold", 70)
    default_conf = raw_conf / 100.0 if raw_conf > 1 else raw_conf
    first = list(presets.keys())[0] if presets else ""
    first_cfg = presets.get(first, {})
    return {
        "providers": list(presets.keys()),
        "provider": first,
        "api_key": first_cfg.get("api_key", ""),
        "base_url": first_cfg.get("base_url", ""),
        "model": llm_def.get("model", ""),
        "max_tokens": llm_def.get("max_tokens", 5000),
        "timeout": llm_def.get("timeout", 240),
        "temperature": llm_def.get("temperature", 1.0),
        "symbol": trading_def.get("symbol", "600519"),
        "initial_capital": trading_def.get("initial_capital", 100000),
        "max_position": trading_def.get("max_position", 100),
        "confidence_threshold": default_conf,
        "tq_username": tq.get("username", ""),
    }


@app.get("/api/config/provider/{name}")
def get_provider_config(name: str):
    presets = load_preset_providers()
    tp = load_trading_params()
    cfg = presets.get(name, {})
    model = (
        (tp.get("llm") or {}).get("provider_overrides", {}).get(name, {}).get("model")
        or (tp.get("llm") or {}).get("model", "")
    )
    return {"api_key": cfg.get("api_key", ""), "base_url": cfg.get("base_url", ""), "model": model}


class AnalyzeRequest(BaseModel):
    data_source: str = "akshare"
    symbol: str
    market: str = "a"
    period: str = "daily"
    history_days: int = 90
    decision_period: int = 240
    auxiliary_periods: str = ""
    mode: str = "llm_direct"
    llm_provider: str = ""
    api_key: str = ""
    base_url: str = ""
    llm_model: str = ""
    max_tokens: int = 5000
    timeout: int = 240
    temperature: float = 1.0
    initial_position: int = 0
    entry_price: float = 0.0
    initial_capital: float = 100000.0
    max_position: int = 100
    confidence_threshold: float = 0.6
    margin_ratio: float = 0.18
    contract_multiplier: int = 20
    commission_per_lot: float = 3.0
    slippage_ticks: int = 1
    tq_username: str = ""
    tq_password: str = ""
    tq_use_sim: bool = True


@app.post("/api/analyze")
def submit_analyze(req: AnalyzeRequest):
    if not req.symbol.strip():
        raise HTTPException(status_code=400, detail="品种代码不能为空")
    effective_provider = req.llm_provider if req.llm_provider not in ("", "自定义") else "openai"
    params: Dict[str, Any] = {
        "data_source": req.data_source,
        "symbol": req.symbol.strip(),
        "market": req.market,
        "period": req.period,
        "history_days": req.history_days,
        "decision_period": req.decision_period,
        "auxiliary_periods": req.auxiliary_periods,
        "mode": req.mode,
        "llm_config": {
            "provider": effective_provider,
            "api_key": req.api_key,
            "base_url": req.base_url,
            "model": req.llm_model,
            "max_tokens": req.max_tokens,
            "timeout": req.timeout,
            "temperature": req.temperature,
        },
        "initial_position": req.initial_position,
        "entry_price": req.entry_price,
        "initial_capital": req.initial_capital,
        "max_position": req.max_position,
        "confidence_threshold": req.confidence_threshold,
        "margin_ratio": req.margin_ratio,
        "contract_multiplier": req.contract_multiplier,
        "commission_per_lot": req.commission_per_lot,
        "slippage_ticks": req.slippage_ticks,
        "tqsdk_config": {
            "username": req.tq_username,
            "password": req.tq_password,
            "use_sim": req.tq_use_sim,
        },
    }
    job_id = job_manager.submit(params)
    return {"job_id": job_id}


@app.get("/api/jobs")
def list_jobs():
    return job_manager.list_jobs()


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str):
    job = job_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job
