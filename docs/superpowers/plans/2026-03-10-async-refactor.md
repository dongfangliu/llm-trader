# Trader 后端重构 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复13项 code review 问题，新增 Admin Quota 接口，引入 Redis + arq 全异步 LLM 分析任务系统

**Architecture:** 在现有 FastAPI 单体上叠加 arq worker + Redis；`POST /api/analyze` 立即返回 task_id，worker 跑 LLM，前端通过 WebSocket 接收结果。所有 quota 逻辑维持现有 source of truth，只优化查询路径。

**Tech Stack:** FastAPI, arq, Redis 7, aioredis, WebSocket (FastAPI 内置), Next.js WebSocket client, Docker Compose

---

## 文件变更地图

### 新建文件
- `backend/src/worker/__init__.py`
- `backend/src/worker/redis_client.py` — Redis 连接池（arq + aioredis）
- `backend/src/worker/tasks.py` — arq 任务函数（analyze_task, 含缓存逻辑）
- `backend/src/worker/main.py` — arq WorkerSettings 入口
- `backend/tests/test_quota_admin.py` — quota admin 接口测试
- `backend/tests/test_async_analyze.py` — 异步分析流程测试

### 修改文件
- `backend/requirements.txt` — 添加 arq, redis
- `docker-compose.yml` — 添加 redis + worker 服务
- `backend/src/api/main.py` — 新增 task/ws 端点；`/api/analyze` 改为异步入队；新增 quota admin 端点
- `backend/src/database/db.py` — Settings 添加 REDIS_URL
- `backend/src/services/data/name_service.py` — preload 前加 24h TTL 检查
- `frontend/src/lib/api.ts` — 新增 task 轮询/WS 相关函数
- `frontend/src/app/page.tsx` — handleAnalyze 改用 WebSocket 接收结果；archiveBlob 懒生成

---

## Chunk 1: 小修 + Admin Quota 接口

### Task 1: 依赖安装 — 添加 arq, redis 到 requirements.txt

**Files:**
- Modify: `backend/requirements.txt`

- [ ] **Step 1: 在 requirements.txt 末尾添加依赖**

在 `backend/requirements.txt` 末尾加入：
```
arq>=0.26.0
redis[hiredis]>=5.0.0
```

- [ ] **Step 2: 验证安装（后端目录）**

```bash
cd backend
pip install arq "redis[hiredis]"
```
预期输出：Successfully installed arq-x.x redis-x.x

- [ ] **Step 3: Commit**

```bash
git add backend/requirements.txt
git commit -m "deps: add arq and redis for async task queue"
```

---

### Task 2: Settings 添加 REDIS_URL

**Files:**
- Modify: `backend/src/database/db.py`

- [ ] **Step 1: 在 Settings 类中添加 redis_url 字段**

在 `backend/src/database/db.py` 的 `Settings` 类（class Config 上方）添加：
```python
redis_url: str = "redis://localhost:6379"
```

- [ ] **Step 2: 验证 Settings 可正常加载**

```bash
cd backend
python -c "from src.database.db import settings; print(settings.redis_url)"
```
预期输出：`redis://localhost:6379`

- [ ] **Step 3: Commit**

```bash
git add backend/src/database/db.py
git commit -m "config: add REDIS_URL setting"
```

---

### Task 3: Admin 新增 quota 直接设置接口

**Files:**
- Modify: `backend/src/api/main.py`（在 `admin_update_user` 下方添加新端点）

- [ ] **Step 1: 在 main.py 中找到 AdminUpdateUserRequest 类，添加新 Request 模型**

在 `AdminUpdateUserRequest` 类定义之后（约 1540 行附近）插入：
```python
class AdminSetQuotaRequest(BaseModel):
    daily_usage: Optional[int] = None   # 直接写 users.daily_usage（0=重置，N=已用N次）
    bonus_quota: Optional[int] = None   # 直接写 users.bonus_quota（永久余量池）
```

- [ ] **Step 2: 在 admin_update_user 函数之后添加新端点**

在 `admin_update_user` 函数结束后插入：
```python
@app.patch("/api/admin/users/{user_id}/quota")
async def admin_set_user_quota(
    user_id: int,
    req: AdminSetQuotaRequest,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(_verify_admin),
):
    """Directly set a user's daily_usage and/or bonus_quota (admin only)."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if req.daily_usage is not None:
        if req.daily_usage < 0:
            raise HTTPException(status_code=400, detail="daily_usage 不能为负数")
        user.daily_usage = req.daily_usage
    if req.bonus_quota is not None:
        if req.bonus_quota < 0:
            raise HTTPException(status_code=400, detail="bonus_quota 不能为负数")
        user.bonus_quota = req.bonus_quota
    await db.commit()
    logger.info(
        "admin set quota user=%d daily_usage=%s bonus_quota=%s",
        user_id, req.daily_usage, req.bonus_quota,
    )
    return {
        "id": user.id,
        "email": user.email,
        "daily_usage": user.daily_usage,
        "bonus_quota": user.bonus_quota,
        "subscription_tier": user.subscription_tier,
    }
```

- [ ] **Step 3: 写测试**

新建 `backend/tests/test_quota_admin.py`：
```python
"""Tests for admin quota management endpoints."""
import pytest
from httpx import AsyncClient, ASGITransport
from src.api.main import app
from src.database.db import settings

ADMIN_HEADERS = {"x-admin-token": settings.admin_token or "test-token"}


@pytest.mark.asyncio
async def test_set_daily_usage(tmp_path):
    """Setting daily_usage writes the exact value to DB."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Create a test user first
        reg = await client.post("/api/auth/register", json={
            "email": "quotatest@example.com",
            "password": "Test1234!",
            "username": "quotatest",
        })
        if reg.status_code not in (200, 201, 400):
            pytest.skip("Registration not available in test env")

        # Get user id via admin list
        users = await client.get("/api/admin/users", headers=ADMIN_HEADERS)
        if users.status_code != 200:
            pytest.skip("Admin token not configured")
        user_list = users.json().get("users", [])
        test_user = next((u for u in user_list if u["email"] == "quotatest@example.com"), None)
        if not test_user:
            pytest.skip("Test user not found")
        uid = test_user["id"]

        # Set daily_usage = 2
        resp = await client.patch(
            f"/api/admin/users/{uid}/quota",
            json={"daily_usage": 2},
            headers=ADMIN_HEADERS,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["daily_usage"] == 2

        # Set bonus_quota = 5
        resp2 = await client.patch(
            f"/api/admin/users/{uid}/quota",
            json={"bonus_quota": 5},
            headers=ADMIN_HEADERS,
        )
        assert resp2.status_code == 200
        assert resp2.json()["bonus_quota"] == 5

        # Negative value rejected
        resp3 = await client.patch(
            f"/api/admin/users/{uid}/quota",
            json={"daily_usage": -1},
            headers=ADMIN_HEADERS,
        )
        assert resp3.status_code == 400


@pytest.mark.asyncio
async def test_quota_404_on_missing_user():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.patch(
            "/api/admin/users/999999/quota",
            json={"daily_usage": 0},
            headers=ADMIN_HEADERS,
        )
        assert resp.status_code == 404
```

- [ ] **Step 4: 运行测试（需要后端运行环境）**

```bash
cd backend
python -m pytest tests/test_quota_admin.py -v 2>&1 | head -40
```
预期：测试通过或 skip（若测试数据库隔离）

- [ ] **Step 5: 手动验证 API（启动后端后）**

```bash
# 启动后端
cd backend && python -m src.api.main &
sleep 3

# 测试端点（替换 USER_ID 和 ADMIN_TOKEN）
curl -X PATCH http://localhost:8000/api/admin/users/1/quota \
  -H "Content-Type: application/json" \
  -H "x-admin-token: YOUR_ADMIN_TOKEN" \
  -d '{"daily_usage": 0, "bonus_quota": 10}'
```
预期响应：`{"id":1,"email":"...","daily_usage":0,"bonus_quota":10,...}`

- [ ] **Step 6: Commit**

```bash
git add backend/src/api/main.py backend/tests/test_quota_admin.py
git commit -m "feat: add PATCH /api/admin/users/{id}/quota for direct quota management"
```

---

### Task 4: SymbolName preload 加 24h TTL 检查

**Files:**
- Modify: `backend/src/services/data/name_service.py`

- [ ] **Step 1: 在 preload_names 函数开头加 TTL 检查**

在 `name_service.py` 的 `preload_names` 函数内（`for market in ("a", "hk", "us"):` 前）插入：
```python
    # Skip initial bulk load if names were refreshed within the last 24h
    from src.database.db import async_session as _async_session
    from src.database.db import SymbolName as _SymbolName
    from sqlalchemy import func as _func
    try:
        async with _async_session() as _db:
            row = await _db.execute(
                _select(_func.max(_SymbolName.updated_at))
            )
            last_update = row.scalar()
        if last_update and (_dt.utcnow() - last_update).total_seconds() < 86400:
            logger.info("name_service: skipping preload, last refresh was {:.1f}h ago",
                        (_dt.utcnow() - last_update).total_seconds() / 3600)
            # Still start the daily refresh loop below
```

注意：需要检查 `_select` 是否已在文件顶部导入（搜索 `from sqlalchemy`）。若无 `select`，在函数内局部导入 `from sqlalchemy import select as _select`。

完整修改后的 preload_names 函数开头：
```python
async def preload_names() -> None:
    """Load all market mappings at startup, then refresh every 24 h (runs forever).

    Call this once as a background asyncio task; it never raises.
    """
    from sqlalchemy import select as _select, func as _func
    # Skip bulk load if DB already has fresh data (< 24h old) — prevents AKShare thundering herd on restarts
    try:
        async with async_session() as _db:
            row = await _db.execute(_select(_func.max(SymbolName.updated_at)))
            last_update = row.scalar()
        if last_update and (_dt.utcnow() - last_update).total_seconds() < 86400:
            logger.info(
                "name_service: preload skipped — last refresh {:.1f}h ago",
                (_dt.utcnow() - last_update).total_seconds() / 3600,
            )
        else:
            # Initial load — run markets sequentially to avoid thundering-herd on startup
            for market in ("a", "hk", "us"):
                try:
                    await _refresh_market(market)
                except Exception as e:
                    logger.warning("Initial name load failed for {}: {}", market, e)
    except Exception as e:
        logger.warning("name_service: preload check failed: {}", e)
        # Fall through to daily loop regardless

    # Daily refresh loop
    while True:
        await asyncio.sleep(_DAILY_INTERVAL)
        for market in ("a", "hk", "us"):
            try:
                await _refresh_market(market)
            except Exception as e:
                logger.warning("Daily name refresh failed for {}: {}", market, e)
```

- [ ] **Step 2: 验证语法**

```bash
cd backend
python -c "from src.services.data.name_service import preload_names; print('OK')"
```
预期输出：`OK`

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/data/name_service.py
git commit -m "perf: skip name preload if DB data is fresh (< 24h)"
```

---

### Task 5: 前端 — archiveBlob 改为懒生成

**Files:**
- Modify: `frontend/src/app/page.tsx`
- Modify: `frontend/src/components/SharePreviewSheet.tsx`

- [ ] **Step 1: 修改 handleShareViralCard — 删除 archiveBlob 并行生成，只生成 socialBlob**

在 `page.tsx` 中，找到（约 363 行）：
```typescript
      // Generate social card (statement) + archive card (prediction) in parallel
      const [socialResult, archiveResult] = await Promise.all([
        generateStatementCardBlob(cardParams),
        generatePredictionCardBlob(cardParams),
      ]);
```
替换为：
```typescript
      // Generate social card only — archive card is generated lazily when user switches mode
      const socialResult = await generateStatementCardBlob(cardParams);
```

然后找到（约 374 行）：
```typescript
      setSharePreviewBlob(socialResult.blob);
      setSharePreviewFilename(socialResult.filename);
      setSharePreviewArchiveBlob(archiveResult.blob);
      setSharePreviewArchiveFilename(archiveResult.filename);
```
替换为：
```typescript
      setSharePreviewBlob(socialResult.blob);
      setSharePreviewFilename(socialResult.filename);
      setSharePreviewArchiveBlob(null);   // lazy: generated on demand
      setSharePreviewArchiveFilename('');
```

- [ ] **Step 2: 修改 SharePreviewSheet — 切换到 archive 模式时懒生成**

在 `SharePreviewSheet.tsx` 中，在组件 props 中添加 `cardParams` 和 `onGenerateArchive` 回调，
或更简单：在 `switchMode` 函数中触发外部回调。

打开 `frontend/src/components/SharePreviewSheet.tsx`，找到 props 接口（约第 8 行）：
```typescript
interface SharePreviewSheetProps {
  ...
  archiveBlob?: Blob | null;
  archiveFilename?: string;
  ...
}
```
添加：
```typescript
  onRequestArchive?: () => Promise<void>;  // called when user switches to archive mode and archiveBlob is null
```

找到 `switchMode` 函数（约 87 行）：
```typescript
  const switchMode = (next: 'social' | 'archive') => {
    if (next === mode) return;
```
修改为：
```typescript
  const switchMode = async (next: 'social' | 'archive') => {
    if (next === mode) return;
    if (next === 'archive' && !archiveBlob && onRequestArchive) {
      await onRequestArchive();
    }
```

- [ ] **Step 3: 在 page.tsx 中传入 onRequestArchive 回调**

在 SharePreviewSheet 组件使用处（约 2211 行）添加 prop：
```typescript
onRequestArchive={async () => {
  if (!sharePreviewArchiveBlob) {
    const r = await generatePredictionCardBlob(/* cardParams — 需要保存为 state */);
    setSharePreviewArchiveBlob(r.blob);
    setSharePreviewArchiveFilename(r.filename);
  }
}}
```

注意：需要将 `cardParams` 保存为 state（`const [shareCardParams, setShareCardParams] = useState(null)`），在 `handleShareViralCard` 里 `setShareCardParams(cardParams)` 后使用。

- [ ] **Step 4: 构建验证**

```bash
cd frontend
npm run build 2>&1 | tail -20
```
预期：无 TypeScript 错误，build 成功

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/page.tsx frontend/src/components/SharePreviewSheet.tsx
git commit -m "perf: defer archive blob generation until user switches to archive mode"
```

---

## Chunk 2: Redis + arq Worker 基础设施

### Task 6: 创建 Redis 客户端模块

**Files:**
- Create: `backend/src/worker/__init__.py`
- Create: `backend/src/worker/redis_client.py`

- [ ] **Step 1: 创建 worker 包**

```bash
mkdir -p backend/src/worker
touch backend/src/worker/__init__.py
```

- [ ] **Step 2: 创建 redis_client.py**

```python
"""Redis connection utilities shared by API server and arq worker."""
import os
from arq.connections import RedisSettings


def get_redis_settings() -> RedisSettings:
    """Parse REDIS_URL into arq RedisSettings."""
    url = os.getenv("REDIS_URL", "redis://localhost:6379")
    # arq expects host/port separately; parse from URL
    # Format: redis://[:password@]host[:port][/db]
    import urllib.parse
    parsed = urllib.parse.urlparse(url)
    return RedisSettings(
        host=parsed.hostname or "localhost",
        port=parsed.port or 6379,
        password=parsed.password or None,
        database=int(parsed.path.lstrip("/") or 0),
    )


REDIS_SETTINGS = get_redis_settings()

# TTL constants
TASK_TTL = 3600          # task result kept in Redis for 1h
CACHE_TTL_INTRADAY = 900  # 15 min for intraday periods (1/5/15/30/60 min)
CACHE_TTL_DAILY = 14400  # 4h for daily period
INTRADAY_PERIODS = {"1", "5", "15", "30", "60"}


def cache_ttl(period: str) -> int:
    return CACHE_TTL_INTRADAY if period in INTRADAY_PERIODS else CACHE_TTL_DAILY
```

- [ ] **Step 3: 验证模块可导入**

```bash
cd backend
python -c "from src.worker.redis_client import REDIS_SETTINGS, cache_ttl; print(REDIS_SETTINGS, cache_ttl('daily'))"
```
预期：打印 RedisSettings 对象和 14400

- [ ] **Step 4: Commit**

```bash
git add backend/src/worker/
git commit -m "feat: add Redis client module for arq worker"
```

---

### Task 7: 创建 arq 任务函数

**Files:**
- Create: `backend/src/worker/tasks.py`

- [ ] **Step 1: 创建任务文件**

```python
"""arq task definitions — runs in the worker process."""
import json
import hashlib
import logging
from datetime import datetime
from typing import Any, Optional

from arq import ArqRedis

logger = logging.getLogger(__name__)


def _position_hash(holding_quantity, cost_price, max_position) -> str:
    key = f"{holding_quantity}:{cost_price}:{max_position}"
    return hashlib.md5(key.encode()).hexdigest()[:8]


def _cache_key(symbol: str, market: str, period: str,
               holding_quantity=None, cost_price=None, max_position=None) -> str:
    pos = _position_hash(holding_quantity, cost_price, max_position)
    return f"analysis_cache:{market}:{symbol}:{period}:{pos}"


async def analyze_task(
    ctx: dict,
    task_id: str,
    symbol: str,
    market: str,
    period: str,
    history_days: int,
    holding_quantity: Optional[float],
    cost_price: Optional[float],
    max_position: Optional[float],
    llm_config: dict,
) -> dict:
    """
    arq task: fetch market data + run LLM analysis.
    Stores result in Redis under key task:{task_id}.
    Returns the result dict (arq also stores this in its job store).
    """
    redis: ArqRedis = ctx["redis"]

    async def _set_status(status: str, **extra):
        payload = {"status": status, "task_id": task_id, **extra}
        await redis.set(f"task:{task_id}", json.dumps(payload), ex=3600)

    await _set_status("processing")

    try:
        # --- Check cache first ---
        ck = _cache_key(symbol, market, period, holding_quantity, cost_price, max_position)
        cached_raw = await redis.get(ck)
        if cached_raw:
            logger.info("cache hit: %s", ck)
            cached_result = json.loads(cached_raw)
            payload = {"status": "done", "task_id": task_id, "cached": True, **cached_result}
            await redis.set(f"task:{task_id}", json.dumps(payload), ex=3600)
            return payload

        # --- Fetch market data ---
        from src.services.data.data_service import DataService
        from src.database.db import async_session

        data_service = DataService()
        async with async_session() as db:
            df = await data_service.fetch_market_data(
                symbol=symbol,
                market=market,
                period=period,
                start_date=None,
                end_date=None,
            )

        if df is None or df.empty:
            await _set_status("failed", error=f'未找到 "{symbol}" 的市场数据')
            return {"status": "failed", "error": f'未找到 "{symbol}" 的市场数据'}

        # --- LLM analysis ---
        from src.services.llm.llm_service import LLMService
        llm_service = LLMService()
        result = await llm_service.analyze_with_llm(
            df=df,
            symbol=symbol,
            provider=llm_config["provider"],
            api_key=llm_config["api_key"],
            base_url=llm_config["base_url"],
            model=llm_config["model"],
            max_tokens=llm_config["max_tokens"],
            temperature=llm_config["temperature"],
            user_context={
                "holding_quantity": holding_quantity,
                "cost_price": cost_price,
                "max_position": max_position,
            },
        )

        latest_price = float(df.iloc[-1]["close"])

        # Store in cache
        from src.worker.redis_client import cache_ttl
        cache_payload = {
            "result": result,
            "latest_price": latest_price,
            "analyzed_at": datetime.utcnow().isoformat(),
        }
        await redis.set(ck, json.dumps(cache_payload), ex=cache_ttl(period))

        # Store task result
        done_payload = {
            "status": "done",
            "task_id": task_id,
            "cached": False,
            **cache_payload,
        }
        await redis.set(f"task:{task_id}", json.dumps(done_payload), ex=3600)
        return done_payload

    except Exception as exc:
        logger.exception("analyze_task failed: %s", exc)
        await _set_status("failed", error=str(exc))
        return {"status": "failed", "error": str(exc)}
```

- [ ] **Step 2: 验证导入（Redis 不需要运行）**

```bash
cd backend
python -c "from src.worker.tasks import analyze_task, _cache_key; print('OK')"
```
预期：`OK`

- [ ] **Step 3: Commit**

```bash
git add backend/src/worker/tasks.py
git commit -m "feat: add arq analyze_task with Redis caching"
```

---

### Task 8: 创建 arq Worker 入口

**Files:**
- Create: `backend/src/worker/main.py`

- [ ] **Step 1: 创建 worker main**

```python
"""arq worker entry point.

Run with:
    python -m src.worker.main
or via docker-compose worker service.
"""
import asyncio
import logging
from arq import run_worker
from src.worker.redis_client import REDIS_SETTINGS
from src.worker.tasks import analyze_task
from src.database.db import init_db

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def startup(ctx: dict):
    """Called once when the worker starts."""
    await init_db()
    logger.info("arq worker started, DB initialised")


async def shutdown(ctx: dict):
    """Called once when the worker shuts down."""
    logger.info("arq worker shutting down")


class WorkerSettings:
    functions = [analyze_task]
    on_startup = startup
    on_shutdown = shutdown
    redis_settings = REDIS_SETTINGS
    max_jobs = 5           # max concurrent LLM calls
    job_timeout = 300      # 5 minutes per job
    keep_result = 3600     # keep job result in Redis for 1h
    retry_jobs = False     # don't retry failed LLM calls (cost safety)


if __name__ == "__main__":
    run_worker(WorkerSettings)
```

- [ ] **Step 2: 验证 worker 模块可导入**

```bash
cd backend
python -c "from src.worker.main import WorkerSettings; print('OK')"
```
预期：`OK`

- [ ] **Step 3: Commit**

```bash
git add backend/src/worker/main.py
git commit -m "feat: add arq worker entry point"
```

---

### Task 9: Docker Compose — 添加 Redis + Worker 服务

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: 在 docker-compose.yml 中添加 redis 服务**

在 `services:` 节，`postgres:` 服务之后插入：
```yaml
  # Redis — task queue + result cache
  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - trader-network
```

- [ ] **Step 2: 在 backend 服务的 environment 中添加 REDIS_URL**

在 backend 服务 environment 列表中添加：
```yaml
      - REDIS_URL=redis://redis:6379
```

- [ ] **Step 3: 添加 worker 服务（在 data-collector 之后）**

```yaml
  # arq Worker — runs LLM analysis tasks asynchronously
  worker:
    build:
      context: ./backend
      dockerfile: Dockerfile
    command: ["python", "-m", "src.worker.main"]
    volumes:
      - backend_logs:/app/logs
    environment:
      - DATABASE_URL=postgresql+asyncpg://${POSTGRES_USER:-trader}:${POSTGRES_PASSWORD:-changeme}@postgres:5432/${POSTGRES_DB:-trader}
      - REDIS_URL=redis://redis:6379
      - SECRET_KEY=${SECRET_KEY}
      - LLM_PROVIDER=${LLM_PROVIDER:-openai}
      - LLM_API_KEY=${LLM_API_KEY}
      - LLM_BASE_URL=${LLM_BASE_URL:-https://api.deepseek.com/v1}
      - LLM_MODEL=${LLM_MODEL:-deepseek-chat}
      - LLM_MAX_TOKENS=${LLM_MAX_TOKENS:-1500}
      - LLM_TEMPERATURE=${LLM_TEMPERATURE:-0.7}
    depends_on:
      redis:
        condition: service_healthy
      postgres:
        condition: service_healthy
    restart: unless-stopped
    networks:
      - trader-network
```

- [ ] **Step 4: 在 volumes 节添加 redis_data**

在文件末尾的 `volumes:` 节添加：
```yaml
  redis_data:
```

- [ ] **Step 5: 本地验证 compose 文件语法**

```bash
docker-compose config --quiet && echo "compose OK"
```
预期：`compose OK`（无语法错误）

- [ ] **Step 6: Commit**

```bash
git add docker-compose.yml
git commit -m "infra: add Redis and arq worker to docker-compose"
```

---

## Chunk 3: API 异步化 — analyze 端点改造

### Task 10: main.py — 添加 Redis 连接池到 app lifespan

**Files:**
- Modify: `backend/src/api/main.py`

- [ ] **Step 1: 在 main.py 顶部 import 区添加**

在现有 import 之后（找到 `import os` 或 `from loguru` 等行之后）添加：
```python
import uuid
from arq import create_pool
from src.worker.redis_client import REDIS_SETTINGS
```

- [ ] **Step 2: 在 lifespan 函数中初始化 Redis 连接池**

找到 `async def lifespan(app: FastAPI):` 函数，在 `await init_db()` 之后添加：
```python
    # Initialize Redis connection pool for task queue
    app.state.redis = await create_pool(REDIS_SETTINGS)
    logger.info("Redis connection pool initialised")
```

在 `yield` 之后（cleanup 阶段）添加：
```python
    await app.state.redis.close()
```

- [ ] **Step 3: 验证 app 可启动（需要 Redis 运行）**

```bash
# 先启动 Redis（本地测试用）
docker run -d --name test-redis -p 6379:6379 redis:7-alpine
cd backend
REDIS_URL=redis://localhost:6379 python -m src.api.main &
sleep 3
curl http://localhost:8000/api/health
kill %1
docker rm -f test-redis
```
预期：health 返回 200

- [ ] **Step 4: Commit**

```bash
git add backend/src/api/main.py
git commit -m "feat: initialize Redis pool in app lifespan"
```

---

### Task 11: main.py — /api/analyze 改为异步入队

**Files:**
- Modify: `backend/src/api/main.py`

这是最核心的改动。原来 `analyze` 端点直接调用 LLM，现在改为：检查 quota → 扣除 quota → 入队 → 返回 task_id。

- [ ] **Step 1: 定位现有 analyze 端点（约第 1050 行附近的 @app.post("/api/analyze")）**

找到端点函数签名：
```python
@app.post("/api/analyze")
async def analyze(
```

在 quota 检查通过、symbol 验证通过之后，找到：
```python
    try:
        df = await data_service.fetch_market_data(
```

**将从 `try:` 开始到函数末尾的整个 LLM 调用块替换为以下入队逻辑：**

```python
    # --- Enqueue async task ---
    task_id = str(uuid.uuid4())
    _llm = _llm_config()
    if not _llm["api_key"]:
        raise HTTPException(status_code=503, detail="AI 分析服务暂未配置，请联系管理员")

    # Consume quota upfront (before queuing — prevents replay attacks)
    if usage_mode == "account":
        await user_service.increment_usage(db, current_user)
        _, new_remaining = await user_service.check_daily_limit(db, current_user)
        used = current_user.daily_usage
        daily_limit_shown = USER_LIMITS.get(subscription, 3)
    else:
        usage_log = await _increment_device_usage(db, device_id)
        limit = LIMITS.get(subscription, 1)
        new_remaining = max(limit - usage_log.count, 0)
        used = usage_log.count
        daily_limit_shown = limit

    # Enqueue the analysis task
    await request.app.state.redis.enqueue_job(
        "analyze_task",
        task_id,
        symbol_clean,
        req.market,
        req.period,
        req.history_days or 90,
        req.holding_quantity,
        req.cost_price,
        req.max_position,
        _llm,
        _job_id=task_id,   # use task_id as arq job_id for retrieval
    )

    return {
        "task_id": task_id,
        "status": "queued",
        "usage": {
            "tier": subscription,
            "remaining": new_remaining,
            "used": used,
            "daily_limit": daily_limit_shown,
        },
    }
```

注意：函数参数需添加 `request: Request`（FastAPI Request，用于访问 `app.state.redis`）：
```python
@app.post("/api/analyze")
async def analyze(
    req: AnalyzeRequest,
    request: Request,          # <-- add this
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
```

- [ ] **Step 2: 验证语法**

```bash
cd backend
python -c "import ast; ast.parse(open('src/api/main.py').read()); print('syntax OK')"
```
预期：`syntax OK`

- [ ] **Step 3: Commit**

```bash
git add backend/src/api/main.py
git commit -m "feat: make /api/analyze async — returns task_id immediately"
```

---

### Task 12: main.py — 添加 task 状态查询端点 + WebSocket

**Files:**
- Modify: `backend/src/api/main.py`

- [ ] **Step 1: 添加 GET /api/task/{task_id} 轮询端点**

在 analyze 端点之后添加：
```python
@app.get("/api/task/{task_id}")
async def get_task_status(task_id: str, request: Request):
    """Poll task status. Returns {status, result} when done."""
    import json as _json
    raw = await request.app.state.redis.get(f"task:{task_id}")
    if raw is None:
        raise HTTPException(status_code=404, detail="Task not found or expired")
    return _json.loads(raw)
```

- [ ] **Step 2: 添加 WebSocket /ws/task/{task_id} 推送端点**

```python
from fastapi import WebSocket, WebSocketDisconnect
import asyncio as _asyncio

@app.websocket("/ws/task/{task_id}")
async def ws_task_status(websocket: WebSocket, task_id: str):
    """WebSocket: push task result when ready, then close."""
    import json as _json
    await websocket.accept()
    try:
        redis = websocket.app.state.redis
        # Poll Redis until result is ready (max 5 minutes)
        for _ in range(600):   # 600 × 0.5s = 5 min
            raw = await redis.get(f"task:{task_id}")
            if raw:
                data = _json.loads(raw)
                if data.get("status") in ("done", "failed"):
                    await websocket.send_json(data)
                    break
            await _asyncio.sleep(0.5)
        else:
            await websocket.send_json({"status": "timeout", "task_id": task_id})
    except WebSocketDisconnect:
        pass
    finally:
        try:
            await websocket.close()
        except Exception:
            pass
```

- [ ] **Step 3: 验证语法**

```bash
cd backend
python -c "import ast; ast.parse(open('src/api/main.py').read()); print('syntax OK')"
```
预期：`syntax OK`

- [ ] **Step 4: 集成测试（需要 Redis + worker 运行）**

```bash
# Start Redis
docker run -d --name test-redis -p 6379:6379 redis:7-alpine
sleep 1

# Start worker in background
cd backend && REDIS_URL=redis://localhost:6379 python -m src.worker.main &
WORKER_PID=$!
sleep 2

# Start API
REDIS_URL=redis://localhost:6379 python -m src.api.main &
API_PID=$!
sleep 3

# Submit analysis (will return task_id quickly)
RESP=$(curl -s -X POST http://localhost:8000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"symbol":"600519","market":"a","period":"daily","device_id":"test123"}')
echo "Response: $RESP"
TASK_ID=$(echo $RESP | python -c "import sys,json; print(json.load(sys.stdin).get('task_id',''))")
echo "Task ID: $TASK_ID"

# Poll until done
for i in $(seq 1 30); do
  sleep 2
  STATUS=$(curl -s http://localhost:8000/api/task/$TASK_ID | python -c "import sys,json; print(json.load(sys.stdin).get('status',''))")
  echo "Poll $i: $STATUS"
  if [ "$STATUS" = "done" ] || [ "$STATUS" = "failed" ]; then break; fi
done

# Cleanup
kill $WORKER_PID $API_PID
docker rm -f test-redis
```
预期：task_id 在几十毫秒内返回，轮询最终显示 `done` 或 `failed`（若无 LLM key 则 failed 是预期的）

- [ ] **Step 5: Commit**

```bash
git add backend/src/api/main.py
git commit -m "feat: add GET /api/task/{id} and WebSocket /ws/task/{id} for async result polling"
```

---

## Chunk 4: 前端异步接入 + 集成测试

### Task 13: 前端 API 层 — 添加 task 相关函数

**Files:**
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: 在 api.ts 中添加类型和函数**

在文件末尾添加：
```typescript
// ── Async Task ────────────────────────────────────────────────────────────────

export interface TaskStatusResponse {
  task_id: string;
  status: 'queued' | 'processing' | 'done' | 'failed' | 'timeout';
  result?: any;
  latest_price?: number;
  analyzed_at?: string;
  cached?: boolean;
  error?: string;
  usage?: {
    tier: string;
    remaining: number;
    used: number;
    daily_limit: number;
  };
}

export const pollTask = async (taskId: string): Promise<TaskStatusResponse> => {
  const response = await api.get(`/api/task/${taskId}`);
  return response.data;
};

/**
 * Connect to WebSocket for task result.
 * Calls onMessage when status is done/failed/timeout.
 * Returns a cleanup function.
 */
export const connectTaskWebSocket = (
  taskId: string,
  onMessage: (data: TaskStatusResponse) => void,
  onError?: (err: Event) => void,
): (() => void) => {
  const wsBase = (process.env.NEXT_PUBLIC_API_URL || '').replace(/^http/, 'ws') ||
    (typeof window !== 'undefined' ? `ws://${window.location.host}` : '');
  const ws = new WebSocket(`${wsBase}/ws/task/${taskId}`);

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data) as TaskStatusResponse;
      onMessage(data);
    } catch {
      // ignore parse errors
    }
  };

  ws.onerror = onError || (() => {});

  return () => {
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close();
    }
  };
};
```

- [ ] **Step 2: 修改 analyze 函数，使返回类型包含 task_id**

找到现有的：
```typescript
export const analyze = async (data: AnalyzeRequest): Promise<AnalyzeResponse> => {
  const response = await api.post('/api/analyze', data);
  return response.data;
};
```

在其上方添加：
```typescript
export interface AnalyzeQueuedResponse {
  task_id: string;
  status: 'queued';
  usage: { tier: string; remaining: number; used: number; daily_limit: number };
}
```

并将 `analyze` 函数改为：
```typescript
export const analyze = async (data: AnalyzeRequest): Promise<AnalyzeQueuedResponse> => {
  const response = await api.post('/api/analyze', data);
  return response.data;
};
```

- [ ] **Step 3: 构建检查**

```bash
cd frontend
npx tsc --noEmit 2>&1 | head -30
```
预期：0 TypeScript 错误（或仅有待修复的 page.tsx 类型错误，下一 task 修复）

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat: add task polling and WebSocket helpers to API client"
```

---

### Task 14: 前端 page.tsx — handleAnalyze 改用 WebSocket

**Files:**
- Modify: `frontend/src/app/page.tsx`

这是最大的前端改动：将同步等待改为 WebSocket 接收结果。

- [ ] **Step 1: 导入新函数**

找到（约第 7 行）：
```typescript
import {
  analyze,
  ...
} from '@/lib/api';
```
添加 `connectTaskWebSocket, pollTask, AnalyzeQueuedResponse` 到 import。

- [ ] **Step 2: 替换 handleAnalyze 中的核心调用逻辑**

找到（约 595 行）：
```typescript
      const response = await analyze(request);
      clearTimeout(timeoutHandle);
      setResult(response);
      setLimits(response.usage);
```

替换为完整的 WebSocket 接收逻辑：
```typescript
      // Submit analysis — returns task_id immediately
      const queued = await analyze(request);
      setLimits(queued.usage);
      clearTimeout(timeoutHandle);

      // New 3-minute timeout for WS
      const wsTimeout = setTimeout(() => setAnalyzeTimedOut(true), 3 * 60 * 1000);

      // Connect WebSocket and wait for result
      await new Promise<void>((resolve, reject) => {
        const cleanup = connectTaskWebSocket(
          queued.task_id,
          (data) => {
            clearTimeout(wsTimeout);
            cleanup();
            if (data.status === 'failed') {
              reject(new Error(data.error || '分析失败'));
              return;
            }
            if (data.status === 'done' || data.status === 'timeout') {
              if (!data.result) { reject(new Error('分析超时，请重试')); return; }
              // data.result is the raw LLM result; wrap it to match AnalyzeResponse shape
              const syntheticResponse = {
                ...data.result,
                usage: queued.usage,
              };
              setResult(syntheticResponse);
              resolve();
            }
          },
          (err) => {
            clearTimeout(wsTimeout);
            cleanup();
            // Fall back to polling if WebSocket fails
            const poll = async () => {
              for (let i = 0; i < 120; i++) {
                await new Promise(r => setTimeout(r, 3000));
                try {
                  const status = await pollTask(queued.task_id);
                  if (status.status === 'done') {
                    setResult({ ...status.result, usage: queued.usage });
                    resolve(); return;
                  }
                  if (status.status === 'failed') {
                    reject(new Error(status.error || '分析失败')); return;
                  }
                } catch { /* continue polling */ }
              }
              reject(new Error('分析超时，请重试'));
            };
            poll();
          }
        );
      });
```

注意：原有代码里 `response` 后面还有设置 history、position params 等逻辑，这些需要从 `setResult(syntheticResponse)` 回调后继续执行。建议将 history 设置和 `setActivePanel('result')` 移到 Promise resolve 之后，或在 WebSocket onMessage 回调中一并处理。

完整重写思路：将 analyze 之后的所有状态设置放入一个 `handleResult(response)` 辅助函数，在 Promise resolve 后调用：

```typescript
const handleResult = (response: any) => {
  setResult(response);
  setLimits(response.usage);
  const nowIso = new Date().toISOString();
  setAnalyzeStartedAt(nowIso);
  // ... 其余现有逻辑保持不变 ...
  setActivePanel('result');
  setResultSheetOpen(true);
  setActiveTab(0);
};
```

- [ ] **Step 3: 构建验证**

```bash
cd frontend
npm run build 2>&1 | tail -30
```
预期：build 成功，无类型错误

- [ ] **Step 4: 本地端到端测试**

```bash
# 确保 Redis 和 worker 运行
docker run -d --name test-redis -p 6379:6379 redis:7-alpine
cd backend && REDIS_URL=redis://localhost:6379 python -m src.worker.main &
REDIS_URL=redis://localhost:6379 python -m src.api.main &

# 启动前端
cd frontend && npm run dev &

# 在浏览器打开 http://localhost:3000
# 输入 600519，市场选A股，点击分析
# 预期：loading 屏显示后，结果在 LLM 完成后自动出现
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/page.tsx
git commit -m "feat: handleAnalyze uses WebSocket for async task result"
```

---

### Task 15: 异步分析集成测试

**Files:**
- Create: `backend/tests/test_async_analyze.py`

- [ ] **Step 1: 创建集成测试**

```python
"""Integration tests for async analyze task flow."""
import json
import pytest
from unittest.mock import AsyncMock, patch


@pytest.mark.asyncio
async def test_analyze_returns_task_id_immediately(async_client):
    """POST /api/analyze should return task_id without waiting for LLM."""
    import time
    start = time.time()
    resp = await async_client.post("/api/analyze", json={
        "symbol": "600519",
        "market": "a",
        "period": "daily",
        "device_id": "test-device-integration",
    })
    elapsed = time.time() - start
    # Should return in < 2 seconds (not waiting for LLM)
    assert elapsed < 2.0, f"Analyze took {elapsed:.1f}s — expected < 2s"
    assert resp.status_code in (200, 429, 503)  # 503 = no LLM key configured
    if resp.status_code == 200:
        data = resp.json()
        assert "task_id" in data
        assert data["status"] == "queued"


@pytest.mark.asyncio
async def test_get_task_status_404_for_unknown():
    """GET /api/task/nonexistent should 404."""
    from httpx import AsyncClient, ASGITransport
    from src.api.main import app
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/task/nonexistent-task-id")
        assert resp.status_code == 404


@pytest.mark.asyncio
async def test_cache_key_uniqueness():
    """Different symbol/market/period combinations produce different cache keys."""
    from src.worker.tasks import _cache_key
    k1 = _cache_key("600519", "a", "daily")
    k2 = _cache_key("600519", "a", "60")
    k3 = _cache_key("000001", "a", "daily")
    assert k1 != k2
    assert k1 != k3
    assert k2 != k3
    # Same inputs = same key (idempotent)
    assert _cache_key("600519", "a", "daily") == k1
```

- [ ] **Step 2: 运行测试**

```bash
cd backend
python -m pytest tests/test_async_analyze.py -v 2>&1 | head -40
```

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_async_analyze.py
git commit -m "test: add async analyze integration tests"
```

---

## Chunk 5: 自测清单

### Task 16: 完整系统自测

- [ ] **Step 1: 启动全栈（Docker Compose）**

```bash
cd /path/to/trader
docker-compose up --build -d
docker-compose ps
```
预期：postgres, redis, backend, worker, frontend, data-collector 全部 `Up`

- [ ] **Step 2: 后端健康检查**

```bash
curl http://localhost:8000/api/health
```
预期：`{"status":"ok"}`

- [ ] **Step 3: 测试 Admin Quota 接口**

```bash
# 获取用户列表
curl http://localhost:8000/api/admin/users \
  -H "x-admin-token: $ADMIN_TOKEN"

# 设置 user_id=1 的 daily_usage=0, bonus_quota=100
curl -X PATCH http://localhost:8000/api/admin/users/1/quota \
  -H "Content-Type: application/json" \
  -H "x-admin-token: $ADMIN_TOKEN" \
  -d '{"daily_usage": 0, "bonus_quota": 100}'
```
预期：返回更新后的用户数据

- [ ] **Step 4: 测试异步分析端点**

```bash
# 提交分析
RESP=$(curl -s -X POST http://localhost:8000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"symbol":"600519","market":"a","period":"daily","device_id":"selftest"}')
echo $RESP | python -m json.tool

TASK_ID=$(echo $RESP | python -c "import sys,json; d=json.load(sys.stdin); print(d.get('task_id','MISSING'))")
echo "Task ID: $TASK_ID"
```
预期：`status: "queued"`，`task_id` 非空

- [ ] **Step 5: 轮询 task 状态**

```bash
for i in $(seq 1 20); do
  sleep 3
  curl -s http://localhost:8000/api/task/$TASK_ID | python -m json.tool | head -5
done
```
预期：状态从 `processing` 变为 `done` 或 `failed`

- [ ] **Step 6: 验证 worker 日志**

```bash
docker-compose logs worker --tail=30
```
预期：看到 `analyze_task` 被执行的日志

- [ ] **Step 7: 验证 SymbolName TTL 日志**

```bash
docker-compose restart backend
docker-compose logs backend --tail=20
```
预期：看到 `name_service: preload skipped — last refresh X.Xh ago`（若 DB 已有数据）

- [ ] **Step 8: 验证前端 WebSocket 连接（浏览器）**

```
1. 打开 http://localhost:3000
2. 登录账号
3. 输入 600519，选 A股，点分析
4. 打开浏览器 DevTools → Network → WS
5. 应看到 ws://localhost:3000/ws/task/{task_id} 连接建立
6. 当 worker 完成分析后，result 自动展示在页面
```

- [ ] **Step 9: 运行所有后端测试**

```bash
cd backend
python -m pytest tests/ -v 2>&1 | tail -30
```
预期：所有测试 PASS 或 SKIP

- [ ] **Step 10: Commit 最终状态**

```bash
git add -A
git commit -m "chore: complete async refactor + admin quota endpoints — all self-tests passed"
```
