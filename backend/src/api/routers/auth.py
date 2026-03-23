"""Authentication router."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, update as _upd
from sqlalchemy.ext.asyncio import AsyncSession

from src.database.new_db import get_db
from src.api.schemas.auth import (
    RegisterRequest, LoginRequest, TokenResponse, UserOut,
    VerifyEmailRequest, ResendVerificationRequest
)
from src.api.schemas.common import SuccessResponse
from src.api.dependencies.auth import get_current_user
from src.services.auth_service import (
    register_user, login_user, verify_email, resend_verification, get_user_by_id
)
from src.models.user import User

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _user_to_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        email=user.email or "",
        is_verified=bool(user.email_verified),
        tier=user.subscription_tier or "free",
        trial_state="not_eligible" if user.subscription_tier in ("basic", "premium") else ("expired" if user.has_had_pro_trial else "available"),
        has_had_pro_trial=bool(user.has_had_pro_trial),
        is_admin=bool(user.is_admin),
        bonus_quota=user.bonus_quota or 0,
        invite_code=user.invite_code,
    )


@router.post("/register", status_code=201)
async def register(req: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """Register a new user."""
    user = await register_user(db, req.email, req.password, req.username, req.invite_code)
    return {"success": True, "message": "注册成功，请查收验证邮件", "user_id": user.id}


@router.post("/login", response_model=TokenResponse)
async def login(req: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Login with email and password."""
    user, token = await login_user(db, req.email, req.password)
    return TokenResponse(access_token=token, token_type="bearer", user=_user_to_out(user))


@router.get("/me", response_model=UserOut)
async def me(current_user: User = Depends(get_current_user)):
    """Get current user info."""
    return _user_to_out(current_user)


@router.post("/verify-email", response_model=SuccessResponse)
async def verify_email_route(req: VerifyEmailRequest, db: AsyncSession = Depends(get_db)):
    """Verify email address."""
    await verify_email(db, req.token)
    return SuccessResponse(message="邮箱验证成功")


@router.post("/resend-verification", response_model=SuccessResponse)
async def resend_verification_route(req: ResendVerificationRequest, db: AsyncSession = Depends(get_db)):
    """Resend verification email."""
    await resend_verification(db, req.email)
    return SuccessResponse(message="验证邮件已重新发送")


class UseInviteRequest(BaseModel):
    invite_code: str


@router.post("/invite/use")
async def use_invite_code(
    req: UseInviteRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Apply an invite code: reward both inviter and invitee +10 bonus_quota."""
    code = req.invite_code.strip().upper()
    if not code:
        raise HTTPException(status_code=400, detail="邀请码不能为空")
    if current_user.used_invite_code:
        raise HTTPException(status_code=400, detail="您已使用过邀请码")
    if current_user.invite_code and current_user.invite_code.upper() == code:
        raise HTTPException(status_code=400, detail="不能使用自己的邀请码")

    result = await db.execute(select(User).where(User.invite_code == code))
    inviter = result.scalars().first()
    if not inviter:
        raise HTTPException(status_code=404, detail="邀请码无效")

    await db.execute(
        _upd(User).where(User.id == inviter.id).values(bonus_quota=User.bonus_quota + 10)
    )
    await db.execute(
        _upd(User).where(User.id == current_user.id).values(
            bonus_quota=User.bonus_quota + 10,
            used_invite_code=code,
        )
    )
    await db.commit()
    return {"success": True, "message": "邀请码兑换成功！双方各获得 +10 次分析额度 🎉"}
