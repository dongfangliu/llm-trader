"""Authentication service - JWT, registration, login, email verification."""
from datetime import datetime, timedelta
from typing import Optional
import json
import jwt
import bcrypt
import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import HTTPException

from src.config import settings
from src.models.user import User
from src.models.settings import SystemSetting
from src.services.email_service import send_verification_email as _send_verification_email


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=settings.access_token_expire_minutes))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)


def create_verification_token(email: str) -> str:
    """Create short-lived email verification JWT."""
    data = {"sub": email, "purpose": "email_verification"}
    expire = datetime.utcnow() + timedelta(hours=24)
    data["exp"] = expire
    return jwt.encode(data, settings.secret_key, algorithm=settings.algorithm)


def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    except Exception:
        return None


async def register_user(db: AsyncSession, email: str, password: str, username: Optional[str] = None, invite_code: Optional[str] = None) -> User:
    """Register a new user."""
    # Check email not already used
    result = await db.execute(select(User).where(User.email == email.lower().strip()))
    existing = result.scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="该邮箱已被注册")

    if len(password) < 6:
        raise HTTPException(status_code=400, detail="密码至少6位")

    # Check if invite code is required
    app_row = await db.get(SystemSetting, "app")
    require_invite = False
    if app_row:
        try:
            require_invite = bool(json.loads(app_row.value).get("require_invite_code", False))
        except Exception:
            pass
    if require_invite:
        if not invite_code:
            raise HTTPException(status_code=400, detail="注册需要邀请码")
        result = await db.execute(select(User).where(User.invite_code == invite_code.upper()))
        if not result.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="邀请码无效")

    # Generate invite code for new user
    new_invite_code = str(uuid.uuid4())[:8].upper()

    user = User(
        email=email.lower().strip(),
        hashed_password=hash_password(password),
        username=username or email.lower().strip().split("@")[0],
        email_verified=False,
        subscription_tier="free",
        has_had_pro_trial=False,
        is_admin=False,
        bonus_quota=0,
        invite_code=new_invite_code,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    # Send verification email
    verification_token = create_verification_token(email.lower().strip())
    try:
        await _send_verification_email_new(db, user, verification_token)
    except Exception as e:
        # Don't fail registration if email fails
        import logging
        logging.getLogger(__name__).warning("Failed to send verification email: %s", e)

    # Handle invite code
    if invite_code:
        await _apply_invite_code(db, user, invite_code)

    return user


async def _get_email_settings(db: AsyncSession) -> dict:
    """Read email and app settings from DB, falling back to env-var defaults."""
    result = {
        "resend_api_key": settings.resend_api_key,
        "email_from": settings.email_from,
        "app_base_url": settings.app_base_url,
        "app_name": settings.app_name,
    }
    for section, row in [
        ("email", await db.get(SystemSetting, "email")),
        ("app", await db.get(SystemSetting, "app")),
    ]:
        if not row:
            continue
        try:
            data = json.loads(row.value)
        except Exception:
            continue
        if section == "email":
            if data.get("resend_api_key"):
                result["resend_api_key"] = data["resend_api_key"]
            if data.get("from"):
                result["email_from"] = data["from"]
            if data.get("app_base_url"):
                result["app_base_url"] = data["app_base_url"]
        elif section == "app":
            if data.get("name"):
                result["app_name"] = data["name"]
    return result


async def _send_verification_email_new(db: AsyncSession, user: User, token: str):
    """Send verification email using existing email service."""
    username = user.username or (user.email.split("@")[0] if user.email else "用户")
    email_cfg = await _get_email_settings(db)
    await _send_verification_email(
        to_email=user.email,
        username=username,
        token=token,
        resend_api_key=email_cfg["resend_api_key"],
        email_from=email_cfg["email_from"],
        app_base_url=email_cfg["app_base_url"],
        app_name=email_cfg["app_name"],
    )


async def _apply_invite_code(db: AsyncSession, user: User, invite_code: str):
    """Apply invite code - award bonus quota to both users."""
    if user.used_invite_code:
        return  # Already used an invite code

    result = await db.execute(select(User).where(User.invite_code == invite_code.upper()))
    inviter = result.scalar_one_or_none()
    if not inviter or inviter.id == user.id:
        return

    # Award bonus quota to both
    user.bonus_quota = (user.bonus_quota or 0) + 10
    user.used_invite_code = invite_code.upper()
    inviter.bonus_quota = (inviter.bonus_quota or 0) + 10
    await db.commit()


async def login_user(db: AsyncSession, email: str, password: str) -> tuple[User, str]:
    """Login and return (user, access_token)."""
    result = await db.execute(select(User).where(User.email == email.lower().strip()))
    user = result.scalar_one_or_none()

    if not user or not user.hashed_password:
        raise HTTPException(status_code=401, detail="邮箱或密码错误")

    if not verify_password(password, user.hashed_password):
        raise HTTPException(status_code=401, detail="邮箱或密码错误")

    if user.is_banned:
        raise HTTPException(status_code=403, detail="账户已被封禁")

    token = create_access_token({"sub": str(user.id)})
    return user, token


async def verify_email(db: AsyncSession, token: str) -> User:
    """Verify email with JWT token."""
    payload = decode_token(token)
    if not payload or payload.get("purpose") != "email_verification":
        raise HTTPException(status_code=400, detail="无效或过期的验证链接")

    email = payload.get("sub")
    if not email:
        raise HTTPException(status_code=400, detail="无效的验证链接")

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    user.email_verified = True
    await db.commit()
    await db.refresh(user)
    return user


async def resend_verification(db: AsyncSession, email: str) -> None:
    """Resend verification email."""
    result = await db.execute(select(User).where(User.email == email.lower().strip()))
    user = result.scalar_one_or_none()
    if not user:
        return  # Silently fail (don't reveal if email exists)

    if user.email_verified:
        return

    token = create_verification_token(email.lower().strip())
    try:
        await _send_verification_email_new(db, user, token)
    except Exception:
        pass


async def get_user_by_id(db: AsyncSession, user_id: int) -> Optional[User]:
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()
