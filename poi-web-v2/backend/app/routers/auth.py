from fastapi import APIRouter
from sqlalchemy import select

from app.deps import DbSession, CurrentUser
from app.errors import BizError, ErrorCode
from app.models import User
from app.schemas.auth import RegisterReq, LoginReq, TokenResp, UserOut
from app.schemas.response import ok
from app.utils.security import hash_password, verify_password, create_access_token

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


@router.post("/register")
async def register(body: RegisterReq, db: DbSession):
    existing = await db.execute(
        select(User).where((User.username == body.username) | (User.email == body.email))
    )
    if existing.scalar_one_or_none():
        raise BizError(ErrorCode.CONFLICT, "用户名或邮箱已存在")
    user = User(
        username=body.username,
        email=body.email,
        password_hash=hash_password(body.password),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return ok(_user_out(user))


@router.post("/login")
async def login(body: LoginReq, db: DbSession):
    result = await db.execute(select(User).where(User.username == body.username))
    user = result.scalar_one_or_none()
    if not user or not verify_password(body.password, user.password_hash):
        raise BizError(ErrorCode.JWT_INVALID, "用户名或密码错误")
    token = create_access_token(sub=str(user.id), role=user.role)
    return ok(TokenResp(access_token=token).model_dump())


@router.post("/refresh")
async def refresh(user: CurrentUser):
    token = create_access_token(sub=str(user.id), role=user.role)
    return ok(TokenResp(access_token=token).model_dump())


def _user_out(u: User) -> dict:
    return UserOut(
        id=str(u.id),
        username=u.username,
        email=u.email,
        role=u.role,
        is_active=u.is_active,
        created_at=u.created_at.isoformat(),
    ).model_dump()
