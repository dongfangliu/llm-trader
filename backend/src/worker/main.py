"""arq worker entry point.

Run with:
    python -m src.worker.main
or via docker-compose worker service.
"""
import logging
import sys
from loguru import logger
from arq import run_worker
from src.worker.redis_client import REDIS_SETTINGS
from src.worker.tasks import analyze_task
from src.database.new_db import init_db


# ---------------------------------------------------------------------------
# Logging setup: route all standard logging through loguru so that
# third-party libraries (arq, httpx, sqlalchemy, etc.) and tasks.py logs
# all appear in the same unified stream.
# ---------------------------------------------------------------------------
class _InterceptHandler(logging.Handler):
    """Forward stdlib logging records to loguru."""

    def emit(self, record: logging.LogRecord) -> None:
        try:
            level = logger.level(record.levelname).name
        except ValueError:
            level = record.levelno
        frame, depth = sys._getframe(6), 6
        while frame and frame.f_code.co_filename == logging.__file__:
            frame = frame.f_back
            depth += 1
        logger.opt(depth=depth, exception=record.exc_info).log(level, record.getMessage())


# Replace the root handler; force=True removes any basicConfig handlers first
logging.basicConfig(handlers=[_InterceptHandler()], level=logging.DEBUG, force=True)

# Also quiet noisy libraries to INFO level
for _noisy in ("httpx", "httpcore", "asyncio", "arq"):
    logging.getLogger(_noisy).setLevel(logging.INFO)


async def startup(ctx: dict):
    """Called once when the worker starts."""
    await init_db()
    logger.info("arq worker started, DB initialised")


async def shutdown(ctx: dict):
    """Called once when the worker shuts down."""
    logger.info("arq worker shutting down")


class WorkerSettings:
    functions = [analyze_task]
    on_startup = startup
    on_shutdown = shutdown
    redis_settings = REDIS_SETTINGS()  # call to get RedisSettings instance (arq 0.27 requires instance, not callable)
    max_jobs = 5           # max concurrent LLM calls
    job_timeout = 300      # 5 minutes per job
    keep_result = 3600     # keep job result in Redis for 1h
    retry_jobs = False     # don't retry failed LLM calls (cost safety)


if __name__ == "__main__":
    run_worker(WorkerSettings)
