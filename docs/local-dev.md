# 本地开发指南（Windows）

## 前置依赖

| 工具 | 版本要求 | 下载 |
|------|---------|------|
| Python | 3.11+ | python.org |
| Node.js | 18+ | nodejs.org |
| Docker Desktop | 最新版 | docker.com（用于运行 Redis） |
| Windows Terminal | 最新版 | Microsoft Store |

## 一键启动

在项目根目录，右键 → "在 Windows Terminal 中打开"，执行：

```powershell
.\start.ps1
```

脚本会自动在 Windows Terminal 中打开 4 个标签页，分别运行：

| 标签 | 服务 | 端口 |
|------|------|------|
| Redis | Redis 容器 | 6379 |
| Backend | FastAPI | 8000 |
| Worker | arq LLM Worker | — |
| Frontend | Next.js | 3000 |

启动完成后访问：**http://localhost:3000**

## 停止服务

```powershell
.\start.ps1 -Stop
```

## 单独启动某个服务（调试用）

```powershell
.\start.ps1 -Service redis
.\start.ps1 -Service backend
.\start.ps1 -Service worker
.\start.ps1 -Service frontend
```

## 首次运行准备

### 1. 安装 Python 依赖

```powershell
cd backend
pip install -r requirements.txt
```

### 2. 安装 Node.js 依赖

```powershell
cd frontend
npm install
```

### 3. 配置后端环境变量

复制模板，按需编辑：

```powershell
copy backend\.env.example backend\.env
```

**必填项：**

```env
# LLM 配置（DeepSeek 或 OpenAI）
LLM_API_KEY=sk-xxxx
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_MODEL=deepseek-chat

# 管理员 token（可随意设置，本地开发用）
ADMIN_TOKEN=local-admin-token

# Redis（本地 Docker 启动的 Redis，默认即可）
REDIS_URL=redis://localhost:6379

# 数据库（SQLite，本地默认，无需修改）
DATABASE_URL=sqlite+aiosqlite:///./data/trader.db
```

**可选项（不填则关闭对应功能）：**

```env
# 邮件验证（Resend.com）
RESEND_API_KEY=re_xxxx
EMAIL_FROM=noreply@yourdomain.com
APP_BASE_URL=http://localhost:3000

# 爱发电付费（不接入则跳过）
AFDIAN_WEBHOOK_TOKEN=
AFDIAN_USER_ID=
AFDIAN_API_TOKEN=
```

### 4. 初始化数据库

后端首次启动时会自动建表，无需手动操作。

## 查看日志

各服务日志直接显示在对应的 Windows Terminal 标签页中：

- **Backend** 标签：API 请求、数据库操作、错误信息
- **Worker** 标签：LLM 分析任务执行过程、缓存命中情况
- **Redis** 标签：连接信息
- **Frontend** 标签：Next.js 编译、HMR 热更新

## 常见问题

### 端口被占用

```powershell
# 查看占用端口的进程
netstat -ano | findstr :8000
netstat -ano | findstr :3000
netstat -ano | findstr :6379

# 按 PID 停止进程
Stop-Process -Id <PID> -Force
```

### Docker 未启动

确保 Docker Desktop 正在运行，任务栏中有 Docker 图标。

### Python 虚拟环境（可选）

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

激活虚拟环境后，`start.ps1 -Service backend/worker` 会使用该环境。

### 分析超时或无结果

1. 检查 **Worker** 标签是否有错误
2. 检查 LLM_API_KEY 是否正确填写
3. 检查 Redis 是否在运行（**Redis** 标签）

### 前端无法连接后端

确认 `backend\.env` 中 `REDIS_URL=redis://localhost:6379`，且 Backend 和 Worker 标签均无报错。
