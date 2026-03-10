"""Redis connection utilities shared by API server and arq worker."""
import os
from arq.connections import RedisSettings


def get_redis_settings() -> RedisSettings:
    """Parse REDIS_URL into arq RedisSettings."""
    url = os.getenv("REDIS_URL", "redis://localhost:6379")
    import urllib.parse
    parsed = urllib.parse.urlparse(url)
    return RedisSettings(
        host=parsed.hostname or "localhost",
        port=parsed.port or 6379,
        password=parsed.password or None,
        database=int(parsed.path.lstrip("/") or 0),
    )


REDIS_SETTINGS = get_redis_settings()

# TTL constants
TASK_TTL = 3600           # task result kept in Redis for 1h
CACHE_TTL_INTRADAY = 900  # 15 min for intraday periods (1/5/15/30/60 min)
CACHE_TTL_DAILY = 14400   # 4h for daily period
INTRADAY_PERIODS = {"1", "5", "15", "30", "60"}


def cache_ttl(period: str) -> int:
    return CACHE_TTL_INTRADAY if period in INTRADAY_PERIODS else CACHE_TTL_DAILY
