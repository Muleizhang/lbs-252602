from typing import Annotated

from fastapi import Depends, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import async_session
from app.errors import BizError, ErrorCode
from app.models import User
from app.utils.security import decode_access_token


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
