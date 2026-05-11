"""XBot prediction model for automated X (Twitter) posting."""

from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, Date, Text

from src.models.base import Base


class XBotPrediction(Base):
    """Stores daily AI stock predictions for X bot posting and result tracking."""

    __tablename__ = "xbot_predictions"

    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String(50), nullable=False, index=True)
    market = Column(String(10), nullable=False)  # a, hk
    symbol_name = Column(String(100), nullable=False)
    hot_rank = Column(Integer, nullable=True)  # position in hot stocks list

    prediction_date = Column(Date, nullable=False, index=True)  # date prediction was generated
    target_date = Column(Date, nullable=False, index=True)      # trading day being predicted

    predicted_direction = Column(String(10), nullable=False)  # up / down / hold
    confidence = Column(Float, nullable=True)                  # 0-100
    target_price = Column(Float, nullable=True)
    stop_loss = Column(Float, nullable=True)
    close_price = Column(Float, nullable=True)  # closing price on prediction_date (baseline)
    analysis_summary = Column(Text, nullable=True)     # AI summary snippet for card
    market_diagnosis = Column(Text, nullable=True)     # 第一步：市场诊断
    opportunity_assessment = Column(Text, nullable=True)  # 第二步：机会评估
    risk_analysis = Column(Text, nullable=True)        # 第三步：风险收益
    execution_plan = Column(Text, nullable=True)       # 第四步：执行方案

    # Lifecycle status
    status = Column(String(20), nullable=False, default="pending", index=True)
    # pending → approved → posted → settled
    # or pending → rejected

    # Tweet tracking
    prediction_tweet_id = Column(String(100), nullable=True)
    result_tweet_id = Column(String(100), nullable=True)

    # Settlement (filled next trading day)
    actual_close = Column(Float, nullable=True)
    actual_change_pct = Column(Float, nullable=True)
    is_correct = Column(Boolean, nullable=True)

    # Engagement metrics (synced periodically)
    likes_count = Column(Integer, nullable=False, default=0)
    retweets_count = Column(Integer, nullable=False, default=0)

    # Model-review retry metadata
    attempts = Column(Integer, nullable=True)               # number of LLM calls used to produce this record
    met_confidence = Column(Boolean, nullable=True)         # True = at least one attempt hit the configured threshold

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
