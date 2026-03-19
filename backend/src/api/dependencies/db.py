# Re-export get_db from new_db for convenience
from src.database.new_db import get_db, async_session

__all__ = ["get_db", "async_session"]
