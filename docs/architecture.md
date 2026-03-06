# 系统架构

## 整体架构

```
用户浏览器
    │
    ▼
[Vercel — Next.js 14]         前端（静态 + SSR）
    │  /api/* 服务端代理
    ▼
[阿里云香港 ECS — Nginx]
    └── FastAPI (port 8000)    后端 API
            │
            ├── SQLAlchemy 2.0 async
            ├── LLM Service (DeepSeek / OpenAI / Anthropic)
            ├── 市场数据 — DB优先，AKShare降级
            └── Resend 邮件服务
                     │
            PostgreSQL (内部网络)  数据库
                     ▲
            [data-collector 容器]  定时从 AKShare 拉取并写入 market_bars 表
```

本地开发时：Next.js dev server 代理 → FastAPI (localhost:8000) → SQLite。
设置 `ENABLE_COLLECTOR=true` 可在后端进程内启动内嵌采集任务（无需额外容器）。

---

## 技术栈

| 层 | 技术 |
|----|------|
| 前端框架 | Next.js 14 (React 18, TypeScript) |
| 状态管理 | Zustand |
| HTTP 客户端 | Axios |
| 后端框架 | FastAPI + Uvicorn |
| ORM | SQLAlchemy 2.0 (async) |
| 数据库 | PostgreSQL（生产）/ SQLite（开发） |
| 认证 | JWT HS256 + bcrypt，7 天有效期 |
| 限流 | slowapi (per-IP) |
| 市场数据 | AKShare（降级数据源）+ PostgreSQL market_bars 缓存（主路径） |
| 数据采集 | data-collector 容器，定时增量拉取，并发 Semaphore(2) 限速 |
| 技术指标 | MA10/30/60, RSI(14), MACD, ATR(14) |
| LLM | DeepSeek / OpenAI / Anthropic（OpenAI SDK 兼容，运行时可切换） |
| 邮件 | Resend（注册验证邮件） |
| 容器化 | Docker Compose |
| 反向代理 | Nginx（宝塔）或 Cloudflare（推荐） |

---

## API 端点一览

### 认证

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/register` | 注册（邮箱+密码），配置 Resend 后发送验证邮件 |
| POST | `/api/auth/login` | 登录，返回 JWT；邮箱未验证返回 403 |
| GET | `/api/auth/me` | 获取当前用户信息（需 Bearer Token） |
| GET | `/api/auth/verify-email?token=` | 通过邮件链接验证邮箱 |
| POST | `/api/auth/resend-verification` | 重新发送验证邮件 |

### 分析

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/analyze` | 单标的 LLM 分析，支持持仓参数 |
| POST | `/api/analyze/batch` | 连续多标的分析，最多 5 个（Premium 专属），按标的逐个消耗配额 |
| GET | `/api/analyze/limits` | 当日剩余次数（需登录） |
| GET | `/api/analyze/history` | 历史分析记录，支持 `?device_id=` 匿名查询 |
| GET | `/api/market/{market}/{symbol}` | 原始行情数据（不含 LLM，最近 100 条） |

### 订阅

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/subscription?device_id=` | 设备订阅状态及剩余次数 |
| GET | `/api/subscription/status` | 当前登录用户订阅状态 |
| POST | `/api/subscription/upgrade` | 升级订阅等级（登录用户） |
| POST | `/api/subscription/activate` | 输入爱发电订单号激活设备订阅（限 5 次/分钟） |
| POST | `/api/webhook/afdian?token=` | 爱发电支付 Webhook 回调 |

### 其他公开端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/usage?device_id=` | 设备用量查询 |
| GET | `/api/health` | 健康检查 |
| GET | `/api/config` | 前端公共配置（应用名称等） |
| GET | `/api/pricing` | 订阅定价信息（管理员可在线修改） |

### 管理（`X-Admin-Token` 鉴权）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/admin/subscription` | 手动设置设备订阅等级 |
| GET | `/api/admin/stats` | 今日统计（活跃设备、请求数、等级分布） |
| GET | `/api/admin/users` | 列出用户（支持搜索、等级过滤、分页） |
| PUT | `/api/admin/users/{user_id}` | 修改用户等级 / 活跃状态 / 重置用量 |
| DELETE | `/api/admin/users/{user_id}` | 删除用户 |
| GET | `/api/admin/devices` | 列出设备订阅（支持搜索、分页） |
| DELETE | `/api/admin/devices/{device_id}` | 删除设备记录 |
| GET | `/api/admin/settings` | 查看所有运行时配置（敏感字段脱敏） |
| PUT | `/api/admin/settings` | 在线更新配置（quota/llm/pricing/afdian/email/app） |
| GET | `/api/admin/market-data/status` | 查看各标的数据库覆盖情况（bar数、最新日期） |
| POST | `/api/admin/market-data/refresh` | 立即触发数据采集（后台异步，可指定标的子集） |
| GET | `/api/admin/watchlist` | 查看数据采集 watchlist |
| PUT | `/api/admin/watchlist` | 更新 watchlist（全量替换） |

---

## 订阅等级与限额

> 限额可通过 `/api/admin/settings` 在线修改，无需重启服务。

| 等级 | 每日次数（未登录设备） | 每日次数（已登录用户） | 可用市场 | 批量分析 | 持仓参数 |
|------|-----------------------|-----------------------|---------|---------|---------|
| free | 1 | 3 | A股 | ✗ | ✗ |
| basic | 5 | 5 | A股/港股/美股/期货 | ✗ | ✗ |
| premium | 15 | 15 | A股/港股/美股/期货 | ✓（≤5个） | ✓ |

设备订阅通过爱发电激活，有效期 30 天，可续期叠加（同套餐续费在当前到期日基础上再加 30 天）。

---

## 数据库模型

```
users
  id, email (unique), username, hashed_password
  subscription_tier (free|basic|premium)
  is_active, daily_usage, last_usage_date
  api_key
  email_verified, email_verification_token, email_verification_expires
  created_at, updated_at

device_subscriptions
  id, device_id (unique), subscription_tier
  expires_at (NULL = free tier; 付费激活后设置)
  created_at, updated_at

usage_logs
  id, device_id, date, count, subscription
  (device_id + date) unique

ip_usage_logs
  id, ip_address, date, count
  (ip_address + date) unique
  （防止通过清除 localStorage 重置设备配额）

analysis_histories
  id, user_id, device_id, symbol, market, period
  result (JSON text), analysis_date, analyzed_at, created_at

analysis_requests
  id, user_id, symbol, market, period, result
  status (pending|completed|failed), error_message
  created_at, completed_at

subscriptions
  id, user_id, tier, afdian_subscription_id
  start_date, end_date, is_active, created_at

afdian_orders
  id, out_trade_no (unique), device_id, plan_id
  tier, total_amount, created_at
  （防止同一订单号重复激活）

system_settings
  key (primary key), value (JSON), updated_at
  （运行时可配置：quota/llm/pricing/afdian/email/app/watchlist）

market_bars                              ← 数据管道缓存层
  id, symbol, market, period
  datetime (nanosecond int64 timestamp)
  open, high, low, close, volume
  fetched_at
  UNIQUE (symbol, market, period, datetime)
```

---

## 前端路由

| 路径 | 说明 |
|------|------|
| `/` | 主分析页面（输入标的、显示结果、历史记录） |
| `/login` | 登录 |
| `/register` | 注册 |
| `/verify-email` | 邮箱验证跳转页 |
| `/account` | 账户信息 |
| `/upgrade` | 订阅升级（爱发电付款 + 订单号激活） |
| `/admin` | 管理后台（数据看板 / 用户管理 / 设备管理） |
| `/terms` | 服务条款 |
| `/privacy` | 隐私政策 |

---

## 数据流

```
用户提交分析请求
    │
    ├─ 检查用户/设备订阅等级（已登录用 user.subscription_tier，匿名用 device_subscriptions）
    ├─ 检查当日用量是否超限（user.daily_usage 或 usage_logs.count）
    ├─ 校验标的代码格式（A股6位数字 / 港股4-5位 / 美股1-5字母 / 期货1-3字母）
    ├─ 查询 market_bars 表（DB优先）
    │     ├─ 命中 → 直接返回DB数据（毫秒级）；若陈旧则触发后台刷新
    │     └─ 未命中 → 加 per-symbol Lock + Semaphore(3) 保护，调 AKShare，写回DB
    ├─ 计算技术指标（MA10/30/60, RSI, MACD, ATR）
    ├─ 构建 LLM Prompt（含持仓参数）
    ├─ 调用 LLM API（DeepSeek/OpenAI/Anthropic，运行时配置）
    ├─ 解析 JSON 响应，标准化为统一格式（action/signal/confidence/...）
    ├─ 生成持仓建议（position_advice）
    ├─ 写入 analysis_histories
    └─ 返回结果给前端（含 indicators、usage、history.id）

后台数据管道（data-collector 容器）
    ├─ 启动时读取 system_settings.watchlist
    ├─ 每 COLLECTOR_SCHEDULE_HOURS 小时执行一次采集循环
    ├─ 每个标的：查最新 bar_ts → 增量拉取（从下一天到今） → 写入 market_bars
    ├─ 请求间 sleep COLLECTOR_REQUEST_SLEEP 秒，最多 2 个并发外部请求
    └─ Admin 可通过 POST /api/admin/market-data/refresh 触发立即采集
```

---

## 期货量化回测模块

`src/backtest/` 目录提供独立的期货量化回测引擎，与 Web API 独立运行。

```bash
# LLM 直驱回测（默认）
python src/backtest/llm_decision_backtest.py --start 2024-09-01 --end 2024-10-31

# 纯量化（无 LLM）
python src/backtest/llm_decision_backtest.py --mode quant_only --start 2024-09-01 --end 2024-09-30

# 只看最新 K 线
python src/backtest/llm_decision_backtest.py --latest --show_rationale
```

引擎类型：

| 引擎 | 说明 |
|------|------|
| `quant_only` | MA10/MA30 金死叉 + RSI 过滤 |
| `llm_direct` | LLM 直接决策（含缓存） |
