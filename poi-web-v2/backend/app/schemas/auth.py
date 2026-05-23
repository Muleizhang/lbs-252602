from pydantic import BaseModel, EmailStr


class RegisterReq(BaseModel):
    username: str
    email: str
    password: str


class LoginReq(BaseModel):
    username: str
    password: str


class TokenResp(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: str
    username: str
    email: str
    role: str
    is_active: bool
    created_at: str

    model_config = {"from_attributes": True}


class UserUpdateReq(BaseModel):
    email: str | None = None
    password: str | None = None
