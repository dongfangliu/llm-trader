# 阿里云服务器部署指南

## 服务器规格

| 配置 | 最低 | 推荐 |
|------|------|------|
| CPU | 2 核 | 4 核 |
| 内存 | 4 GB | 8 GB |
| 磁盘 | 40 GB SSD | 80 GB SSD |
| 系统 | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |
| 带宽 | 1 Mbps | 3 Mbps |

> **内存说明：** PostgreSQL + Redis + 3 个 Python 进程 + Next.js 共需约 3 GB，4 GB 勉强够用，8 GB 有余量。

---

## 架构

```
用户浏览器 (HTTPS)
    │
    └── 宝塔 Nginx (80/443) ← Let's Encrypt SSL
           │
           └── http://127.0.0.1:3000  (frontend - Next.js)
                    │
                    ├── /api/* → http://backend:8000  (Docker 内网)
                    └── /ws/*  → http://backend:8000  (WebSocket)
                                      │
                                redis:6379 (Docker 内网)
                                postgres:5432 (Docker 内网)
                                worker (Docker 内网)
                                data-collector (Docker 内网)
```

---

## 第一步：服务器初始化

SSH 连接服务器后执行：

```bash
# 更新系统
apt update && apt upgrade -y

# 安装基础工具
apt install -y git curl wget vim ufw

# 创建部署目录
mkdir -p /opt/trader
cd /opt/trader
```

---

## 第二步：安装 Docker

```bash
# 安装 Docker（官方脚本）
curl -fsSL https://get.docker.com | sh

# 将当前用户加入 docker 组（避免每次 sudo）
usermod -aG docker $USER

# 启动并设置开机自启
systemctl enable docker
systemctl start docker

# 验证
docker --version
docker compose version
```

---

## 第三步：安装宝塔面板

```bash
wget -O install.sh https://download.bt.cn/install/install-ubuntu_6.0.sh
bash install.sh ed8484bec
```

安装完成后，在**阿里云安全组**放行以下端口：

| 端口 | 用途 |
|------|------|
| 22 | SSH |
| 80 | HTTP（Nginx） |
| 443 | HTTPS（Nginx） |
| 8888 | 宝塔面板 |

> 宝塔安装完会显示面板地址和初始密码，记录下来。

在宝塔面板 → **软件商店** → 安装 **Nginx**。

---

## 第四步：上传代码

**方式 A（推荐）：Git 克隆**

```bash
cd /opt/trader
git clone https://your-git-repo-url.git .
```

**方式 B：本地压缩上传**

在 Windows 本地：
```powershell
# 打包（排除 node_modules、.next、__pycache__ 等）
Compress-Archive -Path . -DestinationPath trader.zip -Force
```

然后在宝塔文件管理器上传到 `/opt/trader/`，解压。

---

## 第五步：配置环境变量

```bash
cd /opt/trader
cp backend/.env.example backend/.env
vim backend/.env
```

**必填配置：**

```env
# 数据库（Docker 内网服务名）
DATABASE_URL=postgresql+asyncpg://trader:你的数据库密码@postgres:5432/trader

# Redis（Docker 内网）
REDIS_URL=redis://redis:6379

# 安全密钥（运行下方命令生成）
SECRET_KEY=在这里填入生成的密钥
ADMIN_TOKEN=在这里填入管理员token

# LLM 配置
LLM_API_KEY=sk-xxxx
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_MODEL=deepseek-chat

# 跨域（填你的域名，无末尾斜杠）
ALLOWED_ORIGINS=https://yourdomain.com

# 应用地址（用于邮件验证链接）
APP_BASE_URL=https://yourdomain.com
```

**生成密钥（在服务器执行）：**

```bash
python3 -c "import secrets; print(secrets.token_hex(32))"  # SECRET_KEY
python3 -c "import secrets; print(secrets.token_hex(24))"  # ADMIN_TOKEN
```

**设置 docker-compose 环境变量：**

在 `/opt/trader/` 创建 `.env` 文件（供 docker-compose 读取）：

```bash
cat > /opt/trader/.env << 'EOF'
POSTGRES_USER=trader
POSTGRES_PASSWORD=你的数据库密码
POSTGRES_DB=trader
BACKEND_PORT=8000
FRONTEND_PORT=3000
EOF
```

---

## 第六步：启动服务

```bash
cd /opt/trader

# 首次构建（需要几分钟）
docker compose build

# 启动所有服务
docker compose up -d

# 查看状态
docker compose ps
```

预期输出（所有服务 `Up`）：

```
NAME                STATUS
trader-postgres-1   Up (healthy)
trader-redis-1      Up (healthy)
trader-backend-1    Up (healthy)
trader-worker-1     Up
trader-frontend-1   Up
trader-data-collector-1  Up
```

**查看日志：**

```bash
docker compose logs -f backend    # 后端日志
docker compose logs -f worker     # Worker 日志（LLM 分析）
docker compose logs -f frontend   # 前端日志
```

---

## 第七步：配置域名（Cloudflare）

### 1. 添加 DNS A 记录

登录 Cloudflare → 选择你的域名 → **DNS** → **Add record**：

| Type | Name | IPv4 address | Proxy status |
|------|------|-------------|--------------|
| A | `@` | 你的阿里云服务器 IP | 🟠 Proxied（推荐）|

> 如需 `www` 子域，再添加一条 `CNAME www → @`。

### 2. 设置 SSL 模式

Cloudflare → **SSL/TLS → Overview** → 选择 **Full**（不要选 Flexible）

```
用户 ←HTTPS→ Cloudflare ←HTTPS→ 你的 Nginx
```

> `Flexible` 模式下 Cloudflare 到服务器段是明文 HTTP，存在安全风险，不要使用。

### 3. 申请 SSL 证书（二选一）

**方式 A：Let's Encrypt（宝塔自动续期）**

1. 暂时将 Cloudflare DNS 的 Proxy 改为 **DNS only**（灰云）
2. 宝塔面板 → 网站 → 该站点 → **SSL** → Let's Encrypt → 勾选域名 → **申请**
3. 申请成功后，将 Cloudflare Proxy 改回 **Proxied**（橙云）

**方式 B：Cloudflare Origin Certificate（推荐，15 年有效期）**

1. Cloudflare → **SSL/TLS → Origin Server → Create Certificate** → 下载 `.pem` 和 `.key`
2. 将文件上传到服务器（如 `/etc/nginx/ssl/`）
3. 在第八步 Nginx 配置中将证书路径替换为：
   ```nginx
   ssl_certificate     /etc/nginx/ssl/cloudflare-origin.pem;
   ssl_certificate_key /etc/nginx/ssl/cloudflare-origin.key;
   ```

### 4. 更新环境变量

```bash
vim /opt/trader/backend/.env
```

```env
ALLOWED_ORIGINS=https://yourdomain.com
APP_BASE_URL=https://yourdomain.com
```

重启 backend 使配置生效：

```bash
cd /opt/trader && docker compose restart backend
```

---

## 第八步：配置 Nginx 反向代理

在宝塔面板 → **网站** → **添加站点**，填入你的域名。

然后进入网站配置，修改 Nginx 配置（覆盖为以下内容）：

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    # SSL 证书（宝塔申请 Let's Encrypt 后自动填入）
    ssl_certificate     /www/server/panel/vhost/cert/yourdomain.com/fullchain.pem;
    ssl_certificate_key /www/server/panel/vhost/cert/yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;

    # 安全头
    add_header X-Frame-Options SAMEORIGIN;
    add_header X-Content-Type-Options nosniff;

    # WebSocket 升级头（arq Worker 结果推送）
    map $http_upgrade $connection_upgrade {
        default upgrade;
        ''      close;
    }

    # 所有请求转发给 Next.js（Next.js 内部代理 /api/* 和 /ws/* 到 backend）
    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection $connection_upgrade;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;   # LLM 分析可能需要较长时间
        proxy_send_timeout 300s;
    }
}
```

> **申请 SSL 证书：** 宝塔面板 → 网站 → 该站点 → SSL → Let's Encrypt → 申请

**验证 Nginx 配置并重载：**

```bash
nginx -t && nginx -s reload
```

---

## 第九步：验证部署

```bash
# 检查后端健康状态
curl https://yourdomain.com/api/health
# 预期: {"status":"ok"}

# 检查前端
curl -I https://yourdomain.com
# 预期: HTTP/2 200

# 检查 WebSocket 代理
# 在浏览器控制台执行：
# let ws = new WebSocket('wss://yourdomain.com/ws/task/test')
# ws.onopen = () => console.log('WS OK')
```

---

## 第十步：设置开机自启

```bash
# Docker 服务本身已设置开机自启（第二步已完成）
# 额外确认 docker compose 开机启动：
crontab -e
```

添加：
```
@reboot cd /opt/trader && docker compose up -d >> /var/log/trader-startup.log 2>&1
```

---

## 防火墙配置

**宝塔防火墙（放行）：**
- 22（SSH）
- 80（HTTP）
- 443（HTTPS）
- 8888（宝塔面板，可在加固后关闭外网访问）

**不需要对外放行：**
- 3000（frontend，由 Nginx 代理）
- 8000（backend，Docker 内网）
- 6379（Redis，Docker 内网）
- 5432（PostgreSQL，Docker 内网）

---

## 常见问题

### 前端显示"连接失败"

1. 检查 backend 是否正常：`docker compose ps`
2. 检查 Nginx 配置中 `proxy_pass http://127.0.0.1:3000` 是否正确
3. 检查 frontend 容器是否启动：`docker compose logs frontend`

### WebSocket 连接失败

1. 确认 Nginx 配置中有 `map $http_upgrade $connection_upgrade` 和对应 header
2. 确认 `proxy_read_timeout 300s`（默认 60s 会断开 WS）

### Redis 连接失败（Worker 日志报错）

```bash
docker compose logs redis
docker compose restart redis worker
```

### 数据库迁移失败

```bash
# 查看 backend 启动日志
docker compose logs backend | head -50
```

后端首次启动会自动建表，若有报错通常是 `DATABASE_URL` 配置错误。

### LLM 分析超时

检查 `LLM_API_KEY` 是否有效：
```bash
curl https://api.deepseek.com/v1/models \
  -H "Authorization: Bearer $LLM_API_KEY"
```
