"""Decision model for trading system."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any, Dict, List, Optional


class DecisionMode(str, Enum):
    QUANT_ONLY = "quant_only"
    LLM_DIRECT = "llm_direct"


@dataclass
class Decision:
    action: str  # 'open_long' | 'open_short' | 'close_long' | 'close_short' | 'adjust_position' | 'hold'
    position_size: int = 0
    stop_loss: float = 0.0
    take_profit: float = 0.0
    confidence: float = 0.0
    rationale: List[str] = None

    # Enhanced fields
    target_position: int = 0  # 目标持仓手数（用于adjust_position）
    position_percent: float = 0.0  # 目标仓位百分比
    market_regime: str = ""  # 识别的市场状态
    opportunity_quality: str = ""  # 机会质量评估
    risk_factors: List[str] = None  # 风险因素列表

    # Four-step reasoning chain
    market_diagnosis: str = ""  # 市场状态诊断
    opportunity_assessment: str = ""  # 交易机会评估
    risk_analysis: str = ""  # 风险收益分析
    execution_plan: str = ""  # 执行方案

    # LLM-controlled stop loss/take profit adjustment
    override_stop_loss: bool = False  # LLM是否要求忽略当前止损（需硬止损检查）
    adjust_stop_loss: Optional[float] = None  # LLM建议的新止损价（绝对价格）
    adjust_take_profit: Optional[float] = None  # LLM建议的新止盈价（绝对价格）
    adjustment_reason: str = ""  # 调整原因（必填，用于审计）

    # Cache validation
    decision_price: float = 0.0  # 决策时的价格，用于验证缓存有效性

    def to_dict(self) -> Dict[str, Any]:
        return {
            "action": self.action,
            "position_size": int(self.position_size),
            "target_position": int(self.target_position),
            "stop_loss": float(self.stop_loss or 0.0),
            "take_profit": float(self.take_profit or 0.0),
            "confidence": float(self.confidence or 0.0),
            "rationale": list(self.rationale or []),
            "position_percent": float(self.position_percent or 0.0),
            "market_regime": str(self.market_regime or ""),
            "opportunity_quality": str(self.opportunity_quality or ""),
            "risk_factors": list(self.risk_factors or []),
            "market_diagnosis": str(self.market_diagnosis or ""),
            "opportunity_assessment": str(self.opportunity_assessment or ""),
            "risk_analysis": str(self.risk_analysis or ""),
            "execution_plan": str(self.execution_plan or ""),
            # LLM adjustments
            "override_stop_loss": bool(self.override_stop_loss),
            "adjust_stop_loss": float(self.adjust_stop_loss or 0.0),
            "adjust_take_profit": float(self.adjust_take_profit or 0.0),
            "adjustment_reason": str(self.adjustment_reason or ""),
            # Cache validation
            "decision_price": float(self.decision_price or 0.0),
        }
