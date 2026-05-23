# LBS 课程设计项目说明
---

## 0. 项目一句话说明

实现一个面向**全国重点文物保护单位**（国保单位）数据的 REST 风格 POI Web API，并配套一个集成高德地图的 Web 客户端，作为武汉大学《基于位置的服务》课程设计的交付。

- **DDL**：2026-05-30 18:00（北京时间）
- **数据源**：用户提供的全国文保单位 ESRI Shapefile
- **Gitee 仓库**：`https://gitee.com/rsgis/lbs-252602.git`
- **工作分支**：从 `master` 分出本组分支，所有提交在分支上完成

---

## 1. 技术栈（已锁定，不要再选型）

| 层 | 选型 | 备注 |
|---|---|---|
| 后端框架 | **FastAPI** (Python 3.11) | 自带 OpenAPI / Swagger UI，直接作为接口文档 |
| ORM | SQLAlchemy 2.x + GeoAlchemy2 | 异步 session |
| 数据库 | **PostgreSQL 16 + PostGIS 3** | 空间索引 GIST |
| 模糊文本 | `pg_trgm` 扩展 | 名称模糊查询 |
| 鉴权 | **JWT** (`python-jose`) + **APIKEY** (`argon2-cffi` hash) | 双轨：管理用 JWT，公众用 APIKEY |
| 限速 | `slowapi` | 内存版即可，APIKEY 维度 60 req/min |
| HTTPS | **Caddy v2** | 自动 Let's Encrypt 证书，三行 Caddyfile |
| 容器 | Docker + Docker Compose | 单 compose 文件起全部服务 |
| 前端 | **单页 HTML + 原生 JS + 高德 JS API 2.0** | 不要 React/Vue |
| 数据预处理 | `geopandas` + `coord-convert` | shp → WGS84 → GCJ-02 |
| 测试 | `pytest` + `httpx` + Postman 集合 | Postman 集合作为交付物 |

**严禁**：
- ❌ 引入 React/Vue/Next.js（演示当天构建出问题就完蛋）
- ❌ 自己实现密码哈希（用 `passlib[argon2]`）
- ❌ APIKEY 明文存库（必须 hash）
- ❌ 在 `master` 上直接 push
- ❌ 跳过坐标系转换（GCJ-02 偏移必做，否则地图上所有点都"漂"了）
- ❌ 把 `.env`、`secrets.toml`、密钥文件提交进 git

---

## 2. 项目目录结构

```
poi-web-v2/
├── README.md                  # 成员分工、任务占比、本地运行说明
├── AGENTS.md                  # 本文档
├── docker-compose.yml
├── Caddyfile
├── .env.example               # 真实 .env 不入库
├── data/
│   ├── raw/                   # 原始 shp（gitignore）
│   ├── processed/             # 清洗后 csv / geojson
│   └── prepare.py             # shp → PostGIS 入库脚本
├── backend/
│   ├── Dockerfile
│   ├── pyproject.toml
│   ├── alembic.ini
│   ├── migrations/
│   └── app/
│       ├── main.py
│       ├── config.py
│       ├── db.py
│       ├── deps.py            # 依赖注入：current_user, require_admin, apikey_auth
│       ├── errors.py          # 业务错误码 + 统一异常处理器
│       ├── models/            # SQLAlchemy ORM
│       ├── schemas/           # Pydantic v2
│       ├── routers/
│       │   ├── auth.py
│       │   ├── users.py
│       │   ├── pois.py
│       │   └── admin.py
│       ├── services/
│       └── utils/
│           ├── security.py
│           ├── coord.py       # WGS84 ↔ GCJ-02
│           └── ratelimit.py
├── client/
│   ├── index.html
│   ├── app.js
│   ├── style.css
│   └── config.js              # 高德 key、API base url
├── tests/
│   ├── conftest.py
│   ├── test_auth.py
│   ├── test_pois.py
│   └── test_spatial.py
├── postman/
│   └── lbs-252602.postman_collection.json
└── docs/
    ├── report.docx            # 课程设计报告
    ├── api-design.md
    └── erd.png
```

---

## 3. 数据：全国文保单位 Shapefile

### 3.1 数据背景

- **全名**：全国重点文物保护单位（"国保单位"）
- **批次**：1961 年第一批起共 8 批，截至 2019 年第八批共 **5058 处**
- **类别枚举**（务必使用以下中文字符串，原文一致）：
  - `古遗址`
  - `古墓葬`
  - `古建筑`
  - `石窟寺及石刻`
  - `近现代重要史迹及代表性建筑`
  - `其他`

### 3.2 shp 字段映射

shp 字段名因数据来源不同会有差异，agent 必须先用 `geopandas.read_file()` 打印 `gdf.columns` 和 `gdf.head()` **确认实际字段名**，再做映射。常见映射示例：

| shp 字段（典型） | DB 字段 | 类型 | 备注 |
|---|---|---|---|
| `编号` / `BH` / `CODE` | `code` | text | 形如 `7-0001-1-001`，UNIQUE |
| `名称` / `MC` / `NAME` | `name` | text | NOT NULL |
| `类别` / `LB` / `TYPE` | `category` | text | 见 3.1 枚举，严格校验 |
| `年代` / `ND` / `ERA` | `era` | text | 原文，可能"新石器时代"或"清"或"1923 年" |
| `批次` / `PC` / `BATCH` | `batch` | int | 1–8，若是 "第七批" 需解析 |
| `省` / `SHENG` / `PROV` | `province` | text | 标准化为两字简称或全称，二选一统一 |
| `市` | `city` | text | 可空 |
| `地址` / `DZ` | `address` | text | 可空 |
| `geometry` (Point) | `location` | geography(Point,4326) | 见 3.3 |

### 3.3 坐标系处理（⚠️ 关键，错了演示直接翻车）

1. **判定原始坐标系**：`gdf.crs`。文保数据常见为 `EPSG:4490`（CGCS2000）或 `EPSG:4326`（WGS84），偶有 `EPSG:4214`（Beijing 54）。
2. **统一到 WGS84**：`gdf = gdf.to_crs(epsg=4326)`。
3. **入库存 WGS84**。
4. **前端展示前转 GCJ-02**：高德地图使用 GCJ-02（火星坐标系）。从 WGS84 直接画点会有 50–500m 偏移，国保点都"漂"到马路上。
   - 推荐库：`coord-convert`（`pip install coord-convert`）
   - 或后端在响应里同时返回 `lng_wgs / lat_wgs` 和 `lng_gcj / lat_gcj` 两套，前端用 gcj 那套画图。

### 3.4 数据库 schema（DDL，直接用）

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- gen_random_uuid

-- 用户
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username      text UNIQUE NOT NULL,
  email         text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  role          text NOT NULL DEFAULT 'user' CHECK (role IN ('admin','user')),
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- APIKEY（只存哈希，明文仅生成时一次性返回）
CREATE TABLE api_keys (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_hash     text NOT NULL,
  key_prefix   text NOT NULL,  -- 前 8 位明文，便于用户识别
  name         text,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);
CREATE INDEX api_keys_user_id_idx ON api_keys(user_id);

-- POI 主表
CREATE TABLE pois (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code         text UNIQUE,
  name         text NOT NULL,
  category     text NOT NULL CHECK (category IN
                 ('古遗址','古墓葬','古建筑','石窟寺及石刻',
                  '近现代重要史迹及代表性建筑','其他')),
  era          text,
  batch        int CHECK (batch BETWEEN 1 AND 8),
  province     text,
  city         text,
  address      text,
  location     geography(Point, 4326) NOT NULL,
  description  text,
  image_urls   text[] NOT NULL DEFAULT '{}',
  website      text,
  has_extended boolean GENERATED ALWAYS AS
    (coalesce(array_length(image_urls,1),0) > 0 OR website IS NOT NULL) STORED,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX pois_geom_gix      ON pois USING GIST (location);
CREATE INDEX pois_name_trgm     ON pois USING GIN (name gin_trgm_ops);
CREATE INDEX pois_province_idx  ON pois (province);
CREATE INDEX pois_category_idx  ON pois (category);
CREATE INDEX pois_batch_idx     ON pois (batch);
```

---

## 4. API 设计契约

### 4.1 通用约定

- 路径前缀：`/api/v1`
- 时间格式：ISO 8601 with TZ（`2026-05-23T12:34:56+08:00`）
- 分页：`?page=1&size=20`，`size` 上限 100
- 排序：`?sort=name,-created_at`（前缀 `-` 表降序）
- 所有响应（成功 + 失败）均为统一信封格式（见 4.4）

### 4.2 端点清单

| Method | Path | 权限 | 用途 |
|---|---|---|---|
| POST | `/auth/register` | public | 公众用户注册 |
| POST | `/auth/login` | public | 登录获取 JWT |
| POST | `/auth/refresh` | jwt | 刷新 token |
| GET  | `/users/me` | jwt | 个人信息 |
| PATCH| `/users/me` | jwt | 更新个人信息 / 密码 |
| POST | `/users/me/apikeys` | jwt | 生成 APIKEY（**明文仅响应中返回一次**） |
| GET  | `/users/me/apikeys` | jwt | 列出我的 APIKEY（仅 prefix） |
| DELETE| `/users/me/apikeys/{id}` | jwt | 吊销 APIKEY |
| GET  | `/pois` | apikey | 列表查询，支持 `name/province/category/batch/has_extended/page/size` |
| GET  | `/pois/{id}` | apikey | 详情 |
| GET  | `/pois/search/bbox` | apikey | `?minLng=&minLat=&maxLng=&maxLat=` 拉框 |
| GET  | `/pois/search/radius` | apikey | `?lng=&lat=&radius=`（米）半径 |
| POST | `/pois` | admin jwt | 新增 |
| PATCH| `/pois/{id}` | admin jwt | 修改（部分字段） |
| DELETE| `/pois/{id}` | admin jwt | 删除 |
| GET  | `/meta/categories` | public | 类别枚举 |
| GET  | `/meta/provinces` | public | 省份列表 |
| GET  | `/healthz` | public | 健康检查 |

### 4.3 鉴权规则

- **公众查询接口** (`/pois/*`)：要求请求头 `X-API-Key: <plain>`。后端用 prefix 索引找出候选 row，再用 `argon2.verify` 校验。
- **管理 / 用户接口**：要求请求头 `Authorization: Bearer <jwt>`。
- **角色控制**：JWT payload 包含 `role`，写接口（POST/PATCH/DELETE `/pois`）依赖 `require_admin`。
- **限速**：APIKEY 维度 60 req/min；未认证接口（注册/登录）按 IP 限速 10 req/min。

### 4.4 统一响应信封

成功：
```json
{
  "code": 0,
  "message": "ok",
  "data": { ... } 或 [ ... ],
  "error": null,
  "meta": { "page": 1, "size": 20, "total": 5058 }  // 列表才有
}
```

失败：
```json
{
  "code": 40301,
  "message": "APIKEY quota exceeded",
  "data": null,
  "error": {
    "trace_id": "f3a9c8...",
    "details": "60 requests per minute exceeded",
    "docs": "https://<host>/docs#/errors/40301"
  }
}
```

HTTP 状态码 + 业务码同时存在；HTTP 表传输层，业务码表语义层。

### 4.5 业务错误码表

| code | HTTP | 含义 |
|---|---|---|
| 0 | 200 | 成功 |
| 40001 | 400 | 参数校验失败 |
| 40002 | 400 | 坐标越界 |
| 40101 | 401 | JWT 无效或过期 |
| 40102 | 401 | APIKEY 无效 |
| 40301 | 403 | 限速触发 |
| 40302 | 403 | 角色权限不足 |
| 40401 | 404 | POI 不存在 |
| 40402 | 404 | 用户不存在 |
| 40901 | 409 | 用户名 / code 已存在 |
| 50001 | 500 | 内部错误 |
| 50301 | 503 | 数据库不可用 |

### 4.6 数据实体 schema（响应 `data` 字段）

POI 详情：
```json
{
  "id": "uuid",
  "code": "7-0001-1-001",
  "name": "北京故宫",
  "category": "古建筑",
  "era": "明至清",
  "batch": 1,
  "province": "北京市",
  "city": "北京市",
  "address": "东城区景山前街 4 号",
  "location": {
    "wgs84": { "lng": 116.3974, "lat": 39.9163 },
    "gcj02": { "lng": 116.4036, "lat": 39.9175 }
  },
  "description": "明清两代皇宫……",
  "image_urls": ["https://.../1.jpg"],
  "website": "https://www.dpm.org.cn",
  "has_extended": true,
  "created_at": "2026-05-24T10:00:00+08:00",
  "updated_at": "2026-05-24T10:00:00+08:00"
}
```

---

## 5. 客户端要求

### 5.1 必须实现

1. 高德 JS API 2.0 底图，初始视野定位到中国大陆。
2. **持续显示设备位置**：用 `AMap.Geolocation` 插件，开启位置授权，每 30s 刷新一次，用一个 **不同于 POI** 的符号（建议蓝点 + 精度圆）持续显示。
3. **可视化 POI**：使用 `AMap.MarkerCluster` 聚合显示当前视野内的 POI。
4. **`moveend` 事件**：地图平移 / 缩放结束后调 `/pois/search/bbox` 重新加载。
5. **筛选工具栏**：省份下拉、类别下拉、关键词输入框、批次多选。
6. **拉框查询**：`AMap.MouseTool.rectangle()`，结束后取四角坐标调 bbox 接口。
7. **半径查询**：点击地图任意点 → 弹出半径输入框 → 调 radius 接口 → 画圆 + 高亮结果。
8. **POI 详情**：点击 marker → `InfoWindow` 显示详情；扩展信息（图片、官网）以缩略图 + 外链呈现。

### 5.2 配置文件 `client/config.js`

```js
window.LBS_CONFIG = {
  AMAP_KEY: '<在高德开放平台申请>',
  AMAP_SECURITY_JS_CODE: '<密钥>',  // 2021 年后高德新增
  API_BASE: 'https://lbs.example.com/api/v1',
  API_KEY: '<演示用 APIKEY>'        // 演示时硬编码即可，正式应用登录后动态获取
};
```

**域名白名单**：在高德控制台为 key 添加 `localhost`、部署域名。

---

## 6. 部署：Docker Compose + Caddy

### 6.1 `docker-compose.yml` 骨架

```yaml
services:
  db:
    image: postgis/postgis:16-3.4
    environment:
      POSTGRES_DB: lbs
      POSTGRES_USER: lbs
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
    restart: unless-stopped

  api:
    build: ./backend
    environment:
      DATABASE_URL: postgresql+asyncpg://lbs:${DB_PASSWORD}@db:5432/lbs
      JWT_SECRET: ${JWT_SECRET}
      CORS_ORIGINS: ${CORS_ORIGINS}
    depends_on: [db]
    restart: unless-stopped

  caddy:
    image: caddy:2-alpine
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - ./client:/srv/client:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on: [api]
    restart: unless-stopped

volumes:
  pgdata:
  caddy_data:
  caddy_config:
```

### 6.2 `Caddyfile`（最小可行）

```
lbs.example.com {
    handle_path /api/* {
        reverse_proxy api:8000
    }
    handle {
        root * /srv/client
        try_files {path} /index.html
        file_server
    }
}
```

替换 `lbs.example.com` 为实际域名。Caddy 会自动申请并续期 Let's Encrypt 证书。

如果没有域名，开发期用 `nip.io` 泛解析：`123-45-67-89.nip.io`（替换为服务器公网 IP，把 `.` 换 `-`）。

---

## 7. 任务分解（P0 必做，P1 应做，P2 选做）

### P0 — 必须完成（达到课程要求底线）
- [ ] **T01** 数据预处理：shp → 清洗 → PostGIS 入库（含坐标系转换）
- [ ] **T02** FastAPI 项目骨架 + 配置 + 数据库连接 + Alembic 迁移
- [ ] **T03** 用户注册 / 登录 / JWT
- [ ] **T04** APIKEY 生成 / 列出 / 吊销
- [ ] **T05** POI CRUD（管理端，admin only）
- [ ] **T06** POI 查询：名称 / 省份 / 类别 / 批次 / 扩展信息
- [ ] **T07** POI 空间查询：bbox / radius
- [ ] **T08** 统一响应信封 + 业务错误码 + 全局异常处理
- [ ] **T09** 限速（slowapi，APIKEY 维度）
- [ ] **T10** Docker Compose 一键启动
- [ ] **T11** Caddy 反代 + HTTPS 上线
- [ ] **T12** 客户端：底图 + POI 可视化 + bbox 查询
- [ ] **T13** 客户端：设备位置持续显示
- [ ] **T14** 客户端：拉框 / 半径交互查询
- [ ] **T15** Postman 集合 + 关键 pytest 用例
- [ ] **T16** 课程设计报告 + 每周小结

### P1 — 应该完成（加分项）
- [ ] **T20** Swagger UI 自定义（标题、描述、错误码示例）
- [ ] **T21** 客户端：详情面板 + 扩展信息（图片 / 官网）
- [ ] **T22** 客户端：批次 / 类别多选筛选
- [ ] **T23** 接口幂等性（POST 带 Idempotency-Key）
- [ ] **T24** 操作审计日志（admin 写操作）
- [ ] **T25** README 完善：架构图、ERD、运行截图

### P2 — 选做
- [ ] **T30** 热力图模式（按密度聚合可视化）
- [ ] **T31** 简单 admin 网页（增删改 POI）
- [ ] **T32** 客户端路线规划（高德 Driving / Walking）
- [ ] **T33** 单元测试覆盖率报告

---

## 8. 命令速查

```bash
# 启动开发环境
docker compose up -d db
cd backend
uv venv && uv pip install -e ".[dev]"   # 或 pip
alembic upgrade head
uvicorn app.main:app --reload --port 8000

# 数据导入（PostGIS 服务必须先起来）
python data/prepare.py --input data/raw/national_heritage.shp --truncate

# 生成 / 升级迁移
alembic revision --autogenerate -m "init"
alembic upgrade head

# 测试
pytest -v --cov=app

# 生产部署
docker compose up -d --build
docker compose logs -f api

# Postman 集合导出（用于交付）
# 在 Postman GUI: ... -> Export -> Collection v2.1 -> 存到 postman/
```

---

## 9. Gitee 协作约定

1. 从 `master` 创建组分支：`group-XX`（组长建）。
2. 每人在组分支上再开 feature 分支：`feat/api-auth`、`feat/client-map`、`feat/data-prepare`。
3. PR 合到组分支，组分支不直接合 master（除非课程要求）。
4. Commit message 用 Conventional Commits：`feat:` / `fix:` / `docs:` / `chore:` / `test:`。
5. README 里贴贡献统计图（`git shortlog -sn` 截图或 gitee 自带图）。
6. `.gitignore` 必含：`__pycache__/`、`.venv/`、`.env`、`data/raw/`、`*.pyc`、`.DS_Store`、`node_modules/`、`*.shp` `*.shx` `*.dbf`（数据可能巨大，用 LFS 或不入库）。

---

## 10. 已知坑点（按踩坑概率从高到低）

1. **坐标系偏移（必踩）**：shp 是 CGCS2000 (`EPSG:4490`) 直接传给高德 → 点全部漂到马路上。修复：入库前 `to_crs(4326)`，前端展示前 WGS84 → GCJ-02。
2. **shp 编码**：中文字段乱码 → `geopandas.read_file(path, encoding='gb18030')`，不行就试 `cp936`。
3. **shp 字段名截断**：DBF 列名最大 10 字符，"近现代史迹" 可能被截。预处理时先打印 columns 再手工映射。
4. **PostGIS `&&` vs `ST_Within`**：bbox 查询用 `&&`（bounding box 重叠，走 GIST 索引）快得多；要求严格包含才用 `ST_Within`。
5. **`geography` vs `geometry`**：用 `geography` 时距离单位是米，无需手算大地距离；但部分算子（如 `ST_MakeEnvelope`）需要 cast 回 `geometry`。
6. **JWT secret 泄漏**：`.env` 必须 gitignore，演示用一个、上线换一个。
7. **CORS**：客户端在 `https://a.com`、API 在 `https://api.b.com` → 后端必须配 `CORSMiddleware`，不能只信 Caddy。
8. **高德 key 安全码**：2021 年后高德 JS API 要求 `securityJsCode`，少配会报 USERKEY_PLAT_NOMATCH。
9. **InfoWindow 多次打开**：每次点击都 `new` 一个会内存泄漏 + 卡顿，应复用单例。
10. **MarkerCluster 与大数据**：5058 点用 `MarkerCluster` 没问题，但若不聚合直接画会卡。
11. **`/pois/search/bbox` 无限拉**：客户端 `moveend` 事件如果不 debounce，地图拖动一次发十几个请求。**必须** 加 250–500ms debounce。
12. **Alembic 不识别 PostGIS 类型**：迁移文件里要 `from geoalchemy2 import Geography`，并在 `env.py` 配 `include_object` 过滤 PostGIS 内部表。

---

## 11. 验收清单（演示当天的"必过"项）

演示流程必须能跑通：

1. ✅ 浏览器访问 `https://<域名>` 看到 HTTPS 锁标
2. ✅ 注册新用户 → 登录 → 拿到 JWT
3. ✅ 用 JWT 生成 APIKEY（明文只显示一次）
4. ✅ 用 APIKEY 请求 `/pois?province=北京市` 返回正确数据
5. ✅ 客户端加载，底图上显示当前位置（蓝点）
6. ✅ 地图上能看到当前视野的国保单位聚合点
7. ✅ 拖动地图，POI 自动刷新
8. ✅ 拉框工具选一片区域，结果以列表 + 地图高亮显示
9. ✅ 在地图任意点击 → 输入半径 → 显示该范围内 POI
10. ✅ 点击任一 POI → 弹窗显示完整信息（含扩展信息）
11. ✅ 用另一账号（admin）登录 → POST 一条新 POI → 公众端能查到
12. ✅ APIKEY 限速触发（连续狂调）→ 返回 `40301` 业务错误
13. ✅ Swagger UI (`/docs`) 可访问、可在线试接口

---

## 12. 报告填写指引（DDL 前必交）

报告需包含但不限于：

- 系统架构图（组件 + 数据流）
- ERD（pois / users / api_keys 三张表关系）
- API 设计原则（REST 资源化、版本化、统一信封、错误码）
- 安全设计（JWT + APIKEY 双轨、限速、HTTPS、密码哈希）
- 空间查询的 SQL 与索引（贴 EXPLAIN）
- 客户端交互流程图
- 测试覆盖说明（贴 Postman / pytest 截图）
- 个人心得（每人独立，可放每周小结表）
- 成员分工与贡献占比表（含 gitee 贡献图）

---

## 13. 给 Agent 的工作指令

执行任务时遵循以下顺序：

1. **先读本文档全文**，遇到分歧以本文档为准。
2. **不要改技术栈选型**。
3. **修改前先看现有代码**，避免重复定义。
4. **每完成一个 P0 任务在 PR 描述里勾选对应 checkbox**。
5. **任何写操作要走迁移**（Alembic），不要直接 SQL 改表。
6. **新增端点必须**：
   - 加 pytest 用例
   - 加 Postman 集合条目
   - 更新本文档 `4.2 端点清单`
7. **遇到 shp 字段名不一致时**：先打印实际字段，给出映射建议给人确认，不要擅自猜测。
8. **任何破坏性操作（DROP / TRUNCATE / 删除文件）必须在 commit message 写明并 double check**。
9. **不要把密钥提交进 git**，含但不限于：JWT secret、DB 密码、高德 key、APIKEY 明文、SSL 私钥。
10. **commit 前跑 `pytest` + `ruff check` + `ruff format`**。

— END —