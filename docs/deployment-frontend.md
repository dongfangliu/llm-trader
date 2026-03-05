# 前端部署：Vercel

前端（Next.js 14）部署到 Vercel，通过 `BACKEND_URL` 环境变量将 `/api/*` 请求在服务端代理到后端，前端本身不直接暴露后端地址，也不存在 CORS 问题。

---

## 前置条件

- Vercel 账号
- GitHub 仓库已推送
- 后端已部署并可通过公网访问（见 [deployment-backend.md](./deployment-backend.md)）

---

## 部署步骤

### 1. 导入项目

1. 登录 [vercel.com](https://vercel.com)
2. 点击 **Add New → Project**
3. 选择你的 GitHub 仓库
4. **Root Directory** 设置为 `frontend`（重要！）
5. Framework Preset 会自动识别为 **Next.js**

### 2. 配置环境变量

在 Vercel 项目设置 → **Environment Variables** 中添加：

| 变量名 | 值 | 说明 |
|--------|----|------|
| `BACKEND_URL` | `https://your-backend-domain.com` | 后端公网地址，**不带结尾斜杠** |
| `NEXT_PUBLIC_AFDIAN_BASIC_LINK` | `https://afdian.com/order/create?plan_id=xxx` | 基础版订阅链接 |
| `NEXT_PUBLIC_AFDIAN_PREMIUM_LINK` | `https://afdian.com/order/create?plan_id=xxx` | 高级版订阅链接 |

> `BACKEND_URL` 是**服务端运行时变量**（无 `NEXT_PUBLIC_` 前缀），Vercel 的 Next.js 服务端用它做 `/api/*` 代理，浏览器永远看不到后端真实地址。

> `NEXT_PUBLIC_AFDIAN_*_LINK` 仅用于 `/upgrade` 页面的跳转链接，也可以通过后端 `/api/pricing` 动态获取（后台可在线修改，无需重新部署 Vercel）。

### 3. 部署

点击 **Deploy**，等待构建完成（约 2–3 分钟）。

### 4. 验证

```bash
# 健康检查（通过前端代理转发到后端）
curl https://your-app.vercel.app/api/health
# 应返回 {"status":"ok","timestamp":"..."}
```

---

## 自定义域名

1. Vercel 项目 → **Settings → Domains**
2. 添加你的域名（如 `trade.yourdomain.com`）
3. 在域名 DNS 处添加 Vercel 提供的 CNAME 记录
4. Vercel 自动签发 SSL 证书

---

## 后续更新部署

推送代码到 GitHub 主分支后，Vercel 自动触发重新部署（无需手动操作）。

手动重新部署：Vercel 控制台 → Deployments → 点击最新一条 → **Redeploy**。

---

## 注意事项

- **`BACKEND_URL` 必须是 HTTPS**（生产环境），否则 Vercel 的 Next.js 服务端代理请求会报错。
- 后端需在 `ALLOWED_ORIGINS` 中允许 Vercel 的域名，或设置为 `*`（开发期可以，生产建议明确指定）。
- Vercel 免费版 Serverless Function 有 10s 超时限制；LLM 分析可能耗时较长，建议将 LLM 请求控制在 8s 内，或升级 Vercel Pro 计划（60s）。
- 应用名称（`APP_NAME`）可通过后端 `/api/config` 动态获取，**无需**在 Vercel 中设置 `NEXT_PUBLIC_APP_NAME`（但设置了也会优先生效）。
