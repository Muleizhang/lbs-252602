import uuid
from enum import IntEnum


class ErrorCode(IntEnum):
    OK = 0
    PARAM_INVALID = 40001
    COORD_OUT_OF_RANGE = 40002
    JWT_INVALID = 40101
    APIKEY_INVALID = 40102
    RATE_LIMITED = 40301
    FORBIDDEN = 40302
    POI_NOT_FOUND = 40401
    USER_NOT_FOUND = 40402
    CONFLICT = 40901
    INTERNAL = 50001
    DB_UNAVAILABLE = 50301


ERROR_META: dict[ErrorCode, tuple[int, str]] = {
    ErrorCode.OK: (200, "ok"),
    ErrorCode.PARAM_INVALID: (400, "参数校验失败"),
    ErrorCode.COORD_OUT_OF_RANGE: (400, "坐标越界"),
    ErrorCode.JWT_INVALID: (401, "JWT 无效或过期"),
    ErrorCode.APIKEY_INVALID: (401, "APIKEY 无效"),
    ErrorCode.RATE_LIMITED: (403, "限速触发"),
    ErrorCode.FORBIDDEN: (403, "角色权限不足"),
    ErrorCode.POI_NOT_FOUND: (404, "POI 不存在"),
    ErrorCode.USER_NOT_FOUND: (404, "用户不存在"),
    ErrorCode.CONFLICT: (409, "用户名 / code 已存在"),
    ErrorCode.INTERNAL: (500, "内部错误"),
    ErrorCode.DB_UNAVAILABLE: (503, "数据库不可用"),
}


class BizError(Exception):
    def __init__(self, code: ErrorCode, details: str | None = None):
        self.code = code
        http_status, message = ERROR_META.get(code, (500, "未知错误"))
        self.http_status = http_status
        self.message = message
        self.details = details
        self.trace_id = uuid.uuid4().hex[:12]
        super().__init__(message)


def trace_id() -> str:
    return uuid.uuid4().hex[:12]
