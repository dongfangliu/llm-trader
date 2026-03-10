"""Redis connection utilities shared by API server and arq worker."""
import urllib.parse
import os

from arq.connections import RedisSettings


def get_redis_settings() -> RedisSettings:
    """Parse REDIS_URL (from pydantic-settings) into arq RedisSettings."""
    # Import here to avoid circular import (db imports settings at module level)
    from src.database.db import settings as _settings
    url = _settings.redis_url
    parsed = urllib.parse.urlparse(url)
    try:
        db_index = int(parsed.path.lstrip("/") or 0)
    except ValueError:
        raise ValueError(
            f"Invalid Redis database index in REDIS_URL '{url}': "
            f"path '{parsed.path}' must be a numeric database number (e.g., /0)"
        )
    return RedisSettings(
        host=parsed.hostname or "localhost",
        port=parsed.port or 6379,
        password=parsed.password,
        username=parsed.username,
        database=db_index,
        ssl=parsed.scheme == "rediss",
    )


# Callable form — arq WorkerSettings.redis_settings accepts both a RedisSettings
# instance and a zero-argument callable returning one. Using a callable avoids
# baking the settings at import time (important for tests and env overrides).
REDIS_SETTINGS = get_redis_settings  # callable, not instance

# TTL constants
TASK_TTL = 3600            # task result kept in Redis for 1h
CACHE_TTL_INTRADAY = 900   # 15 min for intraday periods (1/5/15/30/60 min)
CACHE_TTL_DAILY = 14400    # 4h for daily period
INTRADAY_PERIODS = {"1", "5", "15", "30", "60"}


def cache_ttl(period: str) -> int:
    """Return cache TTL in seconds for the given bar period."""
    return CACHE_TTL_INTRADAY if period in INTRADAY_PERIODS else CACHE_TTL_DAILY
