# Pro Trial Flow — Manual Test Guide

> **Compilation status:** `nuxt typecheck` exits 0. All Python files pass `py_compile`.

## Setup

```powershell
powershell.exe -ExecutionPolicy Bypass -File start.ps1
```

Frontend: http://localhost:3000
Backend API: http://localhost:8000/docs

---

## Test Cases

### T1 — Guest: First Visit (trial available)

**Precondition:** Use a browser with no prior device_id in localStorage, OR clear localStorage.

**Steps:**
1. Open http://localhost:3000 in incognito/private mode
2. Page finishes loading

**Expected:**
- `ProTrialWelcomeModal` appears over the page
- Modal shows "你获得一次专业版体验" with 3 perks
- "立即开始体验" button is visible

---

### T2 — Guest: Pro Trial Flow (confirm → analyze → result badge)

**Precondition:** T1 state (modal visible)

**Steps:**
1. Click "立即开始体验"
2. Modal closes
3. Enter any stock symbol (e.g. `600519`) and click analyze

**Expected:**
- After clicking analyze: floating capsule `✦ 专业版体验中 · 深度分析进行中` appears near top of page
- Capsule has frosted-glass purple style, centered, `z-index` above content
- While analysis runs (loading state), capsule remains visible
- When result returns: capsule disappears with fade animation
- The new history card shows `✦ 专业版体验` purple badge below the symbol/date

---

### T3 — Guest: Return Visit (trial expired)

**Precondition:** T2 completed (device has `has_had_pro_trial = true`)

**Steps:**
1. Reload http://localhost:3000 (same incognito window, don't clear storage)

**Expected:**
- `GuestTrialEndedScreen` appears **immediately on page load** (without attempting an analysis)
- Full-screen overlay with "专业版体验已结束"
- Shows register and login CTAs
- Does NOT show the ProTrialWelcomeModal

---

### T4 — Registered Free User: First Login (trial available)

**Precondition:** Account with `has_had_pro_trial = false`, tier = `free`.
Create via register, or reset via admin panel → Users → Reset trial.

**Steps:**
1. Log in with the free account
2. Navigate to home page (or it already shows)

**Expected:**
- `ProTrialWelcomeModal` appears
- Same flow as T2 once confirmed
- After analysis: `is_pro_trial = true` stored in DB for that history record

---

### T5 — Registered Free User: Return (trial used, banner)

**Precondition:** Account with `has_had_pro_trial = true`, tier = `free`.

**Steps:**
1. Log in
2. Navigate to home page

**Expected:**
- **No** `ProTrialWelcomeModal`
- **No** `GuestTrialEndedScreen`
- Purple info banner at top of analysis form: "✦ 专业版体验已结束 · 后续分析将以当前套餐权限进行"
- Banner has `×` dismiss button
- Analysis form is still fully functional (quota follows free tier limits)

**Additional check:**
- Click `×` on banner → banner disappears, form still usable

---

### T6 — History Badge Persistence (DB-loaded)

**Precondition:** T4 completed (logged-in user has one `is_pro_trial = true` record in DB)

**Steps:**
1. Log out and log back in
2. History loads from API (`/api/analyze/history`)

**Expected:**
- The trial analysis card shows `✦ 专业版体验` purple badge
- Other cards do NOT show the badge
- Badge style: small purple pill, `rgba(175,82,222,0.1)` background

---

### T7 — Premium/Basic User: No Trial Prompt

**Precondition:** Account with `tier = premium` or `tier = basic`

**Steps:**
1. Log in
2. Navigate to home

**Expected:**
- No `ProTrialWelcomeModal`
- No `ProTrialEndedBanner`
- No `GuestTrialEndedScreen`

---

### T8 — Mobile Layout (375px)

Open DevTools → Responsive → 375×812.

**Verify:**
- T1–T5 flows work at mobile width
- `ProTrialInProgressBanner` capsule centered at top (fixed position)
- `ProTrialEndedBanner` renders inside the form padding area (not clipped)
- `GuestTrialEndedScreen` has safe-area bottom padding (no content cut off on notch devices)

---

### T9 — Desktop Layout (1280px)

Open at full desktop width.

**Verify:**
- `ProTrialEndedBanner` appears at top of the left-column analyze panel (inside max-width 540px container)
- `ProTrialInProgressBanner` capsule still centered (fixed, layout-agnostic)
- History badges visible in sidebar history list

---

## DB Verification

Check `is_pro_trial` was written to the database after a trial analysis:

```sql
SELECT id, symbol, is_pro_trial, analyzed_at
FROM analysis_histories
ORDER BY analyzed_at DESC
LIMIT 5;
```

Expected: the trial analysis row has `is_pro_trial = true`; all others `false`.

---

## API Verification

After T4 (logged-in trial), check the history endpoint includes the field:

```bash
curl -H "Authorization: Bearer <token>" http://localhost:8000/api/analyze/history
```

Expected response item:
```json
{
  "id": 123,
  "symbol": "600519",
  "is_pro_trial": true,
  ...
}
```

---

## Compilation Evidence

```
nuxt typecheck — EXIT_CODE: 0  (no TypeScript errors)
py_compile on all modified .py files — exit 0
```

Pre-existing TypeScript errors fixed in the same PR:
- `UserOut` missing `used_invite_code` field
- `submitAnalysis` options missing `multiPeriodEnabled` / `auxiliaryPeriods`
- `saveRecord` call incorrectly passing `id` (excluded by `Omit<SavedRecord, 'id'|'savedAt'>`)
