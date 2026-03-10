# 管理后台说明

所有 Admin API 请求需在 Header 中携带管理员 Token：

```
x-admin-token: 你的ADMIN_TOKEN
```

`ADMIN_TOKEN` 在 `backend/.env` 中配置。

---

## 用户管理

### 查看用户列表

```
GET /api/admin/users
```

| 参数 | 说明 |
|------|------|
| `page` | 页码，默认 1 |
| `page_size` | 每页数量，默认 20 |
| `search` | 邮箱搜索 |

### 修改用户套餐/状态

```
PATCH /api/admin/users/{user_id}
```

```json
{
  "subscription_tier": "free | basic | premium",
  "is_active": true,
  "reset_usage": false
}
```

### 设置用户配额（直接写入）

```
PATCH /api/admin/users/{user_id}/quota
```

```json
{
  "daily_usage": 0,
  "bonus_quota": 50
}
```

| 字段 | 说明 |
|------|------|
| `daily_usage` | 今日已使用次数（0 = 完全重置，写 N = 视为今天已用 N 次） |
| `bonus_quota` | 永久额外配额池（不受每日限制，用完为止） |

两字段均可选，只填一个则只更新该字段。

**配额计算规则：**
- 每日可用 = 套餐每日限额（free=3, basic=5, premium=15）- `daily_usage`
- `daily_usage` 超过套餐限额后，从 `bonus_quota` 中消耗
- `bonus_quota` 跨天不重置

---

## 设备订阅管理

### 查看设备列表

```
GET /api/admin/devices?search=xxx&tier=premium&page=1
```

### 设置设备订阅

```
POST /api/admin/subscription
```

```json
{
  "device_id": "设备ID",
  "tier": "free | basic | premium"
}
```

---

## 系统配置

### 查看当前配置

```
GET /api/admin/settings
```

### 更新配置

```
POST /api/admin/settings
```

```json
{
  "llm": {
    "provider": "openai",
    "api_key": "sk-xxxx",
    "base_url": "https://api.deepseek.com/v1",
    "model": "deepseek-chat",
    "max_tokens": 1500,
    "temperature": 0.7
  },
  "pricing": {
    "guest_daily": 1,
    "free_daily": 3,
    "basic": { "price": "19.9", "daily": 5 },
    "premium": { "price": "49", "daily": 15 },
    "features": []
  }
}
```

---

## 数据统计

### 仪表盘

```
GET /api/admin/dashboard
```

返回：总用户数、今日活跃、今日分析次数、各套餐用户数分布。

---

## 市场数据

### 查看采集状态

```
GET /api/admin/market-data/status
```

### 手动触发采集

```
POST /api/admin/market-data/refresh
```

### 管理监控列表

```
GET  /api/admin/watchlist           # 查看
POST /api/admin/watchlist           # 更新
```

```json
{
  "symbols": [
    {"symbol": "600519", "market": "a"},
    {"symbol": "00700", "market": "hk"},
    {"symbol": "AAPL", "market": "us"}
  ]
}
```

---

## 套餐配额对照

| 套餐 | 每日次数 | 市场权限 | 持仓分析 |
|------|---------|---------|---------|
| 游客（未登录）| 1 次 | 仅 A 股 | 不支持 |
| 免费（已登录）| 3 次 | 仅 A 股 | 不支持 |
| 标准 (basic) | 5 次 | A股+港股+美股+期货 | 每日 1 次 |
| 专业 (premium)| 15 次 | 全市场 | 无限制 |
