# poi-web-v2 Docker 一键部署

## 架构概览

```
docker compose up -d
├── db        (PostgreSQL 16 + PostGIS 3.4, 自动建库)
├── backend   (FastAPI, 启动前自动运行 Alembic 迁移)
└── nginx     (端口 80 → 前端静态文件 + /api 反向代理到 backend:8000)
```

## 目录结构

部署前确保 `poi-web-v2/` 目录下包含以下新增文件：

```
poi-web-v2/
├── docker-compose.yml          # 编排文件（覆盖原文件）
├── .env.production             # 生产环境变量
├── deploy/
│   └── nginx.conf              # Nginx 配置
├── backend/
│   ├── Dockerfile              # 后端镜像构建
│   ├── entrypoint.sh           # 启动脚本（迁移 + 启动服务）
│   ├── alembic.ini
│   ├── pyproject.toml
│   ├── migrations/
│   └── app/
├── client/
│   ├── config.js               # 前端配置（API_BASE 改为相对路径）
│   ├── index.html
│   ├── app.js
│   └── style.css
└── data/
    └── prepare.py
```

## 第一步：上传项目到服务器

```bash
scp -r poi-web-v2/ user@your-server:/opt/poi-web-v2
```

## 第二步：修改生产配置

编辑 `.env.production`：

```env
# Database
DB_NAME=lbs
DB_USER=lbs
DB_PASSWORD=<你的数据库密码>

# JWT（务必修改为随机字符串）
JWT_SECRET=<openssl rand -base64 32>
JWT_EXPIRE_MINUTES=60

# CORS
CORS_ORIGINS=["*"]

# Nginx 对外端口
PORT=80
```

生成随机 JWT 密钥：

```bash
openssl rand -base64 32
```

## 第三步：确保文件内容正确

### backend/Dockerfile

```dockerfile
FROM python:3.13-slim

RUN apt-get update && apt-get install -y --no-install-recommends libpq-dev && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY pyproject.toml ./
RUN pip install --no-cache-dir . && pip install --no-cache-dir psycopg2-binary "geoalchemy2[shapely]"

COPY alembic.ini ./
COPY migrations/ ./migrations/
COPY app/ ./app/

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8000

ENTRYPOINT ["/entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### backend/entrypoint.sh

```bash
#!/bin/bash
set -e

echo "=== Running database migrations ==="
alembic upgrade head

echo "=== Starting backend ==="
exec "$@"
```

### deploy/nginx.conf

```nginx
server {
    listen 80;
    server_name _;

    root /usr/share/nginx/html;
    index index.html;

    location /api/ {
        proxy_pass http://backend:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /docs {
        proxy_pass http://backend:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /openapi.json {
        proxy_pass http://backend:8000;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

### docker-compose.yml

```yaml
services:
  db:
    image: postgis/postgis:16-3.4
    environment:
      POSTGRES_DB: ${DB_NAME:-lbs}
      POSTGRES_USER: ${DB_USER:-lbs}
      POSTGRES_PASSWORD: ${DB_PASSWORD:-lbs_dev_2026}
    volumes:
      - pgdata:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER:-lbs}"]
      interval: 5s
      timeout: 3s
      retries: 10

  backend:
    build: ./backend
    environment:
      DATABASE_URL: postgresql+asyncpg://${DB_USER:-lbs}:${DB_PASSWORD:-lbs_dev_2026}@db:5432/${DB_NAME:-lbs}
      DATABASE_URL_SYNC: postgresql://${DB_USER:-lbs}:${DB_PASSWORD:-lbs_dev_2026}@db:5432/${DB_NAME:-lbs}
      JWT_SECRET: ${JWT_SECRET:-change-me-in-production}
      JWT_ALGORITHM: HS256
      JWT_EXPIRE_MINUTES: ${JWT_EXPIRE_MINUTES:-60}
      CORS_ORIGINS: ${CORS_ORIGINS:-["*"]}
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    ports:
      - "${PORT:-80}:80"
    volumes:
      - ./deploy/nginx.conf:/etc/nginx/conf.d/default.conf:ro
      - ./client:/usr/share/nginx/html:ro
    depends_on:
      - backend
    restart: unless-stopped

volumes:
  pgdata:
```

### client/config.js

部署版本的 `API_BASE` 必须使用相对路径，由 nginx 反向代理：

```javascript
window.LBS_CONFIG = {
  AMAP_KEY: '108142b723aa6342db9bdf29a1e8f20d',
  AMAP_SECURITY_JS_CODE: '634182c3bc006d70c5abc7884074c9e2',
  API_BASE: '/api/v1',
  API_KEY: '',
};
```

## 第四步：一键部署

```bash
cd /opt/poi-web-v2
docker compose --env-file .env.production up -d --build
```

启动过程：
1. `db` 容器启动，PostgreSQL + PostGIS 自动初始化，创建数据库和用户
2. `backend` 等待 `db` 健康检查通过后启动，`entrypoint.sh` 自动执行 `alembic upgrade head` 建表
3. `nginx` 最后启动，对外暴露端口 80

## 第五步：验证

```bash
# 检查所有容器状态
docker compose ps

# 健康检查
curl http://localhost/healthz

# API 文档
# 浏览器打开 http://服务器IP/docs
```

## 导入 POI 数据（可选）

```bash
# 将 shp 文件上传到服务器后，在容器外执行
docker compose exec db pg_isready -U lbs

# 用宿主机 Python 执行导入脚本
pip install geopandas shapely sqlalchemy psycopg2-binary
python3 data/prepare.py \
  --input /path/to/全国文保单位2017.shp \
  --truncate
```

注意 `prepare.py` 中的数据库连接字符串需改为：

```python
db_url = "postgresql://lbs:你的密码@localhost:5432/lbs"
```

或者直接进 db 容器执行：

```bash
# 先把 shp 文件拷入容器
docker compose cp /path/to/全国文保单位2017.shp db:/tmp/
```

## 常用运维命令

```bash
# 查看日志
docker compose logs -f backend
docker compose logs -f nginx

# 重启服务
docker compose restart

# 停止并删除容器（数据不丢失，pgdata volume 保留）
docker compose down

# 完全清除包括数据卷
docker compose down -v

# 重新构建（代码更新后）
docker compose up -d --build
```
