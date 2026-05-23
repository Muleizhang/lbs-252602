import secrets

from pydantic import BaseModel


class ApiKeyCreateReq(BaseModel):
    name: str | None = None


class ApiKeyOut(BaseModel):
    id: str
    key_prefix: str
    name: str | None
    is_active: bool
    created_at: str
    last_used_at: str | None = None


class ApiKeyCreatedOut(ApiKeyOut):
    key_plain: str
