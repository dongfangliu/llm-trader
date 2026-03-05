# 部署方案：阿里云香港 + Cloudflare 域名 + Vercel 前端

适用场景：面向国内用户，不需要 ICP 备案，后端部署在阿里云香港。

---

## 架构总览

```
用户浏览器
    │
    ├─→ Vercel (前端 Next.js)
    │       your-project.vercel.app
    │       │  服务端代理 /api/*
    │       ↓
    └─→ Cloudflare → 阿里云香港 (后端 FastAPI)
            api.yourdomain.com → Nginx:80 → 127.0.0.1:8000

验证邮件：Resend → 用户邮箱
```

## 费用估算

| 项目 | 费用 |
|------|------|
| 阿里云香港 2核2G | ~¥30/月 |
| Cloudflare 域名 `.com` | ~¥70/年 |
| Vercel 前端 | 免费 |
| Resend 邮件 | 免费（3000封/月） |
| **合计** | **约 ¥40/月** |

---

## 第一步：买域名（Cloudflare）

推荐在 Cloudflare 购买域名，价格透明、无续费溢价，DNS 自带免费 CDN 和 HTTPS。

1. 注册 [cloudflare.com](https://cloudflare.com)
2. **Domain Registration → Register a domain** → 搜索域名 → 购买
3. 购买后域名自动托管在 Cloudflare DNS，无需额外操作

> `.com` 约 $10/年，境外域名**无需 ICP 备案**。

---

## 第二步：买阿里云香港服务器

1. 阿里云控制台 → **云服务器 ECS** → 地域选 **中国香港**
2. 推荐配置：2核2G，Ubuntu 22.04 LTS，按量付费先试用
3. 安全组入站规则开放以下端口：

| 端口 | 用途 |
|------|------|
| 22 | SSH |
| 80 | HTTP（Nginx，Cloudflare 代理用） |
| 443 | HTTPS（可选，Cloudflare 代理模式下非必须） |

4. 记下服务器**公网 IP**

---

## 第三步：配置 DNS

在 Cloudflare DNS 控制台添加一条 A 记录，将 `api` 子域名指向服务器：

| 类型 | 名称 | 内容 | 代理状态 |
|------|------|------|---------|
| A | `api` | 阿里云香港公网 IP | ✅ 开启（橙色云朵）|

开启 Cloudflare 代理后：
- HTTPS 由 Cloudflare 自动处理，**无需在服务器上装 SSL 证书**
- 后端 API 访问地址为 `https://api.yourdomain.com`

---

## 第四步：服务器初始化

SSH 登录服务器：

```bash
ssh root@你的阿里云香港IP
```

安装依赖：

```bash
apt update && apt upgrade -y
apt install python3.11 python3-pip python3-venv nginx git -y
```

---

## 第五步：部署后端

```bash
# 拉取代码
git clone https://github.com/你的仓库地址
cd trader/backend

# 安装依赖
pip install -r requirements.txt

# 创建并填写配置
cp .env.example .env
nano .env
```

`.env` 关键配置：

```env
DATABASE_URL=sqlite+aiosqlite:///./data/trader.db
SECRET_KEY=生成一个随机字符串
ADMIN_TOKEN=生成一个随机字符串

LLM_PROVIDER=openai
LLM_API_KEY=你的API Key
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_MODEL=deepseek-chat

ALLOWED_ORIGINS=https://your-project.vercel.app

# 邮件验证（可选，留空则注册自动通过）
RESEND_API_KEY=re_xxxxxxxxxxxxxxxx
EMAIL_FROM=财财技术洞见 <noreply@yourdomain.com>
APP_BASE_URL=https://your-project.vercel.app

# 爱发电（可选）
AFDIAN_USER_ID=
AFDIAN_API_TOKEN=
AFDIAN_BASIC_PLAN_ID=
AFDIAN_PREMIUM_PLAN_ID=
```

生成随机密钥：

```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

创建数据目录：

```bash
mkdir -p /root/trader/backend/data
```

用 systemd 保持后端持续运行：

```bash
cat > /etc/systemd/system/trader.service << 'EOF'
[Unit]
Description=Trader Backend
After=network.target

[Service]
WorkingDirectory=/root/trader/backend
Environment=PYTHONPATH=src
ExecStart=/usr/bin/python3 -m uvicorn src.api.main:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable trader
systemctl start trader
systemctl status trader
```

---

## 第六步：配置 Nginx 反向代理

```bash
cat > /etc/nginx/sites-available/api << 'EOF'
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
        client_max_body_size 10m;
    }
}
EOF

ln -s /etc/nginx/sites-available/api /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

> Cloudflare 代理已开启时，HTTPS 在 Cloudflare 侧终止，Nginx 只需监听 80 端口，**不需要 certbot 或 SSL 证书**。

---

## 第七步：部署前端到 Vercel

1. 将代码推送到 GitHub
2. 登录 [vercel.com](https://vercel.com) → **New Project** → 选仓库
3. Framework Preset 选 **Next.js**，Root Directory 填 `frontend`
4. 添加环境变量：

| 变量名 | 值 |
|--------|-----|
| `BACKEND_URL` | `https://api.yourdomain.com` |
| `NEXT_PUBLIC_AFDIAN_BASIC_LINK` | `https://afdian.com/order/create?plan_id=xxx` |
| `NEXT_PUBLIC_AFDIAN_PREMIUM_LINK` | `https://afdian.com/order/create?plan_id=xxx` |

5. 点击 **Deploy**，完成后记下 Vercel 分配的域名（如 `your-project.vercel.app`）

---

## 第八步：配置 Resend 发验证邮件（可选）

若希望注册时发送邮箱验证邮件：

1. 注册 [resend.com](https://resend.com)
2. **Domains → Add Domain** → 输入 `yourdomain.com`
3. 将 Resend 提供的 3 条 DNS 记录添加到 Cloudflare（类型为 TXT 和 CNAME）
4. 等几分钟，Resend 后台显示 **Verified ✅**
5. **API Keys → Create API Key** → 复制到 `.env` 的 `RESEND_API_KEY`
6. 同时填写 `EMAIL_FROM` 和 `APP_BASE_URL`
7. 重启后端：`systemctl restart trader`

> 若不配置 Resend，注册时后端会自动跳过邮件验证，用户可直接登录。

---

## 验证部署

```bash
# 后端健康检查
curl https://api.yourdomain.com/api/health

# 查看后端日志
journalctl -u trader -f
```

访问 `https://your-project.vercel.app`，注册账号，验证分析功能是否正常。

---

## 常用运维命令

```bash
# 查看后端状态
systemctl status trader

# 重启后端
systemctl restart trader

# 查看实时日志
journalctl -u trader -f

# 更新代码后重启
cd /root/trader && git pull && systemctl restart trader
```
