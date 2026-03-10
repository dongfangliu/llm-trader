# Trader 后端重构设计文档
**日期**: 2026-03-10
**策略**: 异步优先（方案B）
**范围**: 13项 code review 问题 + 新增 admin quota 接口

---

## 1. 异步任务系统（arq + Redis）

### 变更
- 新增 Redis 服务（docker-compose）
- 新增 arq worker 服务（docker-compose）
- `POST /api/analyze` 改为立即返回 `{task_id, status: "queued"}`
- 新增 `GET /api/task/{task_id}` 轮询接口
- 新增 WebSocket `GET /ws/task/{task_id}` 推送进度
- 前端 loading 屏改为 WebSocket 接收进度事件

### 任务流
1. 请求进入 → quota 检查 → 立即扣除一次配额 → 写入 arq 队列 → 返回 task_id
2. Worker 捡起任务 → fetch market data → LLM analyze → 写结果到 Redis
3. 前端 WS 收到 `done` 事件 → 展示结果

### 缓存
- Redis key: `cache:{symbol}:{market}:{period}:{position_hash}`
- TTL: 15分钟（日内周期），4小时（日线）
- 命中缓存则跳过 LLM 调用，直接返回；配额仍消耗（已用服务）

---

## 2. 新增 Admin Quota 接口

```
PATCH /api/admin/users/{user_id}/quota
Body: {"daily_usage": int?, "bonus_quota": int?}
```
- 两字段均可选，只更新提供的字段
- `daily_usage` 直接写入 `users.daily_usage`（B方案：原始值）
- `bonus_quota` 直接写入 `users.bonus_quota`

---

## 3. Quota 系统整合

**来源说明（不删表，只统一读写路径）：**
- 已登录用户：`users.daily_usage` + `users.bonus_quota` 为唯一 source of truth
- 游客：`usage_logs.count` per device_id 为 source of truth
- `ip_usage_logs`：降级为只记录不阻断（已登录用户完全不查此表）

**`analysis_requests` 表**：停止新写入（表保留供历史查询），所有新记录只写 `analysis_histories`

---

## 4. Admin 鉴权统一

创建 `verify_admin` FastAPI Dependency，替换所有 admin 端点内联的 token 检查。

---

## 5. SymbolName 预加载 TTL 保护

`preload_names()` 执行前查询 `MAX(updated_at)`，若在 24h 内则跳过整个批量拉取。

---

## 6. Collector 双启动保护

`main.py` lifespan 中的 collector 启动逻辑加环境变量开关 `RUN_COLLECTOR`（默认 false），docker-compose data-collector 服务设置 `RUN_COLLECTOR=true`。

---

## 7. 前端优化

- 删除 `generateShareCardBlob()`（deprecated）
- `archiveBlob` 改为懒生成：用户在 SharePreviewSheet 切换到"专业存证"时才生成
- Loading 屏改为 WebSocket 模式

---

## 8. 不纳入本次范围

- 遗留 `src/` LLM 引擎（独立回测系统，不影响线上）
- `main.py` 文件拆分（风险高，不在问题列表内）
- 设备 ID / IP quota 根本性重设计（保持现状，仅降级 ip_usage_logs）

---

## 基础设施变更

```yaml
# docker-compose.yml 新增
redis:
  image: redis:7-alpine
  volumes: [redis_data:/data]

worker:
  build: ./backend
  command: python -m src.worker.main
  depends_on: [redis, postgres]
  env: 同 backend
```

---

## 测试计划

1. 单元测试：`/api/analyze` 返回 task_id（不阻塞）
2. 集成测试：task 完整流程（queued → processing → done）
3. WebSocket 测试：前端收到进度推送
4. Quota 测试：缓存命中仍扣配额；admin quota 接口直接写值
5. 回归测试：现有 `/api/auth/*`、`/api/admin/*` 正常运行
