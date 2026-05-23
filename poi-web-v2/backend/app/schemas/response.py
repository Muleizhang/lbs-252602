from __future__ import annotations

from typing import Any

from pydantic import BaseModel


class PaginationMeta(BaseModel):
    page: int
    size: int
    total: int


class ErrorDetail(BaseModel):
    trace_id: str
    details: str | None = None
    docs: str | None = None


class ResponseEnvelope(BaseModel):
    code: int = 0
    message: str = "ok"
    data: Any = None
    error: ErrorDetail | None = None
    meta: PaginationMeta | None = None


def ok(data: Any = None, *, meta: PaginationMeta | None = None) -> dict:
    return ResponseEnvelope(data=data, meta=meta).model_dump(exclude_none=True)


def fail(
    code: int,
    message: str,
    *,
    http_status: int = 500,
    trace_id: str | None = None,
    details: str | None = None,
) -> tuple[dict, int]:
    body = ResponseEnvelope(
        code=code,
        message=message,
        error=ErrorDetail(
            trace_id=trace_id or "",
            details=details,
            docs=f"https://lbs.example.com/docs#/errors/{code}",
        ),
    ).model_dump(exclude_none=True)
    return body, http_status
