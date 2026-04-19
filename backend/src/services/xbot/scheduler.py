"""APScheduler-based scheduler for XBot daily jobs."""

import asyncio
from datetime import datetime
from loguru import logger

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

_scheduler: AsyncIOScheduler = None


def get_scheduler() -> AsyncIOScheduler:
    global _scheduler
    if _scheduler is None:
        _scheduler = AsyncIOScheduler(timezone="Asia/Shanghai")
    return _scheduler


async def start_scheduler():
    """Start the APScheduler with all xbot jobs."""
    scheduler = get_scheduler()
    if scheduler.running:
        return

    config = await _load_config()

    _register_jobs(scheduler, config)
    scheduler.start()
    logger.info("XBot scheduler started")


async def stop_scheduler():
    scheduler = get_scheduler()
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("XBot scheduler stopped")


def _register_jobs(scheduler: AsyncIOScheduler, config: dict):
    """Register all xbot cron jobs."""
    predict_time = config.get("xbot_predict_time", "16:15")
    post_time = config.get("xbot_post_time", "16:30")
    result_time = config.get("xbot_result_time", "09:30")

    predict_h, predict_m = _parse_time(predict_time)
    post_h, post_m = _parse_time(post_time)
    result_h, result_m = _parse_time(result_time)

    # Job A: Generate predictions (Mon-Fri, after market close)
    scheduler.add_job(
        job_generate_predictions,
        CronTrigger(hour=predict_h, minute=predict_m, day_of_week="mon-fri", timezone="Asia/Shanghai"),
        id="xbot_generate",
        replace_existing=True,
        misfire_grace_time=1800,
    )

    # Job B: Auto-post approved predictions (Mon-Fri)
    scheduler.add_job(
        job_auto_post,
        CronTrigger(hour=post_h, minute=post_m, day_of_week="mon-fri", timezone="Asia/Shanghai"),
        id="xbot_post",
        replace_existing=True,
        misfire_grace_time=1800,
    )

    # Job C: Settle and post results next morning (Tue-Sat, after previous day settled)
    scheduler.add_job(
        job_settle_and_post_results,
        CronTrigger(hour=result_h, minute=result_m, day_of_week="tue-sat", timezone="Asia/Shanghai"),
        id="xbot_settle",
        replace_existing=True,
        misfire_grace_time=3600,
    )

    # Job D: Sync tweet engagement metrics
    scheduler.add_job(
        job_sync_metrics,
        CronTrigger(hour="*/6", timezone="Asia/Shanghai"),
        id="xbot_metrics",
        replace_existing=True,
    )

    logger.info(
        f"XBot jobs registered — predict: {predict_time}, post: {post_time}, result: {result_time} (CST)"
    )


async def job_generate_predictions():
    """Job A: Select hot stocks and generate AI predictions."""
    config = await _load_config()
    if not _is_enabled(config):
        return

    count = int(config.get("xbot_stocks_count", 5))
    logger.info(f"[XBot] Generating predictions for {count} stocks")

    from src.services.xbot.hot_stocks_service import get_hot_stocks
    from src.services.xbot.prediction_service import generate_predictions
    from src.database.new_db import async_session

    hot_stocks = await get_hot_stocks(count=count)
    if not hot_stocks:
        logger.warning("[XBot] No hot stocks fetched, aborting prediction job")
        return

    async with async_session() as db:
        created = await generate_predictions(hot_stocks, db)
    logger.info(f"[XBot] Created {len(created)} predictions")


async def job_auto_post():
    """Job B: Post approved predictions (only runs when auto_post=true)."""
    config = await _load_config()
    if not _is_enabled(config):
        return
    if config.get("xbot_auto_post", "false") != "true":
        logger.info("[XBot] Auto-post disabled, skipping job B")
        return

    posted = await post_approved_predictions()
    logger.info(f"[XBot] Auto-posted {posted} predictions")


async def job_settle_and_post_results():
    """Job C: Settle predictions and post result tweets."""
    config = await _load_config()
    if not _is_enabled(config):
        return

    from src.services.xbot.result_service import settle_predictions, get_accuracy_stats
    from src.services.xbot.x_publisher import get_publisher_from_settings
    from src.database.new_db import async_session
    from sqlalchemy import select
    from src.models.xbot import XBotPrediction

    async with async_session() as db:
        settled_count = await settle_predictions(db)
        logger.info(f"[XBot] Settled {settled_count} predictions")

        if settled_count == 0:
            return

        stats = await get_accuracy_stats(db)

        # Fetch settled predictions without result tweet
        result = await db.execute(
            select(XBotPrediction).where(
                XBotPrediction.status == "settled",
                XBotPrediction.result_tweet_id.is_(None),
            )
        )
        predictions = result.scalars().all()

    publisher = await get_publisher_from_settings()
    if not publisher:
        logger.warning("[XBot] Twitter not configured, skipping result tweets")
        return

    for pred in predictions:
        try:
            tweet_id = await _post_result_thread(pred, publisher, config, stats)
            if tweet_id:
                async with async_session() as db:
                    from sqlalchemy import update
                    await db.execute(
                        update(XBotPrediction)
                        .where(XBotPrediction.id == pred.id)
                        .values(result_tweet_id=tweet_id)
                    )
                    await db.commit()
            await asyncio.sleep(30)
        except Exception as e:
            logger.error(f"[XBot] Failed to post result for {pred.symbol}: {e}")


async def job_sync_metrics():
    """Job D: Sync tweet engagement metrics."""
    from src.services.xbot.x_publisher import get_publisher_from_settings
    from src.database.new_db import async_session
    from sqlalchemy import select, update
    from src.models.xbot import XBotPrediction

    publisher = await get_publisher_from_settings()
    if not publisher:
        return

    async with async_session() as db:
        result = await db.execute(
            select(XBotPrediction).where(
                XBotPrediction.prediction_tweet_id.is_not(None),
            ).limit(50)
        )
        predictions = result.scalars().all()

        for pred in predictions:
            try:
                if pred.prediction_tweet_id:
                    m = publisher.get_tweet_metrics(pred.prediction_tweet_id)
                    await db.execute(
                        update(XBotPrediction)
                        .where(XBotPrediction.id == pred.id)
                        .values(likes_count=m["likes"], retweets_count=m["retweets"])
                    )
            except Exception:
                pass
        await db.commit()


async def _post_prediction_thread(pred, publisher, config, stats) -> str | None:
    """Post 2-tweet thread: promise card (single) → 4 data cards (2×2). Returns tweet1 id."""
    from src.services.xbot.card_service import generate_prediction_card_set

    product_url = config.get("xbot_product_url", "")
    acc_7d = stats.get("7d", {})

    cards = await generate_prediction_card_set(
        pred,
        product_url=product_url,
        accuracy_7d=acc_7d.get("label", "—"),
        accuracy_7d_pct=acc_7d.get("pct", 0),
    )

    dir_cn = {"up": "看涨", "down": "看跌", "hold": "震荡"}.get(pred.predicted_direction or "", "")
    tweet1_id = publisher.post_tweet(
        f"{pred.symbol_name} · {dir_cn}\n明日见分晓",
        media_ids=publisher.upload_media_batch([cards.get("promise")]),
    )
    if not tweet1_id:
        logger.error(f"[XBot] Promise tweet failed for {pred.symbol}")
        return None

    await asyncio.sleep(2)

    data_ids = publisher.upload_media_batch([
        cards.get("data_conf"), cards.get("data_price"),
        cards.get("data_heat"), cards.get("data_record"),
    ])
    tweet2_text = f"为什么这么判断 ↓\n{product_url}" if product_url else "为什么这么判断 ↓"
    publisher.post_tweet(tweet2_text, media_ids=data_ids, reply_to_tweet_id=tweet1_id)

    return tweet1_id


async def _post_result_thread(pred, publisher, config, stats) -> str | None:
    """Post 2-tweet result thread: proof card (single) → 4 data cards (2×2). Returns tweet1 id."""
    from src.services.xbot.card_service import generate_result_card_set

    product_url = config.get("xbot_product_url", "")
    hashtags = config.get("xbot_hashtags", "#A股 #AI选股")
    acc_7d = stats.get("7d", {})
    acc_30d = stats.get("30d", {})

    cards = await generate_result_card_set(
        pred,
        accuracy_7d=acc_7d.get("label", "—"),
        accuracy_7d_pct=acc_7d.get("pct", 0),
        accuracy_30d=acc_30d.get("label", "—"),
        product_url=product_url,
    )

    tweet1_text = "说到做到 ✓\n今日新预测已发布" if pred.is_correct else "未中，结果公开 ✗\n今日继续"
    tweet1_id = publisher.post_tweet(
        tweet1_text,
        media_ids=publisher.upload_media_batch([cards.get("proof")]),
    )
    if not tweet1_id:
        logger.error(f"[XBot] Proof tweet failed for {pred.symbol}")
        return None

    await asyncio.sleep(2)

    data_ids = publisher.upload_media_batch([
        cards.get("data_conf"), cards.get("data_price"),
        cards.get("data_heat"), cards.get("data_record"),
    ])
    tweet2_text = f"完整分析\n{product_url}  {hashtags}" if product_url else f"完整分析  {hashtags}"
    publisher.post_tweet(tweet2_text, media_ids=data_ids, reply_to_tweet_id=tweet1_id)

    return tweet1_id


async def post_approved_predictions() -> int:
    """Post all approved predictions as 2-tweet threads. Returns count posted."""
    from src.services.xbot.x_publisher import get_publisher_from_settings
    from src.services.xbot.result_service import get_accuracy_stats
    from src.database.new_db import async_session
    from sqlalchemy import select, update
    from src.models.xbot import XBotPrediction

    config = await _load_config()
    publisher = await get_publisher_from_settings()
    if not publisher:
        logger.warning("[XBot] Twitter not configured")
        return 0

    async with async_session() as db:
        result = await db.execute(
            select(XBotPrediction).where(XBotPrediction.status == "approved")
        )
        predictions = result.scalars().all()
        stats = await get_accuracy_stats(db)

    posted = 0
    for pred in predictions:
        try:
            tweet_id = await _post_prediction_thread(pred, publisher, config, stats)
            if tweet_id:
                async with async_session() as db:
                    await db.execute(
                        update(XBotPrediction)
                        .where(XBotPrediction.id == pred.id)
                        .values(status="posted", prediction_tweet_id=tweet_id)
                    )
                    await db.commit()
                posted += 1
            await asyncio.sleep(30)
        except Exception as e:
            logger.error(f"[XBot] Failed to post prediction for {pred.symbol}: {e}")

    return posted


async def _load_config() -> dict:
    """Load xbot-related settings from DB."""
    try:
        from src.database.new_db import async_session
        from sqlalchemy import select
        from src.models.settings import SystemSetting

        xbot_keys = [
            "xbot_enabled", "xbot_auto_post", "xbot_stocks_count",
            "xbot_product_url", "xbot_predict_time", "xbot_post_time",
            "xbot_result_time", "xbot_hashtags", "xbot_disclaimer",
            "xbot_tweet_template", "xbot_result_template",
            "xbot_twitter_api_key", "xbot_twitter_api_secret",
            "xbot_twitter_access_token", "xbot_twitter_access_token_secret",
        ]
        async with async_session() as db:
            result = await db.execute(
                select(SystemSetting).where(SystemSetting.key.in_(xbot_keys))
            )
            return {row.key: row.value for row in result.scalars().all()}
    except Exception as e:
        logger.warning(f"Failed to load xbot config: {e}")
        return {}


def _is_enabled(config: dict) -> bool:
    return config.get("xbot_enabled", "false") == "true"


def _parse_time(time_str: str):
    try:
        h, m = map(int, time_str.split(":"))
        return h, m
    except Exception:
        return 16, 15
