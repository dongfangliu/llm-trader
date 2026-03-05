# 管理员操作指南

管理后台提供两种操作方式：

1. **可视化管理界面**（推荐）：访问 `/admin`，用 Admin Token 登录，可视化管理用户、设备、查看统计和运行时配置
2. **命令行 API / 数据库直连**：适合批量操作或脚本自动化，见下方文档

---

## 可视化管理界面

访问地址：`http://localhost:3000/admin`（本地）或 `https://your-app.vercel.app/admin`（生产）

功能页面：

| 页面 | 功能 |
|------|------|
| 数据看板 | 今日活跃设备、请求总量、分析次数、等级分布图 |
| 用户管理 | 搜索/筛选用户、修改订阅等级、禁用/启用账号、重置今日用量、删除用户 |
| 设备管理 | 搜索/筛选设备、修改设备订阅等级、删除设备记录 |
| 系统设置 | 在线修改配额、LLM 配置、定价、爱发电、邮件等运行时参数（无需重启） |

登录方式：在 `/admin/login` 页面输入 `ADMIN_TOKEN` 环境变量的值。Token 存储在浏览器 localStorage，关闭浏览器后需重新登录。

---

## 查看统计数据

```bash
curl http://localhost:8000/api/admin/stats \
  -H "X-Admin-Token: <ADMIN_TOKEN>"
```

返回示例：

```json
{
  "date": "2025-03-01",
  "active_devices_today": 42,
  "total_requests_today": 156,
  "analysis_last_24h": 89,
  "tier_distribution": {
    "free": 30,
    "basic": 8,
    "premium": 4
  }
}
```

---

## 设备订阅管理

### 设置/升级设备等级

```bash
curl -X POST http://localhost:8000/api/admin/subscription \
  -H "Content-Type: application/json" \
  -H "X-Admin-Token: <ADMIN_TOKEN>" \
  -d '{"device_id": "abc-123", "tier": "premium"}'
```

`tier` 可选值：`free` / `basic` / `premium`

> 注意：此接口不设置 `expires_at`（永久有效），适合手动赠送。爱发电付款激活会自动设置 30 天有效期。

### 查看设备当前等级

```bash
curl "http://localhost:8000/api/subscription?device_id=abc-123"
```

### 删除设备记录

```bash
curl -X DELETE http://localhost:8000/api/admin/devices/abc-123 \
  -H "X-Admin-Token: <ADMIN_TOKEN>"
```

---

## 用户管理 API

### 查询用户列表

```bash
# 全部用户（分页）
curl "http://localhost:8000/api/admin/users?page=1&page_size=20" \
  -H "X-Admin-Token: <ADMIN_TOKEN>"

# 搜索
curl "http://localhost:8000/api/admin/users?search=example.com&tier=premium" \
  -H "X-Admin-Token: <ADMIN_TOKEN>"
```

### 修改用户等级 / 状态 / 用量

```bash
# 修改订阅等级
curl -X PUT http://localhost:8000/api/admin/users/<user_id> \
  -H "Content-Type: application/json" \
  -H "X-Admin-Token: <ADMIN_TOKEN>" \
  -d '{"subscription_tier": "premium"}'

# 禁用用户
curl -X PUT http://localhost:8000/api/admin/users/<user_id> \
  -H "Content-Type: application/json" \
  -H "X-Admin-Token: <ADMIN_TOKEN>" \
  -d '{"is_active": false}'

# 重置今日用量
curl -X PUT http://localhost:8000/api/admin/users/<user_id> \
  -H "Content-Type: application/json" \
  -H "X-Admin-Token: <ADMIN_TOKEN>" \
  -d '{"reset_usage": true}'
```

### 删除用户

```bash
curl -X DELETE http://localhost:8000/api/admin/users/<user_id> \
  -H "X-Admin-Token: <ADMIN_TOKEN>"
```

> ⚠️ 删除用户不级联删除 analysis_histories / subscriptions，建议先确认无重要历史数据。

---

## 运行时系统设置

无需重启即可修改配额、LLM 配置、定价等。

### 查看当前配置

```bash
curl http://localhost:8000/api/admin/settings \
  -H "X-Admin-Token: <ADMIN_TOKEN>"
```

敏感字段（api_key、resend_api_key 等）返回时脱敏为 `"***REDACTED***"`。

### 修改配额

```bash
curl -X PUT http://localhost:8000/api/admin/settings \
  -H "Content-Type: application/json" \
  -H "X-Admin-Token: <ADMIN_TOKEN>" \
  -d '{
    "quota": {
      "guest": {"free": 2, "basic": 10, "premium": 20},
      "user":  {"free": 5, "basic": 10, "premium": 20}
    }
  }'
```

### 在线切换 LLM 模型

```bash
curl -X PUT http://localhost:8000/api/admin/settings \
  -H "Content-Type: application/json" \
  -H "X-Admin-Token: <ADMIN_TOKEN>" \
  -d '{
    "llm": {
      "provider": "openai",
      "model": "gpt-4o",
      "base_url": "https://api.openai.com/v1",
      "api_key": "sk-xxx"
    }
  }'
```

可修改的 section：`quota` / `llm` / `pricing` / `afdian` / `email` / `app`

---

## 数据库直连操作（SQLite 本地 / PostgreSQL 生产）

### 查询所有用户

**SQLite（本地）：**

```bash
cd backend
python -c "
import sqlite3
conn = sqlite3.connect('data/trader.db')
rows = conn.execute('SELECT id, email, username, subscription_tier, daily_usage, is_active FROM users ORDER BY id').fetchall()
for r in rows:
    print(r)
conn.close()
"
```

**PostgreSQL（生产，在服务器容器内执行）：**

```bash
docker exec -it trader_postgres_1 psql -U trader -d trader -c \
  "SELECT id, email, username, subscription_tier, daily_usage, is_active FROM users ORDER BY id;"
```

### 修改用户订阅等级

```bash
# SQLite
python -c "
import sqlite3
conn = sqlite3.connect('data/trader.db')
conn.execute(\"UPDATE users SET subscription_tier='premium' WHERE email='user@example.com'\")
conn.commit()
conn.close()
"

# PostgreSQL
docker exec -it trader_postgres_1 psql -U trader -d trader -c \
  "UPDATE users SET subscription_tier='premium' WHERE email='user@example.com';"
```

### 批量重置所有设备今日用量

```bash
# PostgreSQL
docker exec -it trader_postgres_1 psql -U trader -d trader -c \
  "UPDATE usage_logs SET count=0 WHERE date=CURRENT_DATE;"

# SQLite
python -c "
import sqlite3
from datetime import date
conn = sqlite3.connect('data/trader.db')
conn.execute('UPDATE usage_logs SET count=0 WHERE date=?', (str(date.today()),))
conn.commit()
conn.close()
"
```

### 查找容器名称

```bash
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"
```

找到 `postgres:16-alpine` 对应的容器名，替换上面命令中的 `trader_postgres_1`。
