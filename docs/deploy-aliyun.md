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

> **两种公网接入方式，二选一：**
> - **推荐（一键）：Cloudflare Tunnel** —— 见 **第七步**。无需公网 IP / 不开 80-443 / 不管证书，宝塔 + Nginx（第三、八步）可整段跳过。架构为 `浏览器 → Cloudflare → cloudflared 容器 → frontend:3000`。
> - **传统：公网 IP + 宝塔 Nginx**（上图）—— 见第七步 B / 第八步。

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

## （可选）第三步：安装宝塔面板

> 仅「传统：公网 IP + Nginx」方案需要宝塔来配反代/证书。若采用 **Cloudflare Tunnel（推荐）**，可跳过本步，直接到第四步。

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
cp .env.example .env
vim .env
```

**必填配置（只需改这四项）：**

```env
# 安全密钥（运行下方命令生成）
SECRET_KEY=在这里填入生成的密钥
ADMIN_TOKEN=在这里填入管理员token

# LLM API 密钥（DeepSeek / OpenAI 兼容）
LLM_API_KEY=sk-xxxx

# 数据库密码
POSTGRES_PASSWORD=请改为强密码
```

**生成密钥（在服务器执行）：**

```bash
python3 -c "import secrets; print(secrets.token_hex(32))"  # SECRET_KEY
python3 -c "import secrets; print(secrets.token_hex(24))"  # ADMIN_TOKEN
```

**其他按需修改（有合理默认值）：**

```env
# 跨域（填你的域名，无末尾斜杠）
ALLOWED_ORIGINS=https://yourdomain.com

# 前端应用地址（用于邮件验证链接）
APP_BASE_URL=https://yourdomain.com

# 邮件发送（可选，留空则验证链接打印到日志）
RESEND_API_KEY=re_xxxx
EMAIL_FROM=noreply@yourdomain.com

# 爱发电 API 凭证（可选，套餐 ID/链接在 initial_settings.json 配置）
AFDIAN_USER_ID=
AFDIAN_API_TOKEN=
```

> **关于 LLM provider/model、爱发电套餐 ID、定价等：**
> 这些在 `backend/initial_settings.json` 中配置，首次启动时自动写入数据库。
> 之后可通过管理后台（`/api/admin/settings`）修改，无需重启服务。

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

## 第七步：公网接入 —— 推荐 Cloudflare Tunnel（一键）

> **TL;DR：** 用 `./deploy.sh` 即可一键完成「装依赖 → 起服务 → 公网 HTTPS」。本步只需在 Cloudflare 后台点两下拿一个 token，剩下的脚本全包。
>
> Cloudflare Tunnel 让服务器上的 `cloudflared` 容器**主动向外拨号**到 Cloudflare 边缘，因此：
> - **无需公网 IP、无需开放 80/443**（连入站防火墙都不用动，仅留 22/SSH）
> - **无需申请/续期 TLS 证书**（TLS 在 Cloudflare 边缘终结）
> - **DNS 由 Cloudflare 自动创建**（添加 Public Hostname 时自动建 CNAME）
>
> 架构变为：`用户浏览器 (HTTPS) → Cloudflare 边缘 → cloudflared(容器) → frontend:3000`，下面的「第八步 宝塔 Nginx」可整段跳过。

### 1. 在 Cloudflare 后台创建 Tunnel（拿 token）

1. 进入 **Cloudflare Dashboard → Zero Trust → Networks → Tunnels → Create a tunnel**
2. 选择 **Cloudflared** 类型，命名（如 `trader`）→ 创建
3. 在「Install and run a connector」页面，**复制 token**（形如 `eyJhI...` 的一长串，紧跟在 `--token` 后面的部分）

### 2. 添加 Public Hostname（路由到容器）

在该 tunnel 的 **Public Hostnames → Add a public hostname**：

| 字段 | 填写 |
|------|------|
| Subdomain | 留空（用根域）或填子域，如 `app` |
| Domain | 选择你的域名（须已在 Cloudflare 托管） |
| Type | `HTTP` |
| URL | **`frontend:3000`** ← 容器名，**不是** `localhost` |

保存后，Cloudflare 会**自动创建对应的 DNS CNAME 记录**，无需手动加 A 记录。

> WebSocket（结果页实时分析 `/ws`）默认即可工作，无需额外配置。

### 3. 把 token 填入 .env，重新部署

```bash
cd /opt/trader
vim .env
```
```env
CLOUDFLARE_TUNNEL_TOKEN=粘贴你复制的 token
APP_BASE_URL=https://yourdomain.com      # 必须是你的 https 域名
ALLOWED_ORIGINS=https://yourdomain.com
```
```bash
./deploy.sh --configure   # 或首次直接 ./deploy.sh（向导里会问 token）
```

`deploy.sh` 检测到 token 后会自动启动 `cloudflared` 容器，并做**端到端验证**：等隧道注册成功 → `curl https://yourdomain.com/api/health` 返回 `{"status":"ok"}` 即大功告成。若验证失败，脚本会打印精准排查清单（多半是 Public Hostname 的 URL 没填成 `frontend:3000`）。

完成后即可跳到 **第九步：验证部署**。下面的「传统方案」仅在你不想用 Tunnel（如直连服务器公网 IP）时才需要。

---

## （可选/传统方案）第七步 B：配置域名（Cloudflare DNS + 直连）

> 仅当**不使用 Cloudflare Tunnel**、而是用公网 IP + 宝塔 Nginx 直连时才需要本节与第八步。使用 Tunnel 的话整段跳过。

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

> **注意：** SSL 证书需在第八步添加站点之后才能申请，这里先了解两种方式的区别。

**方式 A：Let's Encrypt（宝塔自动续期）—— 在第八步完成后操作**

1. 暂时将 Cloudflare DNS 的 Proxy 改为 **DNS only**（灰云，否则无法验证域名）
2. 第八步添加站点后，进入站点 **设置 → SSL 标签页 → Let's Encrypt 子选项卡** → 勾选域名 → **申请**
3. 申请成功后，将 Cloudflare Proxy 改回 **Proxied**（橙云）

**方式 B：Cloudflare Origin Certificate（推荐，15 年有效期）**

1. Cloudflare → **SSL/TLS → Origin Server → Create Certificate** → 下载 `.pem` 和 `.key`
2. 将文件上传到服务器（如 `/etc/ssl/trader/`）
3. 在第八步 Nginx 配置中将证书路径替换为：
   ```nginx
   ssl_certificate     /etc/ssl/trader/cloudflare-origin.pem;
   ssl_certificate_key /etc/ssl/trader/cloudflare-origin.key;
   ```

### 4. 更新环境变量

```bash
vim /opt/trader/.env
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

## （可选/传统方案）第八步：配置 Nginx 反向代理

> 仅适用于**不使用 Cloudflare Tunnel** 的直连方案。用 Tunnel 时无需宝塔 Nginx，请跳过本步直接到第九步。

### 1. 添加站点

宝塔面板左侧菜单 → **网站** → 右上角 **添加站点**：

- **域名**：填入你的域名（如 `yourdomain.com`）
- **根目录**：保持默认（不会实际使用）
- **PHP 版本**：选 **纯静态** 即可
- 其他保持默认 → **提交**

### 2. 申请 SSL 证书（Let's Encrypt）

> 如果使用 Cloudflare Origin Certificate，跳过此步。

在网站列表中，找到刚添加的域名，点击右侧 **设置** 按钮（v11.x 中显示为每行末尾的操作按钮）→ 在弹出的设置面板中点击 **SSL** 标签页 → 选择 **Let's Encrypt** 子选项卡 → 勾选域名 → 点击 **申请**。

申请成功后证书自动保存到 `/www/server/panel/vhost/cert/yourdomain.com/`。

### 3. 编辑 Nginx 配置文件

在同一设置面板中，切换到 **配置文件** 标签页，将编辑器内的全部内容**替换**为以下配置：

> **v11.x 导航路径：** 网站列表 → 域名右侧 **设置** → 弹出面板顶部标签栏 → **配置文件**

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    # SSL 证书（Let's Encrypt 申请后路径如下；Cloudflare Origin Cert 请替换为对应路径）
    ssl_certificate     /www/server/panel/vhost/cert/yourdomain.com/fullchain.pem;
    ssl_certificate_key /www/server/panel/vhost/cert/yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;

    # 安全头
    add_header X-Frame-Options SAMEORIGIN;
    add_header X-Content-Type-Options nosniff;

    # 所有请求转发给 Next.js（Next.js 内部代理 /api/* 和 /ws/* 到 backend）
    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        # WebSocket 升级头（map 指令不能用于 vhost 文件，直接硬编码 upgrade 即可）
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;   # LLM 分析可能需要较长时间
        proxy_send_timeout 300s;
    }
}
```

### 4. 保存并重载

点击配置文件编辑器右上角的 **保存** 按钮，宝塔面板会自动验证语法并重载 Nginx。

也可在 SSH 终端手动验证：

```bash
nginx -t && nginx -s reload
```

> **如果宝塔安装的是 OpenResty：** 命令换为 `openresty -t && openresty -s reload`，配置语法完全相同。

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

1. 确认 Nginx 配置中 location 块有 `proxy_set_header Upgrade $http_upgrade` 和 `Connection "upgrade"`
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
