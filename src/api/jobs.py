"""Concurrent job manager for analysis requests."""
from __future__ import annotations

import math
import threading
import traceback
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from typing import Any, Dict, List, Optional

import pandas as pd


class JobManager:
    def __init__(self, max_workers: int = 4):
        self._jobs: Dict[str, Dict] = {}
        self._lock = threading.Lock()
        self._executor = ThreadPoolExecutor(max_workers=max_workers, thread_name_prefix="analysis")

    def submit(self, params: Dict[str, Any]) -> str:
        job_id = uuid.uuid4().hex[:8]
        with self._lock:
            self._jobs[job_id] = {
                "id": job_id,
                "status": "running",
                "symbol": params.get("symbol", ""),
                "mode": params.get("mode", ""),
                "data_source": params.get("data_source", ""),
                "submitted_at": datetime.now().strftime("%H:%M:%S"),
                "result": None,
                "error": None,
                "traceback": None,
            }
        self._executor.submit(self._run, job_id, params)
        return job_id

    def _run(self, job_id: str, params: Dict[str, Any]) -> None:
        from src.ui.runner import run_analysis
        try:
            raw = run_analysis(params)
            with self._lock:
                self._jobs[job_id]["status"] = "done"
                self._jobs[job_id]["result"] = self._serialize(raw)
        except BaseException as exc:
            with self._lock:
                self._jobs[job_id]["status"] = "error"
                self._jobs[job_id]["error"] = str(exc)
                self._jobs[job_id]["traceback"] = traceback.format_exc()

    @staticmethod
    def _serialize(raw: Dict[str, Any]) -> Dict[str, Any]:
        decision = raw.get("decision")
        row = raw.get("row")
        df = raw.get("df")

        def clean(v):
            try:
                f = float(v)
                return None if (math.isnan(f) or math.isinf(f)) else round(f, 4)
            except (TypeError, ValueError):
                return None

        result: Dict[str, Any] = {
            "data_source": raw.get("data_source", ""),
            "symbol": raw.get("symbol", ""),
            "decision": decision.to_dict() if decision else None,
            "row": {},
            "klines": [],
        }

        # Serialize pandas Series row → plain dict
        if row is not None:
            for k, v in row.items():
                cf = clean(v)
                result["row"][str(k)] = cf if cf is not None else str(v)

        # Serialize df tail(20) → list of dicts
        if df is not None and not df.empty:
            recent = df.tail(20).copy()

            # Build time column
            time_vals: Optional[List[str]] = None
            if "datetime" in recent.columns:
                try:
                    from tqsdk import tafunc
                    time_vals = [
                        tafunc.time_to_datetime(int(x)).strftime("%Y-%m-%d %H:%M")
                        for x in recent["datetime"]
                    ]
                except Exception:
                    pass
                if time_vals is None:
                    try:
                        time_vals = pd.to_datetime(recent["datetime"], unit="ns").dt.strftime("%Y-%m-%d").tolist()
                    except Exception:
                        pass
            if time_vals is None and "timestamp" in recent.columns:
                try:
                    time_vals = pd.to_datetime(recent["timestamp"]).dt.strftime("%Y-%m-%d %H:%M").tolist()
                except Exception:
                    pass
            if time_vals is None:
                time_vals = recent.index.astype(str).tolist()

            num_cols = ["open", "high", "low", "close", "volume", "ma10", "ma30", "ma60", "rsi", "atr", "macd"]
            for i, (_, r) in enumerate(recent.iterrows()):
                row_dict: Dict[str, Any] = {"时间": time_vals[i] if i < len(time_vals) else ""}
                for c in num_cols:
                    if c in r.index:
                        row_dict[c] = clean(r[c])
                result["klines"].append(row_dict)

        return result

    def list_jobs(self) -> List[Dict]:
        """Return lightweight job summaries (no full result payload)."""
        with self._lock:
            out = []
            for j in reversed(list(self._jobs.values())):
                decision_action = None
                confidence = None
                if j.get("result") and j["result"] and j["result"].get("decision"):
                    d = j["result"]["decision"]
                    decision_action = d.get("action")
                    confidence = d.get("confidence")
                out.append({
                    "id": j["id"],
                    "status": j["status"],
                    "symbol": j["symbol"],
                    "mode": j["mode"],
                    "data_source": j["data_source"],
                    "submitted_at": j["submitted_at"],
                    "decision": decision_action,
                    "confidence": confidence,
                    "error": j.get("error"),
                })
            return out

    def get_job(self, job_id: str) -> Optional[Dict]:
        with self._lock:
            return self._jobs.get(job_id)


# Module-level singleton
job_manager = JobManager()
