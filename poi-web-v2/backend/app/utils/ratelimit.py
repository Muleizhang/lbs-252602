from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from app.errors import BizError, ErrorCode
from app.schemas.response import fail


def _key_func(request: Request) -> str:
    apikey = request.headers.get("X-API-Key")
    if apikey:
        return f"apikey:{apikey[:8]}"
    return get_remote_address(request)


limiter = Limiter(key_func=_key_func, default_limits=[])


def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded):
    body, status = fail(
        code=ErrorCode.RATE_LIMITED,
        message="限速触发",
        http_status=429,
        details=str(exc.detail),
    )
    from fastapi.responses import JSONResponse
    return JSONResponse(status_code=status, content=body)
