"""New FastAPI application entry-point (v2 clean architecture).

Keep the old main.py untouched; this file will replace it once all phases
are complete.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from arq import create_pool

from src.config import settings
from src.database.new_db import init_db
from src.api.routers import auth, analyze, subscription, market, admin
from src.api.routers import config as config_router
from src.worker.redis_client import get_redis_settings


# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    app.state.redis = await create_pool(get_redis_settings())
    yield
    await app.state.redis.aclose()


# ---------------------------------------------------------------------------
# Application
# ---------------------------------------------------------------------------

app = FastAPI(
    title="LLM Trading Analyzer API",
    version="2.0.0",
    description="Clean-architecture rewrite of the AI stock analysis backend.",
    lifespan=lifespan,
)

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------
origins = [o.strip() for o in settings.allowed_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins if origins != ["*"] else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------

app.include_router(config_router.router)
app.include_router(auth.router)
app.include_router(analyze.router)
app.include_router(subscription.router)
app.include_router(market.router)
app.include_router(admin.router)
