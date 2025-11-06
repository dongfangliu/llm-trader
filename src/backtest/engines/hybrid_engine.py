"""Hybrid trading engine combining quant and LLM decision making."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, Optional

import pandas as pd
from tqsdk import tafunc

from src.backtest.engines.llm_engine import LLMDirectEngine
from src.backtest.engines.quant_engine import SimpleQuantEngine
from src.backtest.models.decision import Decision
from src.llm_engine.response_parser import ResponseParser


class HybridEngine:
    """Quant decision with optional LLM expert review when confidence is low."""

    def __init__(self, low_conf_th: float = 0.7, cache: Optional[Dict[str, Any]] = None, cache_write: Optional[Path] = None, max_pos: int = 1, feature_mode: str = "neutral", trade_meta: Optional[Dict[str, Any]] = None):
        self.low_conf_th = low_conf_th
        self.quant = SimpleQuantEngine(max_pos=max_pos)
        self.llm_direct = LLMDirectEngine(cache=cache, cache_write=cache_write, max_pos=max_pos, feature_mode=feature_mode, trade_meta=trade_meta)

    def decide(self, row: pd.Series, df: pd.DataFrame, symbol: str) -> Decision:
        q = self.quant.decide(row, df)
        if q.action == "hold" or q.confidence >= self.low_conf_th:
            return q
        # Ask LLM to approve/reject
        ts_key = tafunc.time_to_datetime(row["timestamp"]).isoformat()
        cache_key = f"review::{ts_key}"
        cached = self.llm_direct._cache_get(cache_key)
        if cached is not None:
            # Interpret cached as final decision
            return cached

        review_prompt = (
            "You are reviewing a quant signal. Return STRICT JSON: {\"approved\":bool, \"concerns\":[str], \"warnings\":[str]}\n"
            f"Signal: {json.dumps(q.to_dict(), ensure_ascii=False)}\n"
            "If not confident, set approved=false and add reasons."
        )
        try:
            client = self.llm_direct.client
            if client is None:
                return q
            raw = client.chat(review_prompt)
            resp = ResponseParser.parse_expert_review(raw)
            if not resp.get("approved", False):
                d = Decision(action="hold", position_size=0, confidence=0.0, rationale=["llm_reject"] + (resp.get("concerns") or []))
                self.llm_direct._cache_put(cache_key, d)
                return d
            # approved: keep quant
            d = Decision(**q.to_dict())
            d.rationale = (d.rationale or []) + ["llm_approved"]
            self.llm_direct._cache_put(cache_key, d)
            return d
        except Exception:
            return q
