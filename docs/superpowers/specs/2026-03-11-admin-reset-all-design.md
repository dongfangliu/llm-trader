# Admin Reset All Data — Design Spec

**Date:** 2026-03-11
**Status:** Approved

## Overview

Add a "清空全部数据" (Reset All Data) action to the admin users panel that permanently deletes all registered users, guest devices, and all associated records from the database. This is a global, irreversible operation protected by a single `confirm()` dialog.

## Backend

### New Endpoint: `POST /api/admin/reset-all`

- Protected by `_verify_admin` (requires `X-Admin-Token` header, same as all other admin endpoints)
- Deletes rows from tables in dependency order to avoid FK constraint violations:
  1. `analysis_requests`
  2. `analysis_history`
  3. `usage_logs`
  4. `device_subscriptions`  ← the only device-related table; tracks both guest devices and user-linked subscriptions
  5. `users`
- Returns deleted row counts per table using consistent key names:
  ```json
  {
    "deleted": {
      "users": 12,
      "device_subscriptions": 34,
      "analysis_requests": 100,
      "analysis_history": 80,
      "usage_logs": 200
    }
  }
  ```
- Uses a single database transaction so any failure rolls back all deletes.

## Frontend

### `frontend/src/lib/api.ts`

Add `adminResetAll()` function calling `POST /api/admin/reset-all` via `adminApi` (same axios instance used by all other admin functions, token injected automatically from `localStorage.getItem('adminToken')`).

### `frontend/src/app/admin/users/page.tsx`

- Add a red "清空全部数据" button in the page header alongside the existing "刷新" button.
- On click: show `confirm()` with message:
  > "此操作将永久删除所有用户、设备和历史记录，无法恢复。确认继续？"
- If confirmed:
  - Set `saving('reset-all')` (reuses the existing `saving` state, which holds a string key or `null`; `'reset-all'` is a new key value alongside the existing `'bulk'` and per-row keys)
  - Button is disabled and shows "清空中…" while `saving === 'reset-all'`
  - Call `adminResetAll()`
  - Call `load()` regardless of success or failure (so the list always reflects current DB state)
  - On success: flash `"✓ 已清空全部数据"`
  - On failure: flash `"❌ 清空失败"` (generic message by design; admin can check server logs for detail)
  - Clear `saving` in `finally`
- If the user cancels the `confirm()` dialog: do nothing.

## Constraints

- No admin user account exists; authentication is entirely token-based, so there is nothing to preserve.
- The `confirm()` dialog is the sole confirmation mechanism — no typed confirmation required.
- No dry-run or preview step.
- Error message is intentionally generic; detailed errors are available in server logs.
