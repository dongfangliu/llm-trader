"""Pytest configuration for local backend tests."""

import os
from pathlib import Path
import asyncio


os.environ.setdefault("ADMIN_TOKEN", "test-token")
os.makedirs("data", exist_ok=True)


def pytest_configure(config):
    from src.database.new_db import init_db

    asyncio.run(init_db())


def pytest_ignore_collect(collection_path: Path, config):
    """Keep the live-server smoke script out of the regular unit test run."""
    if collection_path.name == "test_api.py" and os.environ.get("RUN_LIVE_API_TESTS") != "1":
        return True
    return False
