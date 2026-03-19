"""arq worker entry point.

Run with:
    python -m src.worker.main
or via docker-compose worker service.
"""
import logging
from arq import run_worker
from src.worker.redis_client import REDIS_SETTINGS
from src.worker.tasks import analyze_task
from src.database.new_db import init_db

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


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
