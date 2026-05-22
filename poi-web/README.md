# 全国文保单位 POI 系统

基于位置服务（LBS）的全国重点文物保护单位查询系统。前端使用高德地图展示 POI 标注，后端提供 RESTful API，支持拉框查询、半径查询、设备定位等空间功能。

## 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Next.js 16 (App Router) + TypeScript |
| 样式 | Tailwind CSS 4 |
| 数据库 | Neon Serverless Postgres + PostGIS |
| ORM | Drizzle ORM |
| 认证 | JWT (jose) + bcrypt + API Key (SHA-256) |
| 限速 | Upstash Redis + @upstash/ratelimit |
| 地图 | 高德地图 JS API 2.0 |
| 校验 | Zod |
| 部署 | Vercel |

## 目录结构

```
poi-web/
├── app/
│   ├── api/
│   │   ├── health/route.ts            # 健康检查
│   │   ├── auth/
│   │   │   ├── register/route.ts      # POST 用户注册
│   │   │   ├── login/route.ts         # POST 登录签发 JWT
│   │   │   └── apikey/
│   │   │       ├── route.ts           # POST 创建 / GET 列出
│   │   │       └── [id]/route.ts      # DELETE 删除
│   │   └── pois/
│   │       ├── route.ts               # GET 列表 / POST 新增
│   │       ├── [id]/route.ts          # GET 详情 / PUT 编辑 / DELETE 删除
│   │       └── search/
│   │           ├── bbox/route.ts      # GET 拉框查询
│   │           └── radius/route.ts    # GET 半径查询
│   ├── page.tsx                       # 地图主页（入口）
│   ├── login/page.tsx                 # 登录 / 注册
│   ├── account/page.tsx               # API Key 管理
│   ├── admin/page.tsx                 # 管理员 POI CRUD
│   ├── layout.tsx
│   └── globals.css
├── components/
│   ├── MapPage.tsx                    # 高德地图 + 空间查询交互
│   ├── LoginPage.tsx
│   ├── AccountPage.tsx
│   └── AdminPage.tsx
├── lib/
│   ├── db/
│   │   ├── schema.ts                 # users / api_keys / pois 表定义
│   │   └── index.ts                  # Neon 连接（懒加载）
│   ├── auth.ts                       # JWT 签发/验签 + API Key 鉴权中间件
│   ├── errors.ts                     # 统一错误响应 + 业务错误码
│   ├── ratelimit.ts                  # Upstash 限速
│   ├── logger.ts                     # 请求日志
│   └── validators/index.ts           # Zod 校验 schemas
├── scripts/
│   └── import-pois.ts                # 全国文保单位 SHP 数据导入脚本
├── drizzle/
│   └── 0000_init.sql                 # 建表 + PostGIS 扩展 + 索引
├── drizzle.config.ts
├── .env.example
├── package.json
└── pnpm-workspace.yaml
```

---

## 从零部署完整指南

以下是从当前代码状态到完整上线运行的全部步骤。

### 第一步：注册云服务账号

需要注册以下四个免费云服务：

#### 1.1 Neon（Postgres 数据库）

1. 访问 https://neon.tech 注册账号
2. 点击 **Create Project**，选择区域（推荐 Singapore），数据库名填 `poi_lbs`
3. 创建完成后，在 **Dashboard → Connection Details** 中复制连接字符串，格式为：
   ```
   postgresql://username:password@ep-xxxxx.ap-southeast-1.aws.neon.tech/poi_lbs?sslmode=require
   ```
4. 进入 **SQL Editor**，确认能看到空数据库

#### 1.2 Upstash（Redis 限速）

1. 访问 https://upstash.com 注册账号
2. 点击 **Create Database**，名称填 `poi-ratelimit`，区域选与 Neon 相近的
3. 创建完成后，在数据库详情页复制：
   - `UPSTASH_REDIS_REST_URL`：形如 `https://xxx.upstash.io`
   - `UPSTASH_REDIS_REST_TOKEN`：一串 token

#### 1.3 高德开放平台（地图 JS API）

1. 访问 https://lbs.amap.com 注册开发者账号
2. 进入 **应用管理 → 我的应用 → 创建新应用**，名称随意
3. 在应用下 **添加 Key**：
   -服务平台选 **Web端(JS API)**
   - 提交后获得 `Key` 和 `安全密钥（securityJsCode）`
4. 记录：
   - `NEXT_PUBLIC_AMAP_KEY`：获得的 Key
   - `NEXT_PUBLIC_AMAP_SECURITY_CODE`：安全密钥

#### 1.4 Vercel（部署托管）

1. 访问 https://vercel.com 注册账号（可直接用 GitHub 登录）
2. 暂时不用操作，后面会用到

---

### 第二步：本地环境准备

#### 2.1 安装前置软件

- **Node.js** >= 20：https://nodejs.org
- **pnpm**：安装 Node 后运行 `corepack enable && corepack prepare pnpm@latest --activate`
- **Python 3** + pip：用于导入脚本读取 SHP 文件（`pip3 install pyshp`）
- **Git**：版本管理

#### 2.2 克隆仓库并安装依赖

```bash
cd poi-web
pnpm install
```

---

### 第三步：配置环境变量

复制示例文件并填入真实值：

```bash
cp .env.example .env.local
```

编辑 `.env.local`，填入第一步获取的各个值：

```env
# 数据库 — Neon 连接字符串
DATABASE_URL=postgresql://username:password@ep-xxxxx.ap-southeast-1.aws.neon.tech/poi_lbs?sslmode=require

# JWT — 生成随机密钥：openssl rand -base64 32
JWT_SECRET=这里粘贴 openssl 生成的随机字符串
JWT_EXPIRES_IN=2h

# Upstash Redis
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=你的token

# 高德地图
NEXT_PUBLIC_AMAP_KEY=你的高德Key
NEXT_PUBLIC_AMAP_SECURITY_CODE=你的安全密钥

# 应用基础（本地开发用 localhost）
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

> **生成 JWT_SECRET**：在终端运行 `openssl rand -base64 32`，把输出粘贴到 `JWT_SECRET`。

---

### 第四步：初始化数据库

#### 4.1 启用 PostGIS 扩展并建表

进入 Neon 控制台的 **SQL Editor**，粘贴执行 `drizzle/0000_init.sql` 的全部内容：

```sql
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  email VARCHAR(255),
  role VARCHAR(20) NOT NULL DEFAULT 'public',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS api_keys (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL,
  name VARCHAR(100) NOT NULL,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pois (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  province VARCHAR(100),
  address TEXT,
  category VARCHAR(100),
  batch VARCHAR(100),
  age VARCHAR(255),
  heritage_code BIGINT,
  class_code INTEGER,
  location GEOMETRY(Point, 4326) NOT NULL,
  image_url TEXT,
  website TEXT,
  remark TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pois_location ON pois USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_pois_name ON pois USING btree (name);
CREATE INDEX IF NOT EXISTS idx_pois_category ON pois USING btree (category);
CREATE INDEX IF NOT EXISTS idx_pois_province ON pois USING btree (province);
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys (user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys (key_hash);
```

#### 4.2 验证建表

在 SQL Editor 中运行：

```sql
SELECT tablename FROM pg_tables WHERE schemaname = 'public';
```

应看到 `users`、`api_keys`、`pois` 三张表。

```sql
SELECT extname FROM pg_extension WHERE extname = 'postgis';
```

应返回 `postgis`。

---

### 第五步：导入全国文保单位数据

#### 5.1 安装 Python 依赖

```bash
pip3 install pyshp
```

#### 5.2 执行导入脚本

```bash
# 从 poi-web 目录运行
npx tsx scripts/import-pois.ts
```

脚本默认读取 `../requirements/全国文保单位/shp格式（arcgis、qgis软件）/全国文保单位2017` 路径。如果路径不同，可指定：

```bash
npx tsx scripts/import-pois.ts /path/to/全国文保单位2017
```

脚本运行后会输出进度，最终导入 2356 条文保单位记录。

#### 5.3 验证数据

在 Neon SQL Editor 中运行：

```sql
SELECT COUNT(*) FROM pois;
SELECT id, name, category, batch, ST_X(location) as lng, ST_Y(location) as lat FROM pois LIMIT 5;
```

---

### 第六步：创建管理员账号

#### 6.1 启动本地开发服务器

```bash
pnpm dev
```

打开 http://localhost:3000 ，确认地图能显示（即使没数据标记也正常）。

#### 6.2 注册管理员

用 `curl` 或任意 HTTP 客户端调用注册接口：

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"your-admin-password","role":"admin"}'
```

也可以访问 http://localhost:3000/login 页面注册后，再到 Neon SQL Editor 手动提升权限：

```sql
UPDATE users SET role = 'admin' WHERE username = 'your-username';
```

#### 6.3 验证登录

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"your-admin-password"}' \
  -v
```

应返回 JWT 并设置 `token` cookie。

---

### 第七步：本地功能验证

#### 7.1 地图主页（/）

- 访问 http://localhost:3000
- 地图应正常加载，移动地图后触发 bbox 查询，右侧弹出 POI 列表
- 点击 POI 标注弹出 InfoWindow

#### 7.2 设备定位

- 点击导航栏 **定位** 按钮
- 浏览器弹出位置权限请求，允许后地图上出现蓝色定位标记
- 需要在 HTTPS 环境或 localhost 下才能使用

#### 7.3 拉框查询

- 点击 **拉框查询** 按钮
- 在地图上拖拽画矩形区域
- 释放鼠标后自动查询并展示区域内 POI

#### 7.4 半径查询

- 点击 **半径查询** 按钮
- 在地图上点击并拖拽画圆
- 释放后查询圆内 POI，按距离升序排列

#### 7.5 管理员后台

- 访问 http://localhost:3000/login ，用管理员账号登录
- 自动跳转到 /admin 页面
- 可搜索、新增、编辑、删除 POI 记录

#### 7.6 API Key 管理

- 用普通用户登录后跳转到 /account
- 创建 API Key（明文只显示一次，注意保存）
- 使用 API Key 调用接口：

```bash
curl http://localhost:3000/api/pois \
  -H "Authorization: ApiKey your-api-key-here"
```

#### 7.7 健康检查

```bash
curl http://localhost:3000/api/health
```

返回数据库连接状态和延迟。

---

### 第八步：部署到 Vercel

#### 8.1 推送代码到 Git 远程仓库

```bash
# 在项目根目录（poi-web 的上级）
git add poi-web/
git commit -m "feat: complete POI-LBS project"
git push origin main
```

> 如果使用 Gitee：先在 Gitee 创建仓库，添加远程后推送。

#### 8.2 在 Vercel 导入项目

1. 登录 https://vercel.com
2. 点击 **Add New... → Project**
3. 选择 **Import Git Repository**
4. 如果用 Gitee，需要先在 Vercel 集成 Gitee（Settings → Integrations）
5. 选择仓库后，配置以下设置：
   - **Root Directory**：设为 `poi-web`（因为项目在子目录中）
   - **Framework Preset**：Next.js（自动检测）
   - **Build Command**：`pnpm build`
   - **Output Directory**：留空（Next.js 自动处理）

#### 8.3 配置 Vercel 环境变量

在 Vercel 项目设置 **Settings → Environment Variables** 中添加以下变量（与 `.env.local` 相同，但去掉 `NEXT_PUBLIC_BASE_URL` 改为线上地址）：

| 变量名 | 值 |
|--------|---|
| `DATABASE_URL` | Neon 连接字符串（与本地相同） |
| `JWT_SECRET` | 与本地相同 |
| `JWT_EXPIRES_IN` | `2h` |
| `UPSTASH_REDIS_REST_URL` | Upstash URL |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Token |
| `NEXT_PUBLIC_AMAP_KEY` | 高德 Key |
| `NEXT_PUBLIC_AMAP_SECURITY_CODE` | 高德安全密钥 |
| `NEXT_PUBLIC_BASE_URL` | `https://your-app.vercel.app`（部署后的域名） |

> **注意**：`NEXT_PUBLIC_BASE_URL` 需要等首次部署完成后才能知道域名。可以先留空部署一次，拿到域名后再填上重新部署。

#### 8.4 触发部署

1. 配置完环境变量后点击 **Deploy**
2. 等待构建完成（约 1-2 分钟）
3. 构建成功后点击生成的域名访问线上站点

#### 8.5 验证线上环境

```bash
# 健康检查
curl https://your-app.vercel.app/api/health

# POI 列表
curl https://your-app.vercel.app/api/pois?pageSize=5

# 拉框查询（北京区域）
curl "https://your-app.vercel.app/api/pois/search/bbox?minLng=116&minLat=39.5&maxLng=117&maxLat=40.5"
```

---

### 第九步：后续更新部署

Vercel 已配置自动部署，后续只需：

```bash
git add .
git commit -m "fix: 修复xxx"
git push origin main
```

Vercel 会自动检测到推送并重新构建部署。

如需手动重新部署，可在 Vercel Dashboard 的 **Deployments** 页面点击最新部署旁的 **...** → **Redeploy**。

---

## API 端点一览

### 认证

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| POST | `/api/auth/register` | 注册用户 | 无 |
| POST | `/api/auth/login` | 登录，返回 JWT | 无 |

### API Key

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| POST | `/api/auth/apikey` | 创建 API Key | JWT |
| GET | `/api/auth/apikey` | 列出当前用户的 Key | JWT |
| DELETE | `/api/auth/apikey/:id` | 删除 Key | JWT |

### POI

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | `/api/pois` | 分页列表（支持 name/province/category/batch/hasImage/hasWebsite 筛选） | 无 |
| GET | `/api/pois/:id` | 单条详情 | 无 |
| POST | `/api/pois` | 新增 POI | admin JWT |
| PUT | `/api/pois/:id` | 编辑 POI | admin JWT |
| DELETE | `/api/pois/:id` | 删除 POI | admin JWT |

### 空间查询

| 方法 | 路径 | 参数 | 说明 |
|------|------|------|------|
| GET | `/api/pois/search/bbox` | `minLng, minLat, maxLng, maxLat, page, pageSize` | 拉框查询 (ST_Within) |
| GET | `/api/pois/search/radius` | `lng, lat, radius(米), page, pageSize` | 中心半径查询 (ST_DWithin)，按距离升序 |

### 系统

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 数据库连通性检查 |

### 统一响应格式

**成功**：

```json
{
  "data": { ... },
  "meta": { "page": 1, "pageSize": 20, "total": 2356 }
}
```

**错误**：

```json
{
  "error": {
    "code": "POI_001",
    "message": "POI 不存在",
    "debug_url": "https://your-app.vercel.app/docs/errors#POI_001"
  }
}
```

### 错误码

| 码 | HTTP | 说明 |
|----|------|------|
| AUTH_001 | 401 | 未登录或凭证已过期 |
| AUTH_002 | 401 | API Key 无效 |
| AUTH_003 | 403 | 权限不足 |
| AUTH_004 | 409 | 用户名已存在 |
| AUTH_005 | 401 | 用户名或密码错误 |
| POI_001 | 404 | POI 不存在 |
| POI_002 | 400 | POI 数据校验失败 |
| RATE_001 | 429 | 请求过于频繁 |
| VAL_001 | 400 | 请求参数校验失败 |
| SYS_001 | 500 | 服务器内部错误 |

---

## 数据源

全国重点文物保护单位数据来自 `requirements/全国文保单位/shp格式（arcgis、qgis软件）/全国文保单位2017.shp`，共 2356 条记录。

字段映射：

| SHP 字段 | 数据库字段 | 说明 |
|-----------|------------|------|
| code | heritage_code | 文保编号 |
| classCode | class_code | 分类代码 |
| name | name | 名称 |
| age | age | 时代 |
| add | province / address | 地址 |
| type | category | 类别（古建筑、石窟寺等） |
| batch | batch | 批次（第一批~第七批） |
| lon / lat | location (geometry) | WGS84 坐标 |
| remark | remark | 备注 |

---

## 开发命令

```bash
# 本地开发
pnpm dev

# 构建生产版本
pnpm build

# 本地运行生产版本
pnpm start

# 代码检查
pnpm lint
```
