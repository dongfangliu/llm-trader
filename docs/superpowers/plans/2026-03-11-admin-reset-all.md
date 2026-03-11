# Admin Reset All Data Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `POST /api/admin/reset-all` endpoint and a "清空全部数据" button in the admin users panel that deletes all users, device subscriptions, and associated records in one atomic operation.

**Architecture:** Single backend endpoint wrapped in one transaction deletes five tables in dependency order. Frontend adds one button to the existing header area; button reuses the existing `saving` state string.

**Tech Stack:** FastAPI + SQLAlchemy (async) · Next.js (TypeScript) · axios (`adminApi`)

**Spec:** `docs/superpowers/specs/2026-03-11-admin-reset-all-design.md`

---

## Chunk 1: Backend Endpoint

### Task 1: Add `POST /api/admin/reset-all` endpoint

**Files:**
- Modify: `backend/src/api/main.py` (after the last admin endpoint, around line 2470+)
- Test: `backend/tests/test_reset_all.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_reset_all.py`:

```python
"""Tests for POST /api/admin/reset-all endpoint."""
import pytest
from httpx import AsyncClient, ASGITransport
from src.api.main import app
from src.database.db import settings

ADMIN_HEADERS = {"x-admin-token": settings.admin_token or "test-token"}


@pytest.mark.asyncio
async def test_reset_all_requires_admin_token():
    """POST /api/admin/reset-all returns 403/503 without valid token."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/admin/reset-all", headers={"x-admin-token": "wrong"})
    assert resp.status_code in (403, 503)


@pytest.mark.asyncio
async def test_reset_all_returns_deleted_counts():
    """POST /api/admin/reset-all succeeds and returns deleted counts dict."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/admin/reset-all", headers=ADMIN_HEADERS)
    # 503 = admin token not configured in test env, otherwise must be 200
    if resp.status_code == 503:
        pytest.skip("Admin token not configured")
    assert resp.status_code == 200
    body = resp.json()
    assert "deleted" in body
    deleted = body["deleted"]
    for key in ("users", "device_subscriptions", "analysis_requests", "analysis_history", "usage_logs"):
        assert key in deleted
        assert isinstance(deleted[key], int)
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && python -m pytest tests/test_reset_all.py -v
```

Expected: FAIL — `404 Not Found` (endpoint doesn't exist yet)

- [ ] **Step 3: Add `AnalysisRequest` to the import block in `backend/src/api/main.py`**

The existing import block at lines 26-39 is:

```python
from src.database.db import (
    init_db,
    get_db,
    async_session,
    User,
    UsageLog,
    DeviceSubscription,
    AnalysisHistory,
    AfdianOrder,
    SystemSetting,
    MarketBar,
    SymbolName,
    settings,
)
```

Add `AnalysisRequest` to it:

```python
from src.database.db import (
    init_db,
    get_db,
    async_session,
    User,
    UsageLog,
    DeviceSubscription,
    AnalysisHistory,
    AnalysisRequest,
    AfdianOrder,
    SystemSetting,
    MarketBar,
    SymbolName,
    settings,
)
```

- [ ] **Step 4: Add the endpoint to `backend/src/api/main.py`**

Find the last `@app` route in the file (around the watchlist endpoints) and append after it:

```python
@app.post("/api/admin/reset-all")
async def admin_reset_all(
    db: AsyncSession = Depends(get_db),
    _: None = Depends(_verify_admin),
):
    """Delete all users, devices, and associated records (admin only)."""
    tables = [
        (AnalysisRequest, "analysis_requests"),
        (AnalysisHistory, "analysis_history"),
        (UsageLog, "usage_logs"),
        (DeviceSubscription, "device_subscriptions"),
        (User, "users"),
    ]
    counts = {}
    for model, key in tables:
        result = await db.execute(delete(model))
        counts[key] = result.rowcount
    await db.commit()
    return {"deleted": counts}
```

> Note: the top-level sqlalchemy import at line 23 is `from sqlalchemy import select, func`. Add `delete` to it: `from sqlalchemy import select, func, delete`.

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd backend && python -m pytest tests/test_reset_all.py -v
```

Expected: PASS (or SKIP if admin token not configured)

- [ ] **Step 6: Commit**

```bash
git add backend/tests/test_reset_all.py backend/src/api/main.py
git commit -m "feat: add POST /api/admin/reset-all endpoint"
```

---

## Chunk 2: Frontend

### Task 2: Add `adminResetAll` API function

**Files:**
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: Add `adminResetAll` to `api.ts`**

After the existing `adminUpdateWatchlist` function (near the bottom of the Admin API section), add:

```typescript
export const adminResetAll = async (): Promise<{
  deleted: Record<string, number>;
}> => {
  const r = await adminApi.post('/api/admin/reset-all');
  return r.data;
};
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors

### Task 3: Add the button to the admin users page

**Files:**
- Modify: `frontend/src/app/admin/users/page.tsx`

- [ ] **Step 1: Add `adminResetAll` to the `@/lib/api` import**

In `page.tsx`, find the existing named import from `@/lib/api` (line 4-8) and add `adminResetAll` to it. Only modify this one import line — leave `'use client'`, React hooks imports, and all other code untouched:

```typescript
import {
  adminGetUsers, adminUpdateUser, adminSetUserQuota, adminDeleteUser, AdminUser,
  adminGetDevices, adminBanDevice, adminUnbanDevice, adminResetDeviceTrial, adminDeleteDevice,
  adminGetDeviceHistory, adminBatchDevices, AdminDevice, adminResetAll,
} from '@/lib/api';
```

- [ ] **Step 2: Add `handleResetAll` handler**

Add this function inside `AdminMembersPage`, alongside the other handlers (e.g., after `handleBulkAction`):

```typescript
const handleResetAll = async () => {
  if (!confirm('此操作将永久删除所有用户、设备和历史记录，无法恢复。确认继续？')) return;
  setSaving('reset-all');
  try {
    await adminResetAll();
    flash('✓ 已清空全部数据');
  } catch {
    flash('❌ 清空失败');
  } finally {
    setSaving(null);
    await load();
  }
};
```

- [ ] **Step 3: Add the button to the header**

In the JSX, find the header `<div>` that contains the `<button className="btn btn-secondary" onClick={load}>刷新</button>` and add the new button right after it:

```tsx
<button
  className="btn"
  onClick={handleResetAll}
  disabled={saving === 'reset-all'}
  style={{
    padding: '0.5rem 1rem',
    background: '#ef4444',
    color: '#fff',
    border: 'none',
  }}
>
  {saving === 'reset-all' ? '清空中…' : '清空全部数据'}
</button>
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/api.ts frontend/src/app/admin/users/page.tsx
git commit -m "feat: add 清空全部数据 button to admin users panel"
```

---

## Chunk 3: Smoke Test

- [ ] **Start services and verify end-to-end**

  1. Start backend: `.\start.ps1 -Service backend`
  2. Open admin users panel in browser
  3. Confirm "清空全部数据" button appears in header (red)
  4. Click it → confirm dialog appears
  5. Cancel → nothing happens
  6. Click again → confirm → list clears, flash "✓ 已清空全部数据"
  7. Verify `POST /api/admin/reset-all` returns 200 with `deleted` counts in network tab

- [ ] **Final commit if any fixups were needed**

```bash
git add -p
git commit -m "fix: admin reset-all smoke test fixups"
```
