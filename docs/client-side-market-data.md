# 客户端主动拉取行情数据

## 背景与动机

akshare 在服务器端拉数据使用固定服务器 IP，容易被新浪/东方财富限流或封 IP，导致行情数据获取失败。将数据拉取移至浏览器端，可利用**用户各自的 IP** 实现天然分布式请求，彻底规避服务器被封 IP 的问题。

## 数据流

```
浏览器 → 东方财富 K 线接口（用户 IP 拉取）
       → POST /api/analyze { ohlcv_bars: [...] }
       → Worker 跳过 akshare，直接用客户端数据计算指标 → LLM → 返回结果
```

降级：若浏览器拉取失败，`ohlcv_bars` 为空，Worker 自动走原有 akshare 路径。

---

## 三层降级架构

```
Tier 1：浏览器 → push2his.eastmoney.com（用户 IP，无服务器压力）
   ↓ 失败（CORS 变更 / 网络 / 超时）
Tier 2：浏览器 → /api/market/proxy/kline → push2his.eastmoney.com（服务器 IP 转发）
   ↓ 失败（服务器 IP 也被封）
Tier 3：ohlcv_bars 为空 → Worker 走原有 akshare 路径（现有行为，DB 缓存优先）
```

---

## 东方财富接口

```
GET https://push2his.eastmoney.com/api/qt/stock/kline/get
  ?fields1=f1,f2,f3,f4,f5,f6
  &fields2=f51,f52,f53,f54,f55,f56
  &klt=101        (101=日 60=60分 30=30分 15=15分 5=5分 1=1分)
  &fqt=1          (前复权)
  &secid={secid}
  &beg={YYYYMMDD}
  &end={YYYYMMDD}
```

**响应头：** `Access-Control-Allow-Origin: *`，浏览器可直接跨域访问。

**K 线字符串格式：** `"日期,开盘,收盘,最高,最低,成交量,..."`
- 字段顺序：`date, open, close, high, low, volume`（注意：第 2 位是 open，第 3 位是 close，第 4 位是 high）

**secid 规则：**

| 市场 | 规则 | 示例 |
|---|---|---|
| A 股（沪）| 首位 `6` → `1.{symbol}` | `1.600519` |
| A 股（深）| 其余数字 → `0.{symbol}` | `0.300750` |
| A 股（北交所）| `4/8` 开头 → `null`（不支持） | — |
| 港股 | 补零至 5 位 → `116.{symbol}` | `116.00700` |
| 美股 | 先试 `105.{symbol}`（NASDAQ），空则试 `106.{symbol}`（NYSE） | `105.AAPL` |
| 期货 | `null`，直接走服务端 akshare | — |

---

## 涉及文件

| 文件 | 作用 |
|---|---|
| `frontend/composables/useMarketDataFetcher.ts` | 三层降级逻辑 + Promise 去重 |
| `frontend/composables/useAnalysis.ts` | POST 前调用 fetchOhlcv，传 ohlcv_bars |
| `backend/src/api/routers/market.py` | `/api/market/proxy/kline` Tier 2 代理端点 |
| `backend/src/api/schemas/analyze.py` | `OhlcvBarInput` 模型 + `AnalyzeRequest.ohlcv_bars` |
| `backend/src/api/routers/analyze.py` | 提取并校验 ohlcv_bars（<20 根置空），传入 submit_analysis |
| `backend/src/services/analysis_service.py` | submit_analysis 增加 ohlcv_bars 参数，传给 arq |
| `backend/src/worker/tasks.py` | Path A（客户端数据）+ Path B（akshare 兜底）+ Redis 计数 |
| `backend/src/api/routers/admin.py` | `/api/admin/datasource-stats` 读 Redis 计数 |
| `frontend/pages/admin/index.vue` | 管理后台数据来源监控卡 |

---

## 常见问题与排查

### 问题 1：Tier 2 代理返回 502

**现象：** `/api/market/proxy/kline` 返回 502，日志显示 `Server disconnected without sending a response`

**原因：** 服务器 IP 被东方财富封锁，这是 Tier 2 的预期失败场景。

**处理：** 正常降级到 Tier 3（akshare），不需要修复。若 akshare 也失败，检查 akshare 数据源配置。

---

### 问题 2：Tier 2 代理返回 404

**原因：** `/proxy/kline` 路由被 `/{market}/{symbol}` 动态路由拦截。

**根因：** FastAPI 按注册顺序匹配路由，动态路由在前会优先匹配。

**修复：** 确保 `market.py` 中 `/proxy/kline` 路由定义在 `/{market}/{symbol}` **之前**：

```python
# market.py — 顺序必须正确
@router.get("/proxy/kline")   # ← 先定义具体路由
async def proxy_kline(...):
    ...

@router.get("/{market}/{symbol}")  # ← 再定义动态路由
async def get_market_data(...):
    ...
```

---

### 问题 3：Tier 1 浏览器直连失败（ERR_EMPTY_RESPONSE）

**现象：** 浏览器控制台出现 `Failed to load resource: net::ERR_EMPTY_RESPONSE`

**原因 A（正常）：** Playwright / headless 浏览器被东财屏蔽，真实用户浏览器不受影响。

**原因 B（需关注）：** 东财更改了 CORS 策略，不再返回 `Access-Control-Allow-Origin: *`。

**排查：** 在真实浏览器 DevTools Console 执行：
```js
fetch("https://push2his.eastmoney.com/api/qt/stock/kline/get?fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56&klt=101&fqt=1&secid=1.600519&beg=20240101&end=20261231")
  .then(r => r.json()).then(d => console.log(d.data.klines.length, d.data.klines[0]))
```
若出现 CORS 错误则东财改策略了，需更新 Tier 1 逻辑（如加请求头或换接口）。

---

### 问题 4：客户端数据不足 20 根

**现象：** Worker 日志 `[客户端数据] 清洗后仅剩 X 根，不足20根，降级 akshare`

**原因：** 新上市股票、停牌股票、或历史区间太短。

**处理：** 自动降级 akshare，无需干预。若需更多数据可增大 `historyDays` 参数。

---

### 问题 5：Admin 页面看不到数据来源监控卡

**检查：**
1. `GET /api/admin/datasource-stats` 是否返回 200（需要 Admin Token）
2. Redis 计数器是否有值：`docker compose exec redis redis-cli keys "stats:datasource:*"`
3. 分析任务是否真正跑完（Worker 日志确认）

---

## 监控

Admin 后台（`/admin`）登录后可看到「行情数据来源（近7天）」卡片：

- **绿色（客户端）**：Tier 1 或 Tier 2 成功，使用了用户/服务器发起的请求
- **橙色（akshare）**：Tier 3 兜底

Redis 计数键格式：
```
stats:datasource:client:{YYYY-MM-DD}    # 整数，Tier1/Tier2 成功次数
stats:datasource:akshare:{YYYY-MM-DD}   # 整数，Tier3 次数
```
TTL：7 天自动过期。

手动查看：
```bash
docker compose exec redis redis-cli keys "stats:datasource:*"
docker compose exec redis redis-cli get "stats:datasource:akshare:2026-03-21"
```

---

## 安全设计

Tier 2 代理端点对输入做了严格白名单校验，防止被当作开放代理滥用：

```python
_SECID_RE = re.compile(r"^\d{1,3}\.\w{1,10}$")   # secid 格式：数字.字母数字
_VALID_KLT = {1, 5, 15, 30, 60, 101, 102, 103}    # klt 枚举白名单
_DATE_RE   = re.compile(r"^\d{8}$")               # 日期：纯8位数字
```

非法参数返回 400，不会透传到东财接口。

---

## 扩展：新增市场支持

如需新增北交所（目前返回 null）：

1. 在 `useMarketDataFetcher.ts` 的 `buildSecid()` 中添加规则
2. 验证东财 secid 格式（北交所代码在东财的市场编码）
3. 测试 Tier 1 直连是否有数据返回
