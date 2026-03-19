from typing import Optional
from fastapi import Depends, HTTPException, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from src.database.new_db import get_db
from src.models.user import User
from src.config import settings

import jwt
from datetime import datetime, timezone

security = HTTPBearer(auto_error=False)


def decode_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        return payload
    except Exception:
        return None


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    if not credentials:
        raise HTTPException(status_code=401, detail="Authorization required")
    payload = decode_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")
    result = await db.execute(select(User).where(User.id == int(user_id)))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


async def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> Optional[User]:
    if not credentials:
        return None
    try:
        payload = decode_token(credentials.credentials)
        if not payload or not payload.get("sub"):
            return None
        result = await db.execute(select(User).where(User.id == int(payload["sub"])))
        return result.scalar_one_or_none()
    except Exception:
        return None


async def require_admin(
    user: User = Depends(get_current_user),
) -> User:
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


async def get_admin_token_or_admin_user(
    x_admin_token: Optional[str] = Header(None),
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> bool:
    """Allow access if X-Admin-Token header matches settings.admin_token, OR if user is admin."""
    # Check X-Admin-Token header first
    if x_admin_token and settings.admin_token and x_admin_token == settings.admin_token:
        return True
    # Check if JWT user is admin
    if credentials:
        try:
            payload = decode_token(credentials.credentials)
            if payload and payload.get("sub"):
                result = await db.execute(select(User).where(User.id == int(payload["sub"])))
                user = result.scalar_one_or_none()
                if user and user.is_admin:
                    return True
        except Exception:
            pass
    raise HTTPException(status_code=403, detail="Admin access required")
