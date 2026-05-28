from typing import Annotated
from datetime import datetime, timezone

from fastapi import Depends, Header, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import async_session
from app.errors import BizError, ErrorCode
from app.models import ApiKey, User
from app.utils.security import decode_access_token, verify_password


async def get_db():
    async with async_session() as session:
        yield session


DbSession = Annotated[AsyncSession, Depends(get_db)]


async def _extract_user(authorization: str, db: AsyncSession) -> User:
    if not authorization.startswith("Bearer "):
        raise BizError(ErrorCode.JWT_INVALID, "Missing Bearer token")
    token = authorization[7:]
    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        raise BizError(ErrorCode.JWT_INVALID, "Token invalid or expired")
    user_id = payload["sub"]
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise BizError(ErrorCode.USER_NOT_FOUND)
    if not user.is_active:
        raise BizError(ErrorCode.JWT_INVALID, "User is deactivated")
    return user


async def get_current_user(
    db: DbSession,
    authorization: str = Header(..., alias="Authorization"),
) -> User:
    return await _extract_user(authorization, db)


CurrentUser = Annotated[User, Depends(get_current_user)]


async def require_admin(user: CurrentUser) -> User:
    if user.role != "admin":
        raise BizError(ErrorCode.FORBIDDEN)
    return user


AdminUser = Annotated[User, Depends(require_admin)]


async def apikey_auth(
    db: DbSession,
    x_api_key: str = Header(..., alias="X-API-Key"),
) -> User:
    prefix = x_api_key[:8]
    result = await db.execute(
        select(ApiKey).where(ApiKey.key_prefix == prefix, ApiKey.is_active.is_(True))
    )
    candidates = result.scalars().all()
    for ak in candidates:
        if verify_password(x_api_key, ak.key_hash):
            ak.last_used_at = datetime.now(timezone.utc)
            await db.commit()
            result2 = await db.execute(select(User).where(User.id == ak.user_id))
            user = result2.scalar_one_or_none()
            if user and user.is_active:
                return user
    raise BizError(ErrorCode.APIKEY_INVALID)


ApiKeyUser = Annotated[User, Depends(apikey_auth)]


async def apikey_or_admin(
    request: Request,
    db: DbSession,
) -> User:
    """鉴权：管理员 Bearer token 或 API Key，二选一。管理员无需 API Key。"""
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        try:
            user = await _extract_user(auth_header, db)
            if user.role == "admin":
                return user
        except Exception:
            pass

    api_key = request.headers.get("X-API-Key", "")
    if api_key:
        prefix = api_key[:8]
        result = await db.execute(
            select(ApiKey).where(ApiKey.key_prefix == prefix, ApiKey.is_active.is_(True))
        )
        candidates = result.scalars().all()
        for ak in candidates:
            if verify_password(api_key, ak.key_hash):
                ak.last_used_at = datetime.now(timezone.utc)
                await db.commit()
                result2 = await db.execute(select(User).where(User.id == ak.user_id))
                user = result2.scalar_one_or_none()
                if user and user.is_active:
                    return user

    raise BizError(ErrorCode.APIKEY_INVALID)


ApiKeyOrAdminUser = Annotated[User, Depends(apikey_or_admin)]
