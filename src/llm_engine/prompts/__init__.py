"""
LLM Prompt模板模块

包含4个场景化Prompt模板：
1. expert_review - 专家复核（置信度<85%）
2. abnormal_analysis - 异常分析（市场异常）
3. signal_conflict - 信号冲突（多策略分歧）
4. daily_review - 每日复盘（21:00）
"""

from .expert_review import ExpertReviewPrompt
from .abnormal_analysis import AbnormalAnalysisPrompt
from .signal_conflict import SignalConflictPrompt
from .daily_review import DailyReviewPrompt

__all__ = [
    'ExpertReviewPrompt',
    'AbnormalAnalysisPrompt',
    'SignalConflictPrompt',
    'DailyReviewPrompt'
]
