"""Scheduler for model-record generation and settlement.

This module only generates internal predictions and settles approved records.
"""

from loguru import logger
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

_scheduler: AsyncIOScheduler | None = None


def get_scheduler() -> AsyncIOScheduler:
    global _scheduler
    if _scheduler is None:
        _scheduler = AsyncIOScheduler(timezone="Asia/Shanghai")
    return _scheduler


async def start_scheduler():
    """Start scheduled jobs only when xbot is in auto mode."""
    scheduler = get_scheduler()
    if scheduler.running:
        return

    config = await _load_config()
    if not _is_auto_enabled(config):
        logger.info("Model-record scheduler not started (manual mode or disabled)")
        return

    _register_jobs(scheduler, config)
    scheduler.start()
    logger.info("Model-record scheduler started")


async def stop_scheduler():
    scheduler = get_scheduler()
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("Model-record scheduler stopped")


def _register_jobs(scheduler: AsyncIOScheduler, config: dict):
    """Register generation and settlement jobs."""
    for job_id in ("xbot_settle_a", "xbot_settle_hk", "xbot_generate"):
        try:
            scheduler.remove_job(job_id)
        except Exception:
            pass

    a_settle_time = config.get("xbot_a_settle_time", "15:30")
    hk_settle_time = config.get("xbot_hk_settle_time", "16:30")
    predict_time = config.get("xbot_predict_time", "16:45")

    a_sh, a_sm = _parse_time(a_settle_time)
    hk_sh, hk_sm = _parse_time(hk_settle_time)
    pred_h, pred_m = _parse_time(predict_time)

    scheduler.add_job(
        job_settle_a_shares,
        CronTrigger(hour=a_sh, minute=a_sm, day_of_week="mon-fri", timezone="Asia/Shanghai"),
        id="xbot_settle_a",
        replace_existing=True,
        misfire_grace_time=3600,
    )
    scheduler.add_job(
        job_settle_hk_shares,
        CronTrigger(hour=hk_sh, minute=hk_sm, day_of_week="mon-fri", timezone="Asia/Shanghai"),
        id="xbot_settle_hk",
        replace_existing=True,
        misfire_grace_time=3600,
    )
    scheduler.add_job(
        job_generate_predictions,
        CronTrigger(hour=pred_h, minute=pred_m, day_of_week="mon-fri", timezone="Asia/Shanghai"),
        id="xbot_generate",
        replace_existing=True,
        misfire_grace_time=1800,
    )

    logger.info(
        "Model-record jobs registered: settle_a={}, settle_hk={}, generate={}",
        a_settle_time,
        hk_settle_time,
        predict_time,
    )


async def job_generate_predictions(force: bool = False):
    """Select hot stocks and generate internal predictions."""
    config = await _load_config()
    if not force and not _is_auto_enabled(config):
        return

    markets = [m.strip() for m in config.get("xbot_markets", "a,hk").split(",") if m.strip()]
    count = int(config.get("xbot_hot_stock_count", 5))
    logger.info("[ModelRecords] Generating predictions for markets={}, count={}", markets, count)

    from src.services.xbot.hot_stocks_service import get_hot_stocks, get_hk_hot_stocks
    from src.services.xbot.prediction_service import generate_predictions
    from src.database.new_db import async_session

    hot_stocks = []
    if "a" in markets:
        hot_stocks.extend(
            await get_hot_stocks(
                count=count,
                min_price=float(config.get("xbot_min_price_a", 5)),
            )
        )
    if "hk" in markets:
        hot_stocks.extend(
            await get_hk_hot_stocks(
                count=count,
                min_price=float(config.get("xbot_min_price_hk", 1)),
            )
        )

    if not hot_stocks:
        logger.warning("[ModelRecords] No hot stocks fetched, aborting generation")
        return

    async with async_session() as db:
        created = await generate_predictions(hot_stocks, db)
    logger.info("[ModelRecords] Created {} predictions", len(created))


async def job_settle_a_shares(force: bool = False):
    """Settle A-share approved predictions."""
    await _settle_for_market("a", force=force)


async def job_settle_hk_shares(force: bool = False):
    """Settle HK approved predictions."""
    await _settle_for_market("hk", force=force)


async def _settle_for_market(market: str, force: bool = False):
    """Settle predictions for a specific market."""
    config = await _load_config()
    if not force and not _is_auto_enabled(config):
        return

    from src.services.xbot.result_service import settle_predictions_for_market
    from src.database.new_db import async_session

    async with async_session() as db:
        settled_count = await settle_predictions_for_market(db, market)
    logger.info("[ModelRecords] Settled {} {} predictions", settled_count, market.upper())


async def _load_config() -> dict:
    """Load xbot-related settings from DB."""
    try:
        from src.database.new_db import async_session
        from sqlalchemy import select
        from src.models.settings import SystemSetting

        xbot_keys = [
            "xbot_enabled",
            "xbot_operation_mode",
            "xbot_markets",
            "xbot_hot_stock_count",
            "xbot_min_price_a",
            "xbot_min_price_hk",
            "xbot_predict_time",
            "xbot_a_settle_time",
            "xbot_hk_settle_time",
        ]
        async with async_session() as db:
            result = await db.execute(select(SystemSetting).where(SystemSetting.key.in_(xbot_keys)))
            return {row.key: row.value for row in result.scalars().all()}
    except Exception as e:
        logger.warning("Failed to load model-record config: {}", e)
        return {}


def _is_enabled(config: dict) -> bool:
    return config.get("xbot_enabled", "false") == "true"


def _is_auto_enabled(config: dict) -> bool:
    return _is_enabled(config) and config.get("xbot_operation_mode", "manual") == "auto"


def _parse_time(time_str: str):
    try:
        h, m = map(int, time_str.split(":"))
        return h, m
    except Exception:
        return 16, 15
