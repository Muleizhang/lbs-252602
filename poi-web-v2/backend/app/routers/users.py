import secrets

from fastapi import APIRouter
from sqlalchemy import select

from app.deps import DbSession, CurrentUser
from app.errors import BizError, ErrorCode
from app.models import ApiKey, User
from app.schemas.apikey import ApiKeyCreateReq, ApiKeyOut, ApiKeyCreatedOut
from app.schemas.response import ok
from app.utils.security import hash_password

from app.schemas.auth import UserUpdateReq
from app.routers.auth import _user_out

router = APIRouter(prefix="/api/v1/users/me", tags=["users"])


@router.get("")
async def get_my_profile(user: CurrentUser):
    return ok(_user_out(user))


@router.put("")
async def update_my_profile(body: UserUpdateReq, user: CurrentUser, db: DbSession):
    if body.email:
        # Check if email is already taken
        existing = await db.execute(
            select(User).where((User.email == body.email) & (User.id != user.id))
        )
        if existing.scalar_one_or_none():
            raise BizError(ErrorCode.CONFLICT, "邮箱已被占用")
        user.email = body.email
    if body.password:
        user.password_hash = hash_password(body.password)
        
    await db.commit()
    await db.refresh(user)
    return ok(_user_out(user))

def _fmt(ak: ApiKey, *, include_plain: bool = False, plain: str = "") -> dict:
    d = ApiKeyOut(
        id=str(ak.id),
        key_prefix=ak.key_prefix,
        name=ak.name,
        is_active=ak.is_active,
        created_at=ak.created_at.isoformat(),
        last_used_at=ak.last_used_at.isoformat() if ak.last_used_at else None,
    ).model_dump()
    if include_plain:
        d["key_plain"] = plain
    return d


@router.post("/apikeys")
async def create_apikey(body: ApiKeyCreateReq, user: CurrentUser, db: DbSession):
    plain = secrets.token_urlsafe(32)
    ak = ApiKey(
        user_id=user.id,
        key_hash=hash_password(plain),
        key_prefix=plain[:8],
        name=body.name,
    )
    db.add(ak)
    await db.commit()
    await db.refresh(ak)
    return ok(_fmt(ak, include_plain=True, plain=plain))


@router.get("/apikeys")
async def list_apikeys(user: CurrentUser, db: DbSession):
    result = await db.execute(
        select(ApiKey).where(ApiKey.user_id == user.id).order_by(ApiKey.created_at.desc())
    )
    keys = result.scalars().all()
    return ok([_fmt(ak) for ak in keys])


@router.delete("/apikeys/{key_id}")
async def revoke_apikey(key_id: str, user: CurrentUser, db: DbSession):
    result = await db.execute(
        select(ApiKey).where(ApiKey.id == key_id, ApiKey.user_id == user.id)
    )
    ak = result.scalar_one_or_none()
    if not ak:
        raise BizError(ErrorCode.APIKEY_INVALID, "APIKEY 不存在")
    ak.is_active = False
    await db.commit()
    return ok(None)
