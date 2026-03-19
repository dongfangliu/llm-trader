"""Analysis service - task submission, status, history."""
from typing import Optional
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from src.models.analysis import AnalysisRequest as AnalysisTask, AnalysisHistory
from src.models.user import User


async def submit_analysis(
    db: AsyncSession,
    redis_pool,
    symbol: str,
    market: str,
    period: str,
    task_id: str,
    subscription: str = "free",
    usage_mode: str = "device",
    user_id: Optional[int] = None,
    device_id: Optional[str] = None,
    history_days: int = 90,
    holding_quantity: Optional[float] = None,
    cost_price: Optional[float] = None,
    max_position: Optional[float] = None,
) -> str:
    """Submit analysis task to worker queue. Returns task_id.

    Enqueues the ``analyze_task`` arq function using the exact positional
    argument order expected by ``backend/src/worker/tasks.py``.
    """
    # Create DB record
    task_record = AnalysisTask(
        user_id=user_id,
        symbol=symbol.upper(),
        market=market,
        period=period,
        status="pending",
    )
    db.add(task_record)
    await db.commit()

    # Enqueue to arq worker — positional args must match analyze_task signature exactly:
    # analyze_task(ctx, task_id, symbol, market, period, history_days,
    #              holding_quantity, cost_price, max_position,
    #              subscription, usage_mode, user_id, device_id)
    await redis_pool.enqueue_job(
        "analyze_task",
        task_id,
        symbol.upper(),
        market,
        period,
        history_days,
        holding_quantity,
        cost_price,
        max_position,
        subscription,
        usage_mode,
        user_id,
        device_id,
        _job_id=task_id,
    )

    return task_id


async def get_task_status(redis_pool, task_id: str) -> dict:
    """Get task status from Redis key ``task:{task_id}``."""
    import json
    raw = await redis_pool.get(f"task:{task_id}")
    if raw is None:
        return {"task_id": task_id, "status": "pending", "result": None}
    try:
        data = json.loads(raw)
        return data
    except Exception:
        return {"task_id": task_id, "status": "pending", "result": None}


async def get_history(
    db: AsyncSession,
    user_id: int,
    page: int = 1,
    per_page: int = 20,
) -> tuple[list, int]:
    """Get analysis history for a user."""
    from sqlalchemy import func

    offset = (page - 1) * per_page

    result = await db.execute(
        select(AnalysisHistory)
        .where(AnalysisHistory.user_id == user_id)
        .order_by(desc(AnalysisHistory.analyzed_at))
        .offset(offset)
        .limit(per_page)
    )
    items = result.scalars().all()

    count_result = await db.execute(
        select(func.count(AnalysisHistory.id))
        .where(AnalysisHistory.user_id == user_id)
    )
    total = count_result.scalar() or 0

    return list(items), total


async def delete_history_item(db: AsyncSession, user_id: int, item_id: int) -> bool:
    """Delete a history item. Returns True if deleted, False if not found."""
    result = await db.execute(
        select(AnalysisHistory)
        .where(AnalysisHistory.id == item_id, AnalysisHistory.user_id == user_id)
    )
    item = result.scalar_one_or_none()
    if not item:
        return False
    await db.delete(item)
    await db.commit()
    return True


async def toggle_favorite(db: AsyncSession, user_id: int, item_id: int) -> Optional[bool]:
    """Toggle favorite on a history item. Returns new state or None if not found."""
    result = await db.execute(
        select(AnalysisHistory)
        .where(AnalysisHistory.id == item_id, AnalysisHistory.user_id == user_id)
    )
    item = result.scalar_one_or_none()
    if not item:
        return None
    item.is_favorited = not item.is_favorited
    await db.commit()
    return item.is_favorited
