# 技术栈与架构设计

## 一、技术栈总览

### 运行环境与部署

- **托管平台**：Vercel（自动 HTTPS、全球 CDN、Serverless Functions、Git push 自动部署）
- **代码托管**：Gitee（课设要求，便于贡献统计）
- **运行时**：Node.js 20+ / Edge Runtime（限速等轻量端点）

### 应用框架

- **Next.js 15（App Router）**：单一项目同时承载 REST API（Route Handlers）和地图客户端（React 前端），避免前后端分离带来的跨域、双重部署、双套环境变量等麻烦
- **TypeScript**：全栈类型安全，schema、API 入参出参、前端调用都共享类型定义
- **Tailwind CSS**：原子化样式，admin 后台和登录页快速搭建

### 数据层

- **Neon Serverless Postgres**：免费层够用，Serverless Driver 通过 HTTP 连接，与 Vercel Functions 冷启动配合好；不像传统 Postgres 那样受连接池数量限制
- **PostGIS 扩展**：`geometry(Point, 4326)` 存储坐标，`ST_DWithin` / `ST_Within` / `ST_MakeEnvelope` 处理半径和拉框查询
- **Drizzle ORM**：轻量、TypeScript 优先、SQL 风格 API；对 PostGIS 类型扩展友好（必要时直接写裸 SQL 不别扭）
- **drizzle-kit**：迁移生成与 push

### 认证与安全

- **bcrypt**：用户密码哈希
- **jose**：JWT 签发与验签（纯 JS 实现，Edge Runtime 兼容）
- **httpOnly Cookie**：JWT 存储位置，避免 XSS 窃取
- **APIKEY**：随机生成 32 字节 base64url 字符串，库里只存 SHA-256 哈希
- **zod**：所有 API 入参运行时校验
- **Upstash Redis + @upstash/ratelimit**：分级限速（匿名 IP / APIKEY / admin），全 Serverless 架构

### 地图客户端

- **高德地图 JS API 2.0**：通过 `@amap/amap-jsapi-loader` 异步加载
- **浏览器 Geolocation API**：`watchPosition` 持续追踪设备位置
- **高德 MouseTool**：拉框矩形、圆形交互绘制
- **React 19**：函数组件 + hooks

### 工程工具

- **pnpm**：包管理器
- **ESLint + Prettier**：代码规范
- **Bruno** 或 **Postman**：API 测试集合，演示和报告都用
- **Conventional Commits**：提交信息规范，Gitee 上看着工整

---

## 二、整体架构

### 部署架构图

```
                  ┌─────────────────────────────┐
   用户浏览器  ──→  │ Vercel Edge Network (HTTPS) │
   (PC / 手机)     └──────────────┬──────────────┘
                                  │
                  ┌───────────────┴───────────────┐
                  │   Next.js 应用 (单一部署)      │
                  │                                │
                  │  ┌─────────────────────────┐  │
                  │  │  React 客户端 (前端)     │  │
                  │  │   高德地图 + Admin UI   │  │
                  │  └─────────────────────────┘  │
                  │                                │
                  │  ┌─────────────────────────┐  │
                  │  │ Route Handlers (API)    │  │
                  │  │ /api/auth/*             │  │
                  │  │ /api/pois/*             │  │
                  │  └────┬───────────┬────────┘  │
                  └───────┼───────────┼───────────┘
                          │           │
                ┌─────────┘           └──────────┐
                ▼                                ▼
      ┌──────────────────┐          ┌────────────────────┐
      │ Neon Postgres    │          │ Upstash Redis      │
      │  + PostGIS       │          │  (限速计数器)       │
      └──────────────────┘          └────────────────────┘
                  │
                  │ (外部依赖,可选)
                  ▼
           ┌──────────────┐
           │ 高德 LBS API │
           │ (底图瓦片)   │
           └──────────────┘
```

### 分层结构

**表现层（Next.js Pages）**
浏览器中运行的 React 应用。负责地图渲染、用户交互（注册/登录、拉框/画圆、APIKEY 管理、admin CRUD 表单）、设备定位展示。所有数据通过 fetch 调本项目的 `/api/*`，不直连数据库。

**API 层（Route Handlers）**
Vercel Serverless Functions。三类端点：
- 认证类（`/api/auth/*`）：注册、登录、APIKEY 生成与管理
- 资源类（`/api/pois/*`）：POI 的 CRUD 与多种查询
- 系统类（`/api/health` 等）：健康检查

每个请求过统一的中间件链：日志 → 限速 → zod 校验 → 鉴权 → 业务处理 → 统一错误响应。

**数据层（Neon Postgres + PostGIS）**
持久化所有业务数据。Drizzle ORM 处理常规 CRUD,空间查询走原生 SQL。GIST 索引保证空间查询性能。

**辅助服务**
- Upstash Redis：限速计数（`@upstash/ratelimit` 内置滑动窗口算法）
- 高德地图：仅前端使用，提供底图瓦片和绘图工具

---

## 三、关键设计决策

### 为什么选 Next.js 全栈而非 Express + 独立前端

课设是一人组,部署、域名、HTTPS、CORS、环境变量这些都要自己管。Next.js 一个项目搞定前后端,Vercel 一键部署,直接拿到 HTTPS 域名,省下来的时间足够多写两个加分功能。

### 为什么选 Neon 而非 Supabase

两者都有 PostGIS,但 Neon 的 Serverless Driver 是基于 HTTP 的,无连接池烦恼,Vercel Function 冷启动友好。Supabase 适合需要现成 Auth/Storage 的项目,而本课设的认证逻辑要自己写(便于在报告里讲清楚授权设计),所以 Neon 反而更纯粹。

### 为什么 JWT 和 APIKEY 双轨

课设明确区分两类用户:
- **内部维护人员**用 JWT(短期凭证、登录态、role 信息全在 token 里)
- **公众用户**用 APIKEY(长期凭证、便于程序化调用、可独立吊销)

统一的 `requireAuth` 中间件支持指定允许哪种凭证、要求哪种角色。

### 为什么用 PostGIS 而非自己算距离

"按拉框范围""按中心半径"这两种查询是课设硬性要求。PostGIS 一行 SQL 解决,还能利用 GIST 索引;自己用 Haversine 公式算距离不仅慢,几万条 POI 全表扫描肯定卡。投入的学习成本远小于自己造轮子。

### 为什么限速放在 Upstash 而非内存

Vercel Serverless Function 是无状态的,每次冷启动都是新实例,内存里的限速计数会丢。Upstash Redis 走 HTTP REST API,延迟低、Serverless 友好、免费层每天 10000 次请求够用。

### 为什么前端用高德而非 Leaflet + OSM

课设原文推荐"高德地图、百度地图、腾讯地图等平台"。高德文档质量最高,`MouseTool` 拉框/画圆开箱即用,国内访问稳定,不用配置代理或 CDN。

---

## 四、安全设计

### 传输层
- **强制 HTTPS**:Vercel 平台自动签发 Let's Encrypt 证书并强制 HTTP→HTTPS 重定向
- **HSTS**:Vercel 默认开启

### 认证层
- 密码 bcrypt 哈希(cost = 10)
- JWT 短期(2 小时),httpOnly + Secure + SameSite=Lax cookie
- APIKEY 明文只在生成时返回一次,库里存 SHA-256 哈希

### 应用层
- zod 校验所有入参,拒绝畸形请求
- 限速防爆破和滥用
- 错误响应统一包装,不泄露内部堆栈
- admin 端点严格校验 role,防止水平/垂直越权

### 数据层
- 所有 SQL 通过 Drizzle 参数化查询,防 SQL 注入
- 数据库连接字符串走 Vercel 环境变量,不进 Git

---

## 五、统一响应格式

**成功响应**

```json
{
  "data": { "...": "..." },
  "meta": { "page": 1, "pageSize": 20, "total": 156 }
}
```

**错误响应**

```json
{
  "error": {
    "code": "POI_001",
    "message": "POI not found",
    "debug_url": "https://your-app.vercel.app/docs/errors#POI_001"
  }
}
```

HTTP 状态码语义化使用:200 / 201 / 400 / 401 / 403 / 404 / 429 / 500。课设要求的"业务错误码 + 描述 + 调试链接"全部在 `error` 对象里满足。

---

## 六、目录结构

```
poi-lbs/
├── app/
│   ├── api/
│   │   ├── health/route.ts
│   │   ├── auth/
│   │   │   ├── register/route.ts
│   │   │   ├── login/route.ts
│   │   │   └── apikey/
│   │   │       ├── route.ts
│   │   │       └── [id]/route.ts
│   │   └── pois/
│   │       ├── route.ts
│   │       ├── [id]/route.ts
│   │       └── search/
│   │           ├── bbox/route.ts
│   │           └── radius/route.ts
│   ├── (client)/
│   │   ├── page.tsx              # 地图主页
│   │   ├── login/page.tsx
│   │   ├── account/page.tsx      # APIKEY 管理
│   │   └── admin/page.tsx        # 管理员 CRUD
│   └── layout.tsx
├── lib/
│   ├── db.ts                     # Neon 连接
│   ├── auth.ts                   # JWT + APIKEY 中间件
│   ├── ratelimit.ts              # Upstash 限速
│   ├── errors.ts                 # 统一错误响应 + 业务码
│   ├── logger.ts                 # 请求日志
│   └── validators/               # zod schemas
├── drizzle/
│   ├── schema.ts
│   └── migrations/
├── scripts/
│   └── import-pois.ts            # POI 数据导入
├── docs/
│   ├── api.md                    # API 参考
│   ├── report.docx               # 课设报告
│   ├── screenshots/
│   └── postman-collection.json
├── .env.example
├── drizzle.config.ts
├── next.config.js
├── package.json
└── README.md
```

---

## 七、环境变量清单

```
# 数据库
DATABASE_URL=postgresql://...neon.tech/...

# JWT
JWT_SECRET=<openssl rand -base64 32>
JWT_EXPIRES_IN=2h

# Upstash Redis
UPSTASH_REDIS_REST_URL=https://...upstash.io
UPSTASH_REDIS_REST_TOKEN=...

# 高德地图(前端 NEXT_PUBLIC_ 暴露给浏览器)
NEXT_PUBLIC_AMAP_KEY=...
NEXT_PUBLIC_AMAP_SECURITY_CODE=...

# 应用基础
NEXT_PUBLIC_BASE_URL=https://your-app.vercel.app
```
