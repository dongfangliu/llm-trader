# 本地开发调试指南

## 前置条件

- Python 3.11+
- Node.js 18+
- Git

---

## 1. 克隆与安装依赖

```bash
git clone <repo-url>
cd trader

# 后端依赖
pip install -r requirements.txt

# 前端依赖
cd frontend && npm install && cd ..
```

---

## 2. 配置后端环境变量

复制示例文件并编辑：

```bash
cp backend/.env.example backend/.env
```

`backend/.env` 最小配置（本地开发）：

```env
# 使用 SQLite，无需 PostgreSQL
DATABASE_URL=sqlite+aiosqlite:///./data/trader.db

# 生成随机密钥（必须改，否则启动报错）
SECRET_KEY=<运行下面命令生成>
# python -c "import secrets; print(secrets.token_hex(32))"

# 管理员 Token（用于 /api/admin/* 端点）
ADMIN_TOKEN=<运行下面命令生成>
# python -c "import secrets; print(secrets.token_hex(24))"

# LLM（必须，分析功能依赖）
LLM_PROVIDER=openai
LLM_API_KEY=sk-your-deepseek-or-openai-key
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_MODEL=deepseek-chat

# CORS
ALLOWED_ORIGINS=*

# 邮件验证（可选，留空则注册时自动通过验证、无需收邮件）
# RESEND_API_KEY=re_xxxxxxxxxxxxxxxx
# EMAIL_FROM=财财技术洞见 <noreply@yourdomain.com>
# APP_BASE_URL=http://localhost:3000

# 爱发电（可选，接入订阅付款时填写）
# AFDIAN_USER_ID=
# AFDIAN_API_TOKEN=
# AFDIAN_BASIC_PLAN_ID=
# AFDIAN_PREMIUM_PLAN_ID=
# AFDIAN_BASIC_LINK=
# AFDIAN_PREMIUM_LINK=
```

---

## 3. 启动后端

```bash
cd backend
set PYTHONPATH=src          # Windows CMD
$env:PYTHONPATH="src"       # Windows PowerShell
# export PYTHONPATH=src     # Linux/Mac

python -m uvicorn src.api.main:app --reload --port 8000
```

后端运行后可访问：
- API 文档：http://localhost:8000/docs
- 健康检查：http://localhost:8000/api/health

---

## 4. 配置前端环境变量

复制并编辑：

```bash
cp frontend/.env.example frontend/.env.local
```

`frontend/.env.local`：

```env
# 本地后端地址（Next.js rewrites 会将 /api/* 代理到此地址）
BACKEND_URL=http://localhost:8000

# 爱发电订阅链接（本地测试可保持默认）
NEXT_PUBLIC_AFDIAN_BASIC_LINK=https://afdian.com/order/create?plan_id=xxx
NEXT_PUBLIC_AFDIAN_PREMIUM_LINK=https://afdian.com/order/create?plan_id=xxx
```

---

## 5. 启动前端

```bash
cd frontend
npm run dev
```

前端运行在 http://localhost:3000，`/api/*` 请求自动代理到 `http://localhost:8000`。

---

## 邮箱验证说明

本地开发时有两种模式：

**未配置 Resend（推荐本地）：** 注册后自动验证，可直接登录，无需收邮件。

**配置了 Resend：** 注册后需点击邮件中的链接验证。若邮件未收到，可调用重发接口：

```bash
curl -X POST http://localhost:8000/api/auth/resend-verification \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com"}'
```

也可直接在数据库中将 `email_verified` 设为 `1`：

```bash
cd backend
python -c "
import sqlite3
conn = sqlite3.connect('data/trader.db')
conn.execute(\"UPDATE users SET email_verified=1 WHERE email='test@example.com'\")
conn.commit()
conn.close()
print('Done')
"
```

---

## 调试用户权限

本地开发时无需支付即可模拟任意用户等级，方法如下。

### 方法一：通过 Admin API 设置设备订阅等级

适合调试**未登录设备**（匿名用户）的权限。

```bash
# 将 device_id 为 "test-device-001" 的设备升级为 premium
curl -X POST http://localhost:8000/api/admin/subscription \
  -H "Content-Type: application/json" \
  -H "X-Admin-Token: <你的 ADMIN_TOKEN>" \
  -d '{"device_id": "test-device-001", "tier": "premium"}'

# 验证
curl "http://localhost:8000/api/subscription?device_id=test-device-001"
```

等级可选值：`free` / `basic` / `premium`

### 方法二：注册用户并直接修改数据库（SQLite）

适合调试**已登录用户**的权限。

**步骤 1：注册用户**

```bash
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "password123"}'
```

**步骤 2：用 DB 工具修改用户等级**

SQLite 文件位于 `backend/data/trader.db`，推荐用 [DB Browser for SQLite](https://sqlitebrowser.org/) 或命令行：

```bash
# Windows PowerShell
cd backend
python -c "
import sqlite3
conn = sqlite3.connect('data/trader.db')
conn.execute(\"UPDATE users SET subscription_tier='premium' WHERE email='test@example.com'\")
conn.commit()
conn.close()
print('Done')
"
```

**步骤 3：登录并验证**

```bash
# 登录获取 Token
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "password123"}'

# 用返回的 access_token 查询当前用户信息
curl http://localhost:8000/api/auth/me \
  -H "Authorization: Bearer <access_token>"

# 查询订阅状态
curl http://localhost:8000/api/subscription/status \
  -H "Authorization: Bearer <access_token>"
```

### 方法三：通过 Admin API 修改用户等级

```bash
# 先获取用户 ID（查用户列表）
curl "http://localhost:8000/api/admin/users?search=test@example.com" \
  -H "X-Admin-Token: <ADMIN_TOKEN>"

# 修改用户等级
curl -X PUT http://localhost:8000/api/admin/users/<user_id> \
  -H "Content-Type: application/json" \
  -H "X-Admin-Token: <ADMIN_TOKEN>" \
  -d '{"subscription_tier": "premium"}'
```

### 前端验证权限效果

浏览器打开 http://localhost:3000，在 URL 加 `?device_id=test-device-001` 可以指定设备 ID，或登录已设好等级的账户，查看界面上的功能限制是否正确变化（剩余次数、多标的查询入口等）。

---

## 常见问题

**`SECRET_KEY is still the default value` 启动报错**

必须在 `.env` 中设置真实的 `SECRET_KEY`，用 `python -c "import secrets; print(secrets.token_hex(32))"` 生成。

**前端 `/api/*` 报 `ECONNREFUSED`**

确保后端已在 `localhost:8000` 运行，且 `frontend/.env.local` 中 `BACKEND_URL=http://localhost:8000`。

**LLM 分析报错 `AI 分析服务暂未配置`**

在 `backend/.env` 中填入真实的 `LLM_API_KEY`。

**登录报错 `邮箱尚未验证`**

本地未配置 Resend 时不会出现此问题（注册自动验证）。若配置了 Resend，用数据库直接将 `email_verified` 改为 `1`（见上方"邮箱验证说明"）。

**数据库文件不存在**

后端首次启动时会自动在 `backend/data/trader.db` 创建 SQLite 数据库，确保 `backend/data/` 目录存在：

```bash
mkdir backend\data    # Windows
```
