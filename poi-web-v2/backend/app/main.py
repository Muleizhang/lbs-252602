import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.config import settings
from app.errors import BizError, ErrorCode, ERROR_META, trace_id
from app.schemas.response import ok, fail
from app.routers import auth

logger = logging.getLogger("app")

app = FastAPI(
    title="LBS POI Web API",
    version="0.1.0",
    docs_url="/docs",
    openapi_url="/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(BizError)
async def biz_error_handler(request: Request, exc: BizError):
    body, status = fail(
        code=exc.code,
        message=exc.message,
        http_status=exc.http_status,
        trace_id=exc.trace_id,
        details=exc.details,
    )
    return JSONResponse(status_code=status, content=body)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    tid = trace_id()
    errors = []
    for err in exc.errors():
        loc = ".".join(str(l) for l in err.get("loc", []))
        errors.append(f"{loc}: {err.get('msg', '')}")
    body, status = fail(
        code=ErrorCode.PARAM_INVALID,
        message="参数校验失败",
        http_status=400,
        trace_id=tid,
        details="; ".join(errors),
    )
    return JSONResponse(status_code=status, content=body)


@app.exception_handler(Exception)
async def generic_error_handler(request: Request, exc: Exception):
    tid = trace_id()
    logger.exception("Unhandled exception trace_id=%s", tid)
    body, status = fail(
        code=ErrorCode.INTERNAL,
        message="内部错误",
        http_status=500,
        trace_id=tid,
        details=str(exc),
    )
    return JSONResponse(status_code=status, content=body)


app.include_router(auth.router)


@app.get("/healthz")
async def healthz():
    return ok({"status": "ok"})
