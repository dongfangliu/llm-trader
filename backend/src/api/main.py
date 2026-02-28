"""FastAPI main application."""

import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Optional

from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from src.database.db import init_db, get_db, User
from src.services.user import user_service
from src.services.data import data_service
from src.services.llm import llm_service

# Initialize database on startup
@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(
    title="LLM Trading Analyzer API",
    description="AI-powered stock and futures analysis service",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ===================== Request Models =====================


class LoginRequest(BaseModel):
    """WeChat login request."""
    openid: str
    username: Optional[str] = None


class AnalyzeRequest(BaseModel):
    """Analysis request."""
    symbol: str
    market: str = "a"  # a, hk, us, futures
    period: str = "daily"  # daily, 1, 5, 15, 30, 60
    history_days: int = 90

    # LLM configuration
    llm_provider: str = "openai"
    api_key: str = ""
    base_url: str = ""
    model: str = "gpt-4o-mini"
    max_tokens: int = 2000
    temperature: float = 0.7


class SubscriptionRequest(BaseModel):
    """Subscription upgrade request."""
    tier: str  # basic, premium


# ===================== Dependencies =====================


async def get_current_user(
    authorization: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Get current authenticated user."""
    if not authorization:
        # For development, create a temp user
        openid = f"dev_{uuid.uuid4().hex[:8]}"
        user = await user_service.get_or_create_user(db, openid, "dev_user")
        return user

    # Extract token from "Bearer <token>"
    if authorization.startswith("Bearer "):
        token = authorization[7:]
    else:
        token = authorization

    payload = user_service.decode_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")

    user = await user_service.get_user_info(db, int(user_id))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return user


# ===================== Auth Routes =====================


@app.post("/api/auth/login")
async def login(req: LoginRequest, db: AsyncSession = Depends(get_db)):
    """WeChat login - get or create user."""
    user = await user_service.get_or_create_user(db, req.openid, req.username)

    # Create access token
    access_token = user_service.create_access_token(
        data={"sub": str(user.id)},
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "username": user.username,
            "subscription_tier": user.subscription_tier,
        },
    }


@app.get("/api/auth/me")
async def get_me(current_user: User = Depends(get_current_user)):
    """Get current user info."""
    return {
        "id": current_user.id,
        "username": current_user.username,
        "subscription_tier": current_user.subscription_tier,
        "daily_usage": current_user.daily_usage,
        "last_usage_date": current_user.last_usage_date.isoformat() if current_user.last_usage_date else None,
    }


# ===================== Subscription Routes =====================


@app.post("/api/subscription/upgrade")
async def upgrade_subscription(
    req: SubscriptionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upgrade user subscription (manual for now, can integrate Ko-fi later)."""
    if req.tier not in ["basic", "premium"]:
        raise HTTPException(status_code=400, detail="Invalid tier")

    await user_service.update_subscription(db, current_user.id, req.tier)

    return {"message": f"Subscription upgraded to {req.tier}"}


# ===================== Analysis Routes =====================


@app.post("/api/analyze")
async def analyze(
    req: AnalyzeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Analyze stock/futures with LLM."""
    # Check daily limit
    has_limit, remaining = await user_service.check_daily_limit(db, current_user)
    if not has_limit:
        raise HTTPException(
            status_code=429,
            detail=f"Daily limit reached. Please upgrade to continue.",
        )

    # Validate inputs
    if not req.symbol.strip():
        raise HTTPException(status_code=400, detail="Symbol cannot be empty")

    if not req.api_key:
        raise HTTPException(status_code=400, detail="API key is required")

    try:
        # Fetch market data
        df = await data_service.fetch_market_data(
            symbol=req.symbol.strip(),
            market=req.market,
            period=req.period,
            start_date=None,
            end_date=None,
        )

        if df.empty:
            raise HTTPException(status_code=404, detail="No data found for symbol")

        # Analyze with LLM
        result = await llm_service.analyze_with_llm(
            df=df,
            provider=req.llm_provider,
            api_key=req.api_key,
            base_url=req.base_url,
            model=req.model,
            max_tokens=req.max_tokens,
            temperature=req.temperature,
        )

        # Increment usage
        await user_service.increment_usage(db, current_user)

        # Get updated limit info
        _, new_remaining = await user_service.check_daily_limit(db, current_user)

        return {
            "result": result,
            "usage": {
                "remaining": new_remaining,
                "tier": current_user.subscription_tier,
            },
            "data": {
                "symbol": req.symbol,
                "market": req.market,
                "latest_price": float(df.iloc[-1]["close"]),
                "latest_date": datetime.fromtimestamp(df.iloc[-1]["datetime"] / 1e9).isoformat(),
            },
        }

    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@app.get("/api/analyze/limits")
async def get_limits(current_user: User = Depends(get_current_user)):
    """Get user's daily usage limits."""
    has_limit, remaining = await user_service.check_daily_limit(db=None, user=current_user)

    limits = {"free": 1, "basic": 5, "premium": 15}
    daily_limit = limits.get(current_user.subscription_tier, 1)

    return {
        "tier": current_user.subscription_tier,
        "daily_limit": daily_limit,
        "used": current_user.daily_usage,
        "remaining": remaining,
    }


# ===================== Market Data Routes =====================


@app.get("/api/market/{market}/{symbol}")
async def get_market_data(
    market: str,
    symbol: str,
    period: str = "daily",
    history_days: int = 90,
):
    """Get raw market data (without LLM analysis)."""
    try:
        df = await data_service.fetch_market_data(
            symbol=symbol,
            market=market,
            period=period,
            start_date=None,
            end_date=None,
        )

        # Convert to dict (last 100 rows max)
        data = df.tail(100).to_dict(orient="records")

        # Convert datetime to string
        for row in data:
            if "datetime" in row:
                row["datetime"] = datetime.fromtimestamp(row["datetime"] / 1e9).isoformat()

        return {
            "symbol": symbol,
            "market": market,
            "period": period,
            "count": len(data),
            "data": data,
        }

    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ===================== Health Check =====================


@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat()}


# ===================== Root =====================


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "name": "LLM Trading Analyzer API",
        "version": "1.0.0",
        "docs": "/docs",
    }
