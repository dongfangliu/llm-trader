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
    a_settle_time  = config.get("xbot_a_settle_time", "15:30")
    hk_settle_time = config.get("xbot_hk_settle_time", "16:30")
    predict_time   = config.get("xbot_predict_time", "16:45")

    a_sh, a_sm   = _parse_time(a_settle_time)
    hk_sh, hk_sm = _parse_time(hk_settle_time)
    pred_h, pred_m = _parse_time(predict_time)

    # Job A: Settle A-share predictions (Mon-Fri 15:30, A市收盘后)
    scheduler.add_job(
        job_settle_a_shares,
        CronTrigger(hour=a_sh, minute=a_sm, day_of_week="mon-fri", timezone="Asia/Shanghai"),
        id="xbot_settle_a",
        replace_existing=True,
        misfire_grace_time=3600,
    )

    # Job B: Settle HK predictions (Mon-Fri 16:30, 港股收盘后)
    scheduler.add_job(
        job_settle_hk_shares,
        CronTrigger(hour=hk_sh, minute=hk_sm, day_of_week="mon-fri", timezone="Asia/Shanghai"),
        id="xbot_settle_hk",
        replace_existing=True,
        misfire_grace_time=3600,
    )

    # Job C: Generate next-day predictions (Mon-Fri 16:45, 两市均收盘)
    scheduler.add_job(
        job_generate_predictions,
        CronTrigger(hour=pred_h, minute=pred_m, day_of_week="mon-fri", timezone="Asia/Shanghai"),
        id="xbot_generate",
        replace_existing=True,
        misfire_grace_time=1800,
    )

    logger.info(
        f"XBot jobs registered — settle_a: {a_settle_time}, settle_hk: {hk_settle_time}, predict: {predict_time} (CST)"
    )


async def job_generate_predictions():
    """Job C: Select hot stocks and generate AI predictions for next trading day."""
    config = await _load_config()
    if not _is_enabled(config):
        return

    markets = [m.strip() for m in config.get("xbot_markets", "a,hk").split(",") if m.strip()]
    count = int(config.get("xbot_hot_stock_count", 5))
    logger.info(f"[XBot] Generating predictions for markets={markets}, count={count}")

    from src.services.xbot.hot_stocks_service import get_hot_stocks, get_hk_hot_stocks
    from src.services.xbot.prediction_service import generate_predictions
    from src.database.new_db import async_session

    hot_stocks = []
    if "a" in markets:
        a_stocks = await get_hot_stocks(
            count=count,
            min_price=float(config.get("xbot_min_price_a", 5)),
        )
        hot_stocks.extend(a_stocks)
    if "hk" in markets:
        hk_stocks = await get_hk_hot_stocks(
            count=count,
            min_price=float(config.get("xbot_min_price_hk", 1)),
        )
        hot_stocks.extend(hk_stocks)

    if not hot_stocks:
        logger.warning("[XBot] No hot stocks fetched, aborting prediction job")
        return

    async with async_session() as db:
        created = await generate_predictions(hot_stocks, db)
    logger.info(f"[XBot] Created {len(created)} predictions")


async def job_settle_a_shares():
    """Job A: Settle A-share predictions and post result tweets (runs after A-share close)."""
    await _settle_and_post_for_market("a")


async def job_settle_hk_shares():
    """Job B: Settle HK predictions and post result tweets (runs after HK close)."""
    await _settle_and_post_for_market("hk")


async def _settle_and_post_for_market(market: str):
    """Settle predictions for a specific market and post result tweets."""
    config = await _load_config()
    if not _is_enabled(config):
        return

    from src.services.xbot.result_service import settle_predictions_for_market, get_accuracy_stats
    from src.services.xbot.x_publisher import get_publisher_from_settings
    from src.database.new_db import async_session
    from sqlalchemy import select
    from src.models.xbot import XBotPrediction

    async with async_session() as db:
        settled_count = await settle_predictions_for_market(db, market)
        logger.info(f"[XBot] Settled {settled_count} {market.upper()} predictions")

        if settled_count == 0:
            return

        stats = await get_accuracy_stats(db)
        brand_name = await _get_app_name_from_db(db)

        result = await db.execute(
            select(XBotPrediction).where(
                XBotPrediction.status == "settled",
                XBotPrediction.market == market,
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
            tweet_id = await _post_result_thread(pred, publisher, config, stats, brand_name=brand_name)
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


async def _post_prediction_thread(pred, publisher, config, stats, brand_name: str = "") -> str | None:
    """Post 2-tweet thread: promise card (single) → 4 data cards (2×2). Returns tweet1 id."""
    from src.services.xbot.card_service import generate_prediction_card_set

    product_url = config.get("xbot_product_url", "")

    cards = await generate_prediction_card_set(
        pred,
        product_url=product_url,
        brand_name=brand_name,
        accuracy_all=stats.get("all", {}).get("label", "—"),
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

    data_ids = publisher.upload_media_batch([cards.get("data_record")])
    tweet2_text = f"为什么这么判断 ↓\n{product_url}" if product_url else "为什么这么判断 ↓"
    publisher.post_tweet(tweet2_text, media_ids=data_ids, reply_to_tweet_id=tweet1_id)

    return tweet1_id


async def _post_result_thread(pred, publisher, config, stats, brand_name: str = "") -> str | None:
    """Post 2-tweet result thread: proof card (single) → 4 data cards (2×2). Returns tweet1 id."""
    from src.services.xbot.card_service import generate_result_card_set

    product_url = config.get("xbot_product_url", "")
    hashtags = config.get("xbot_hashtags", "#A股 #K线AI分析")
    acc_all = stats.get("all", {})

    cards = await generate_result_card_set(
        pred,
        accuracy_all=acc_all.get("label", "—"),
        product_url=product_url,
        brand_name=brand_name,
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

    data_ids = publisher.upload_media_batch([cards.get("data_record")])
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
        brand_name = await _get_app_name_from_db(db)

    posted = 0
    for pred in predictions:
        try:
            tweet_id = await _post_prediction_thread(pred, publisher, config, stats, brand_name=brand_name)
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

    # Send Web Push notification if any predictions were posted
    if posted > 0:
        try:
            from src.services.push_service import send_push_to_all
            product_url = config.get("xbot_product_url", "/predictions")
            push_body = f"今日预测已发布，共 {posted} 只"
            async with async_session() as db:
                await send_push_to_all(
                    db,
                    title="📈 新预测发布",
                    body=push_body,
                    url=product_url or "/predictions",
                )
            logger.info(f"[XBot] Web Push sent for {posted} predictions")
        except Exception as e:
            logger.warning(f"[XBot] Web Push failed (non-critical): {e}")

    return posted


async def _load_config() -> dict:
    """Load xbot-related settings from DB."""
    try:
        from src.database.new_db import async_session
        from sqlalchemy import select
        from src.models.settings import SystemSetting

        xbot_keys = [
            "xbot_enabled", "xbot_markets", "xbot_hot_stock_count",
            "xbot_min_price_a", "xbot_min_price_hk",
            "xbot_product_url", "xbot_predict_time",
            "xbot_a_settle_time", "xbot_hk_settle_time",
            "xbot_settlement_mode", "xbot_hashtags", "xbot_disclaimer",
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


async def _get_app_name_from_db(db) -> str:
    """Read app.name from the 'app' SystemSetting section."""
    import json as _json
    from src.models.settings import SystemSetting
    try:
        row = await db.get(SystemSetting, "app")
        if row:
            return _json.loads(row.value).get("name", "")
    except Exception:
        pass
    return ""


def _is_enabled(config: dict) -> bool:
    return config.get("xbot_enabled", "false") == "true"


def _parse_time(time_str: str):
    try:
        h, m = map(int, time_str.split(":"))
        return h, m
    except Exception:
        return 16, 15
