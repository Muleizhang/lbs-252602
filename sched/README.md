# POI Web API 课程设计 · 实施步骤

## 阶段一：项目骨架

**步骤 1：初始化 Next.js 项目**
用 `pnpm create next-app` 创建项目，选 App Router + TypeScript + Tailwind + ESLint。本地 `pnpm dev` 跑通确认环境正常。

**步骤 2：建立项目文档骨架**
写 README，先把项目介绍、技术栈、目录结构补好，分工部分留 TODO。建 `.env.example` 列出后面要用的所有环境变量名。

**步骤 3：部署到 Vercel 并验证 HTTPS**
连 Gitee 仓库到 Vercel，用 Vercel CLI 部署一次，确认线上域名能访问。截图存到 `docs/` 目录给报告用。

**步骤 4：接入 Drizzle ORM 和 Neon 数据库**
装 `drizzle-orm`、`drizzle-kit`、`@neondatabase/serverless`。建 `lib/db.ts` 写连接逻辑，做一个 `/api/health` 端点跑 `SELECT 1` 验证联通。

## 阶段二：数据层

**步骤 5：启用 PostGIS 并建 POI 表**
Neon 控制台执行 `CREATE EXTENSION postgis`。Drizzle schema 定义 pois 表（id、name、province、category、location 用 `geometry(Point, 4326)`、image_url、website、created_at），生成迁移并 push 到数据库。

**步骤 6：建用户和 API key 表**
users 表（id、username、password_hash、role、email），api_keys 表（id、user_id、key_hash、name、created_at、last_used_at）。

**步骤 7：建索引**
location 字段加 GIST 空间索引，name 和 category 加 B-tree 索引。用 `EXPLAIN` 验证查询命中索引。

**步骤 8：导入样区 POI 数据**
写 `scripts/import-pois.ts`，读样区数据（CSV 或 GeoJSON），用 `ST_SetSRID(ST_MakePoint(lng, lat), 4326)` 构造 geometry 批量插入。导入完保留一份样本数据快照在仓库里。

## 阶段三：错误规范与基础设施

**步骤 9：统一错误响应**
建 `lib/errors.ts` 和业务码常量（如 `AUTH_001` 未登录、`AUTH_002` key 失效、`POI_001` 不存在）。所有响应统一格式：`{ error: { code, message, debug_url } }`。

**步骤 10：请求日志中间件**
简单的请求日志（method、path、status、耗时），方便排错也方便写报告里的"日志监控"章节。

**步骤 11：接入 zod 做参数校验**
装 zod，建 `lib/validators/` 目录。后面所有接口的入参都过 zod 校验，校验失败统一走步骤 9 的错误响应。

## 阶段四：认证授权

**步骤 12：用户注册端点**
`POST /api/auth/register`，bcrypt 哈希密码，默认 role 为 `public`。

**步骤 13：登录端点签发 JWT**
`POST /api/auth/login`，用 `jose` 库签发 JWT（serverless 友好），httpOnly cookie 写入。

**步骤 14：API key 管理**
`POST /api/auth/apikey` 生成新 key（明文只返回一次，库里只存哈希），`GET /api/auth/apikey` 列出当前用户的 key（脱敏），`DELETE /api/auth/apikey/[id]` 删除。

**步骤 15：统一鉴权中间件**
建 `lib/auth.ts` 的 `requireAuth(req, { allow: ['jwt', 'apikey'], roles: ['admin'] })`。后面所有受保护端点都通过它。

## 阶段五：限速

**步骤 16：Upstash Redis 接入限速**
用 `@upstash/ratelimit`，分级策略：匿名 IP 10/min，APIKEY 60/min，admin 不限。响应头加 `X-RateLimit-*`。

## 阶段六：POI CRUD

**步骤 17：管理员 CRUD 端点**
`POST`、`PUT`、`DELETE /api/pois[/:id]`，强制要求 admin role。location 入参用 `{ lng, lat }`，存库时转成 geometry。

**步骤 18：单条查询和列表查询**
`GET /api/pois/:id` 和 `GET /api/pois?name=&province=&category=&page=&pageSize=`。返回时把 geometry 转回 `{ lng, lat }`。

**步骤 19：扩展信息过滤**
列表查询加 `?hasImage=true&hasWebsite=true` 参数。

## 阶段七：空间查询

**步骤 20：拉框查询**
`GET /api/pois/search/bbox?minLng=&minLat=&maxLng=&maxLat=`，用 `ST_MakeEnvelope` + `ST_Within`。

**步骤 21：中心半径查询**
`GET /api/pois/search/radius?lng=&lat=&radius=`（米），用 `ST_DWithin` + `geography` 类型保证准确距离，结果按距离升序排列。

## 阶段八：地图客户端

**步骤 22：高德地图基础接入**
申请高德 key 配 `securityJsCode`。建 `/` 路由挂载基础地图，先把"地图能显示"这一步落地。

**步骤 23：设备位置实时显示**
用 `navigator.geolocation.watchPosition`，自定义 marker 持续更新设备位置。这条课设里专门点名要求，单独做一步方便演示时指给老师看。

**步骤 24：POI marker 渲染**
调 `/api/pois/search/bbox` 拿当前视野内的 POI，渲染 marker，点击弹 InfoWindow（名称、类别、图片、官网链接）。地图 `moveend` 事件触发刷新。

**步骤 25：交互式空间查询工具**
高德 `MouseTool` 画矩形和圆，画完调对应接口。UI 上加切换按钮。

**步骤 26：登录页和管理员后台**
登录页加上 admin 路由（受 JWT 保护），表格列出所有 POI，支持新增/编辑/删除（编辑时可在地图上点选位置）。普通用户登录后能看到自己的 APIKEY 管理页。

## 阶段九：收尾

**步骤 27：API 文档和测试集合**
写 `docs/api.md`，列出所有端点、参数、响应、错误码。导出一份 Bruno 或 Postman collection 一起放进仓库，演示和报告都用得上。

**步骤 28：完善 README、报告和演示材料**
README 补全分工部分（虽然一人组也要写清自己各模块的工作量分布）。`docs/report.docx` 提交课设报告。`docs/screenshots/` 放演示截图和录屏链接。

