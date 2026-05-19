export const ERROR_CODES = {
  AUTH_001: { status: 401, message: "未登录或凭证已过期" },
  AUTH_002: { status: 401, message: "API Key 无效或已吊销" },
  AUTH_003: { status: 403, message: "权限不足" },
  AUTH_004: { status: 409, message: "用户名已存在" },
  AUTH_005: { status: 401, message: "用户名或密码错误" },
  POI_001: { status: 404, message: "POI 不存在" },
  POI_002: { status: 400, message: "POI 数据校验失败" },
  RATE_001: { status: 429, message: "请求过于频繁，请稍后再试" },
  VAL_001: { status: 400, message: "请求参数校验失败" },
  SYS_001: { status: 500, message: "服务器内部错误" },
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "";

export function errorResponse(code: ErrorCode, detail?: string) {
  const err = ERROR_CODES[code];
  return Response.json(
    {
      error: {
        code,
        message: detail || err.message,
        debug_url: `${BASE_URL}/docs/errors#${code}`,
      },
    },
    { status: err.status }
  );
}

export function successResponse(data: unknown, meta?: Record<string, unknown>) {
  return Response.json({
    data,
    ...(meta ? { meta } : {}),
  });
}

export function paginatedResponse(
  data: unknown,
  page: number,
  pageSize: number,
  total: number
) {
  return Response.json({
    data,
    meta: { page, pageSize, total },
  });
}
