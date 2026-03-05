# 爱发电订阅接入指南

本项目支持两种爱发电集成方式，**推荐 API 主动验证模式**（不需要公网域名/HTTPS）。

订阅有效期：**30 天**，激活后记录在 `device_subscriptions.expires_at`。续期时若当前订阅未过期，则在原到期日基础上再加 30 天（叠加）。每个订单号只能激活一次，记录在 `afdian_orders` 表中防止重复激活。

---

## 准备工作：在爱发电后台获取凭证

登录 [afdian.net/dashboard/dev](https://afdian.net/dashboard/dev)，找到并复制：

| 字段 | 说明 |
|------|------|
| `user_id` | 你的创作者 ID（不变） |
| `API Token` | 用于签名，**不是** Webhook Token，点击生成 |

然后在「月度计划」页面创建两个套餐（**标准版 ¥19.9/月** 和 **专业版 ¥49/月**），从套餐 URL 中拿到 `plan_id`：

```
https://afdian.com/order/create?plan_id=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
                                         ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                                         这个就是 plan_id
```

---

## 方式一：API 主动验证（推荐，不需要域名）

**原理**：用户付款后在升级页输入订单号，后端直接调用爱发电 API 验证真实性，无需服务器被公网回调。

### 配置

**后端 `backend/.env`：**

```env
# 爱发电 Open API
AFDIAN_USER_ID=你的user_id
AFDIAN_API_TOKEN=你的API_Token（不是Webhook_Token）
AFDIAN_BASIC_PLAN_ID=标准版plan_id
AFDIAN_PREMIUM_PLAN_ID=专业版plan_id
AFDIAN_BASIC_LINK=https://afdian.com/order/create?plan_id=标准版plan_id
AFDIAN_PREMIUM_LINK=https://afdian.com/order/create?plan_id=专业版plan_id
```

**前端 `frontend/.env.local`（或 Vercel 环境变量）：**

```env
NEXT_PUBLIC_AFDIAN_BASIC_LINK=https://afdian.com/order/create?plan_id=标准版plan_id
NEXT_PUBLIC_AFDIAN_PREMIUM_LINK=https://afdian.com/order/create?plan_id=专业版plan_id
```

### 用户付款流程

1. 用户在 `/upgrade` 页面点击「前往爱发电订阅」
2. 在爱发电完成付款（留言框**不需要**填写任何内容）
3. 回到 `/upgrade` 页面，找到"已付款？输入订单号激活"卡片
4. 从爱发电「我的订单」页面复制订单号（形如 `202506231234567890123456789`）
5. 粘贴后点击「验证并激活订阅」
6. 后端调用爱发电 API 验证，成功后自动激活（30 天有效期），跳转主页

### 签名算法说明

后端按爱发电规范计算签名：

```python
sign = md5(f"{token}params{params}ts{ts}user_id{user_id}")
```

### 测试激活端点（本地）

```bash
# 确保后端已运行，且 AFDIAN_USER_ID + AFDIAN_API_TOKEN 已配置
curl -X POST http://localhost:8000/api/subscription/activate \
  -H "Content-Type: application/json" \
  -d '{"out_trade_no":"真实订单号","device_id":"test-device-001"}'

# 查看激活结果（tier + expires_at）
curl "http://localhost:8000/api/subscription?device_id=test-device-001"
```

---

## 方式二：Webhook（需要公网 HTTPS 域名）

如果你已配置了域名 + HTTPS，可以启用 Webhook，用户付款后自动触发，无需用户输入订单号。

### 配置

1. 爱发电后台 → **开发者设置** → Webhook URL：
   ```
   https://your-api-domain.com/api/webhook/afdian?token=你生成的webhook_token
   ```
   Token 生成：`python -c "import secrets; print(secrets.token_hex(24))"`

2. 后端 `.env`：
   ```env
   AFDIAN_WEBHOOK_TOKEN=你生成的webhook_token
   AFDIAN_BASIC_PLAN_ID=基础版plan_id
   AFDIAN_PREMIUM_PLAN_ID=高级版plan_id
   ```

3. 用户付款时，**留言框填写 `device_id`**（升级页底部会显示用户的 device_id），系统自动根据留言激活对应设备（30 天有效期）。

### 本地测试 Webhook

```bash
curl -X POST "http://localhost:8000/api/webhook/afdian?token=你的AFDIAN_WEBHOOK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "type": "order",
      "order": {
        "status": 2,
        "plan_id": "你的AFDIAN_PREMIUM_PLAN_ID",
        "total_amount": "49.00",
        "remark": "test-device-001",
        "out_trade_no": "TEST_ORDER_001"
      }
    }
  }'
```

---

## 两种方式对比

| | API 主动验证（推荐） | Webhook |
|-|---------------------|---------|
| 需要公网 HTTPS | ❌ 不需要 | ✅ 需要 |
| 激活触发 | 用户主动输入订单号 | 付款后自动推送 |
| 用户操作 | 复制粘贴订单号 | 付款时在留言填 device_id |
| 防重复激活 | ✅ `afdian_orders` 表唯一性检查 | 建议做幂等处理 |
| 续期叠加 | ✅ 自动叠加 30 天 | ✅ 自动叠加 30 天 |
| 配置复杂度 | 低 | 中 |
| 两种可以同时开启 | ✅ 互不冲突 | ✅ |

---

## 通过管理后台在线更新爱发电配置

无需重启后端即可更新爱发电配置：

```bash
curl -X PUT http://localhost:8000/api/admin/settings \
  -H "Content-Type: application/json" \
  -H "X-Admin-Token: <ADMIN_TOKEN>" \
  -d '{
    "afdian": {
      "user_id": "xxx",
      "api_token": "xxx",
      "basic_plan_id": "xxx",
      "premium_plan_id": "xxx",
      "basic_link": "https://afdian.com/order/create?plan_id=xxx",
      "premium_link": "https://afdian.com/order/create?plan_id=xxx"
    }
  }'
```
