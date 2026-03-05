# 后端部署：Docker Compose（宝塔 / Coolify）

后端通过 Docker Compose 部署，支持宝塔面板 + Nginx 和 Coolify 两种管理方式。

架构：Nginx（80/443） → 反向代理 → Docker backend 容器（8000） → PostgreSQL（内部网络）

---

## 前置条件

- 阿里云 ECS（推荐香港，无需备案）
- 已安装 Docker 和 Docker Compose
- SSH 访问权限

---

## 1. 克隆代码到服务器

```bash
ssh root@your-server-ip
cd /www/wwwroot   # 或者 /root
git clone <repo-url> trader
cd trader
```

---

## 2. 配置环境变量

```bash
cp backend/.env.example backend/.env
vi backend/.env
```

**生产环境必须修改以下字段：**

```env
# 数据库（Docker Compose 内部网络，服务名 postgres）
DATABASE_URL=postgresql+asyncpg://trader:YOUR_DB_PASSWORD@postgres:5432/trader

# 安全密钥（必须重新生成）
SECRET_KEY=<python -c "import secrets; print(secrets.token_hex(32))">
ADMIN_TOKEN=<python -c "import secrets; print(secrets.token_hex(24))">

# LLM
LLM_PROVIDER=openai
LLM_API_KEY=sk-your-api-key
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_MODEL=deepseek-chat

# CORS（填写你的前端 Vercel 域名）
ALLOWED_ORIGINS=https://your-app.vercel.app,https://yourdomain.com

# 邮件验证（可选，留空则注册自动通过）
RESEND_API_KEY=re_xxx
EMAIL_FROM=财财技术洞见 <noreply@yourdomain.com>
APP_BASE_URL=https://your-app.vercel.app

# 爱发电（可选）
AFDIAN_WEBHOOK_TOKEN=your-webhook-token
AFDIAN_BASIC_PLAN_ID=xxx
AFDIAN_PREMIUM_PLAN_ID=xxx
AFDIAN_USER_ID=xxx
AFDIAN_API_TOKEN=xxx
```

在**项目根目录**创建 `.env`（Docker Compose 读取顶层变量）：

```bash
cat > .env << 'EOF'
POSTGRES_PASSWORD=YOUR_DB_PASSWORD
POSTGRES_USER=trader
POSTGRES_DB=trader
SECRET_KEY=<同上>
ADMIN_TOKEN=<同上>
LLM_API_KEY=sk-your-api-key
ALLOWED_ORIGINS=https://your-app.vercel.app
EOF
```

---

## 3. 构建并启动容器

```bash
cd /www/wwwroot/trader

# 首次构建（需要几分钟）
docker compose build

# 后台启动（生产环境通常只需要 postgres 和 backend，前端部署在 Vercel）
docker compose up -d postgres backend

# 查看运行状态
docker compose ps

# 查看后端日志
docker compose logs -f backend
```

正常状态示例：

```
NAME                    STATUS          PORTS
trader-postgres-1       Up (healthy)
trader-backend-1        Up (healthy)    0.0.0.0:8000->8000/tcp
```

---

## 4. 配置 Nginx 反向代理

### 宝塔面板

1. 宝塔面板 → **网站 → 添加站点**（域名：`api.yourdomain.com`）
2. 进入站点设置 → **反向代理 → 添加反向代理**
   - 目标 URL：`http://127.0.0.1:8000`
   - 发送域名：`$host`
3. SSL → **Let's Encrypt** 申请免费证书

### 手动 Nginx 配置

```nginx
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
        proxy_connect_timeout 10s;
    }
}
```

---

## 5. 阿里云安全组放行端口

| 端口 | 协议 | 说明 |
|------|------|------|
| 80 | TCP | HTTP（Nginx） |
| 443 | TCP | HTTPS（Nginx + SSL） |
| 8888 | TCP | 宝塔面板（仅限你的 IP） |

> **不要**直接暴露 8000（backend）和 5432（PostgreSQL）端口。

---

## 6. 验证部署

```bash
# 健康检查
curl https://api.yourdomain.com/api/health

# 注册测试账号
curl -X POST https://api.yourdomain.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test1234!"}'

# 查看统计（admin）
curl https://api.yourdomain.com/api/admin/stats \
  -H "X-Admin-Token: <ADMIN_TOKEN>"
```

---

## 7. 更新部署

```bash
cd /www/wwwroot/trader
git pull
docker compose build backend
docker compose up -d --no-deps backend
docker compose logs -f backend --tail=50
```

---

## 数据持久化与备份

| Volume | 内容 |
|--------|------|
| `postgres_data` | PostgreSQL 数据文件 |
| `backend_data` | SQLite（开发）/ 上传文件 |
| `backend_logs` | 应用日志 |

```bash
# 备份 PostgreSQL
docker exec trader-postgres-1 pg_dump -U trader trader > backup_$(date +%Y%m%d).sql

# 恢复
docker exec -i trader-postgres-1 psql -U trader -d trader < backup_20250301.sql
```

---

## Coolify 部署方式

如使用 Coolify 管理平台：

1. Coolify UI → **New Resource → Docker Compose** → 选择仓库
2. 在 Coolify **Environment Variables** 页面填写：
   - `SECRET_KEY`
   - `ADMIN_TOKEN`
   - `LLM_API_KEY`
   - `POSTGRES_PASSWORD`
3. 其他变量参考 `docker-compose.yml` 注释，前端通过 Next.js rewrites 在服务端代理 `/api/*` 到 backend 容器，**无需**配置 `NEXT_PUBLIC_API_URL`。

---

## 常见问题

**容器启动后立刻退出**

```bash
docker compose logs backend
```

常见原因：`SECRET_KEY` 未设置（仍是默认值）、`DATABASE_URL` 格式错误、LLM API Key 为空。

**数据库连接失败**

确认 `docker compose ps` 中 `postgres` 状态为 `(healthy)`，backend 的 `DATABASE_URL` 中密码与 `POSTGRES_PASSWORD` 一致。

**前端请求跨域报错**

确认后端 `.env` 中 `ALLOWED_ORIGINS` 包含 Vercel 前端域名，重启 backend 容器生效：

```bash
docker compose restart backend
```
