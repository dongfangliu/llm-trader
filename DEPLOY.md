# 部署指南 — Coolify + 宝塔 Linux（阿里云）

## 架构概览

```
用户浏览器
    │
    └── app.xxx.sslip.io  →  Coolify Traefik  →  frontend:3000 (Next.js)
                                                       │ 内部代理
                                                  backend:8000  (FastAPI)
                                                       │
                                                  postgres:5432 (PostgreSQL)
```

> **无需自有域名**：Coolify 自动分配 `xxx.sslip.io` 域名并签发 SSL 证书  
> **无需配置 CORS**：浏览器只访问 frontend，`/api/*` 请求由 Next.js 服务端代理给 backend（同源）  
> **backend 无需对外暴露**：只在 Docker 内部网络通信

---

## 前置条件

- 阿里云 ECS，Ubuntu 20.04 / 22.04，**至少 2核 4GB 内存**
- 宝塔面板已安装（用于服务器管理、防火墙）
- Docker CE 已安装（宝塔 → 软件商店 → Docker 管理器）

---

## 第一步：安装 Coolify

在服务器上执行（SSH 或宝塔终端）：

```bash
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
```

安装完成后，**在宝塔防火墙放行 8000 端口**（Coolify 管理面板），浏览器访问 `http://服务器IP:8000` 完成初始化。

> ⚠️ Coolify 的 Traefik 会接管 80/443 端口。如果宝塔 Nginx 已占用，在宝塔里**停止 Nginx 服务**。

---

## 第二步：添加服务器

Coolify 面板 → **Servers** → **Add Server** → 选择 **Localhost**

---

## 第三步：创建项目

1. **Projects** → **New Project** → 命名 `trader`
2. **New Resource** → **Docker Compose**
3. 填写代码来源（Git 仓库或本地路径）

---

## 第四步：配置环境变量

在 Coolify 的 **Environment Variables** 页面填写：

| 变量名 | 说明 | 示例值 |
|--------|------|--------|
| `SECRET_KEY` | JWT 签名密钥 | `python -c "import secrets; print(secrets.token_hex(32))"` |
| `ADMIN_TOKEN` | 管理员接口 token | `python -c "import secrets; print(secrets.token_hex(24))"` |
| `POSTGRES_PASSWORD` | 数据库密码 | 自定义强密码 |
| `LLM_API_KEY` | DeepSeek/OpenAI API Key | `sk-xxxx` |
| `LLM_BASE_URL` | API 基础地址 | `https://api.deepseek.com/v1` |
| `LLM_MODEL` | 使用的模型 | `deepseek-chat` |

> ✅ **不需要设置** `NEXT_PUBLIC_API_URL`——前端通过内部代理访问 backend，无需知道 backend 域名。

---

## 第五步：部署

点击 **Deploy**，Coolify 会自动：
1. 构建镜像
2. 启动容器
3. 分配 `sslip.io` 域名并签发 SSL
4. frontend 访问地址会显示在 Coolify 面板里

---

## 本地开发

本地开发时需要同时运行 backend：

```bash
# 终端 1：启动 backend
cd backend && pip install -r requirements.txt
set PYTHONPATH=src && python -m uvicorn src.api.main:app --port 8000 --reload

# 终端 2：启动 frontend（NEXT_PUBLIC_API_URL 留空，由 rewrites 代理到本地 backend）
cd frontend && npm install && npm run dev
```

> 本地 `next.config.js` 的 `BACKEND_URL` 默认是 `http://backend:8000`（容器名），  
> 本地开发没有 Docker，需设置 `BACKEND_URL=http://localhost:8000`：
> ```bash
> # Windows
> set BACKEND_URL=http://localhost:8000 && npm run dev
> # Linux/macOS  
> BACKEND_URL=http://localhost:8000 npm run dev
> ```

---

## 数据备份

```bash
docker exec $(docker ps -qf "name=postgres") pg_dump -U trader trader > backup_$(date +%Y%m%d).sql
```

---

## 更新部署

代码更新后，在 Coolify 面板点击 **Redeploy** 即可。

## 架构概览

```
用户浏览器
    │
    ├── app.yourdomain.com  →  Coolify Traefik  →  frontend:3000  (Next.js)
    └── api.yourdomain.com  →  Coolify Traefik  →  backend:8000   (FastAPI)
                                                        │
                                                  postgres:5432    (PostgreSQL)
```

> 宝塔负责服务器管理（防火墙、文件管理器、系统监控）  
> Coolify 负责应用部署、域名绑定、SSL 证书、容器管理

---

## 前置条件

- 阿里云 ECS，Ubuntu 20.04 / 22.04，**至少 2核 4GB 内存**
- 宝塔面板已安装
- Docker CE 已安装（宝塔 → 软件商店 → Docker 管理器）
- 已有域名，并将以下 DNS A 记录指向服务器 IP：
  - `app.yourdomain.com`
  - `api.yourdomain.com`

---

## 第一步：安装 Coolify

在服务器上执行（SSH 或宝塔终端）：

```bash
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
```

安装完成后，**在宝塔防火墙放行 8000 端口**（Coolify 管理面板默认端口），浏览器访问 `http://服务器IP:8000` 完成初始化。

> ⚠️ 安装完成后，**宝塔的 Nginx 不要再管理 80/443 端口**，交给 Coolify 的 Traefik 处理 SSL。
> 如果宝塔 Nginx 已占用 80/443，在宝塔里停止 Nginx 服务，或修改 Nginx 监听端口。

---

## 第二步：在 Coolify 里添加服务器

1. Coolify 面板 → **Servers** → **Add Server**
2. 选择 **Localhost**（即本机）

---

## 第三步：创建项目并配置代码源

1. **Projects** → **New Project** → 命名为 `trader`
2. **New Resource** → **Docker Compose**
3. 选择代码来源：
   - **Git 仓库**（推荐）：连接 GitHub/Gitee，选择本项目仓库
   - 或 **手动上传**：将本项目目录上传到服务器，填写本地路径

---

## 第四步：配置环境变量（重要）

在 Coolify 的 **Environment Variables** 页面，填写以下变量：

| 变量名 | 说明 | 示例值 |
|--------|------|--------|
| `SECRET_KEY` | JWT 签名密钥 | `python -c "import secrets; print(secrets.token_hex(32))"` 生成 |
| `ADMIN_TOKEN` | 管理员接口 token | `python -c "import secrets; print(secrets.token_hex(24))"` 生成 |
| `POSTGRES_PASSWORD` | 数据库密码 | 强随机密码 |
| `LLM_API_KEY` | DeepSeek/OpenAI API Key | `sk-xxxx` |
| `LLM_BASE_URL` | API 基础地址 | `https://api.deepseek.com/v1` |
| `LLM_MODEL` | 使用的模型 | `deepseek-chat` |
| `NEXT_PUBLIC_API_URL` | **backend 域名**（前端构建时注入） | `https://api.yourdomain.com` |
| `ALLOWED_ORIGINS` | 允许跨域的前端域名 | `https://app.yourdomain.com` |

> ⚠️ `NEXT_PUBLIC_API_URL` 是 **构建时变量**，每次修改后需要重新构建 frontend 镜像才生效。

---

## 第五步：配置域名

在 Coolify 的服务配置里：

- **backend** 服务 → Domains → 填入 `https://api.yourdomain.com`
- **frontend** 服务 → Domains → 填入 `https://app.yourdomain.com`

Coolify 会自动通过 Let's Encrypt 申请 SSL 证书。

---

## 第六步：部署

点击 **Deploy**，Coolify 会：
1. 拉取代码
2. 构建 Docker 镜像（frontend 构建时会注入 `NEXT_PUBLIC_API_URL`）
3. 启动所有容器
4. 配置 Traefik 反向代理和 SSL

---

## 常见问题

### 前端显示 "无法连接到 API"
- 检查 `NEXT_PUBLIC_API_URL` 是否设为 `https://api.yourdomain.com`
- 确认该变量已设置后**重新构建**前端

### CORS 跨域错误
- 确认 `ALLOWED_ORIGINS` 包含前端域名（无末尾斜杠）
- 示例：`https://app.yourdomain.com`

### 宝塔防火墙需要放行的端口
| 端口 | 用途 |
|------|------|
| 80 | HTTP（交给 Coolify Traefik） |
| 443 | HTTPS（交给 Coolify Traefik） |
| 8000 | Coolify 管理面板 |

### 数据备份
数据存储在 Docker volumes 里：
- `postgres_data` — 数据库
- `backend_data` — SQLite（如果未用 PostgreSQL）
- `backend_logs` — 日志

在宝塔终端执行备份：
```bash
docker exec trader-postgres pg_dump -U trader trader > backup_$(date +%Y%m%d).sql
```

---

## 更新部署

代码更新后，在 Coolify 面板点击 **Redeploy** 即可。
