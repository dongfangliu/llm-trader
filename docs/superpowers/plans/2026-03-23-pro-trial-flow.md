# Pro Trial Flow Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the end-to-end pro trial UX: proactive trial-ended screens, "专业版体验中" capsule banner during analysis, and `is_pro_trial` badge on qualifying history items.

**Architecture:** Backend threads a new `is_pro_trial` boolean through the job pipeline and persists it on `analysis_histories`; frontend adds two new iOS-style components and updates page-load logic to show the correct trial state immediately rather than waiting for a failed API call.

**Tech Stack:** FastAPI + SQLAlchemy (backend), Nuxt 3 / Vue 3 (frontend), arq (Redis job queue), PostgreSQL

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `backend/src/models/analysis.py` | Modify | Add `is_pro_trial` ORM column |
| `backend/src/database/db.py` | Modify | Add `is_pro_trial` to legacy model + ALTER TABLE migration |
| `backend/src/services/analysis_service.py` | Modify | Thread `is_pro_trial` param through `submit_analysis` |
| `backend/src/worker/tasks.py` | Modify | Accept `is_pro_trial` in `analyze_task`, pass to history save |
| `backend/src/api/routers/analyze.py` | Modify | Pass `is_pro_trial=is_first_trial` to `submit_analysis` |
| `backend/src/api/schemas/analyze.py` | Modify | Add `is_pro_trial: bool` to `HistoryItem` |
| `frontend/composables/useTrial.ts` | Modify | Add `trialActivated`, `showProTrialEndedBanner`, new handlers |
| `frontend/pages/index.vue` | Modify | Page-load trial state, banner computed, local history badge field |
| `frontend/components/trial/ProTrialInProgressBanner.vue` | Create | iOS floating capsule shown during trial analysis |
| `frontend/components/trial/ProTrialEndedBanner.vue` | Create | Dismissible info card for registered users post-trial |

---

## Task 1: Add `is_pro_trial` column to DB models

**Files:**
- Modify: `backend/src/models/analysis.py:41`
- Modify: `backend/src/database/db.py:173` (legacy model) and `:329` (migration block)

- [ ] **Step 1: Add column to new ORM model**

In `backend/src/models/analysis.py`, after `is_favorited` (line 41):
```python
    is_favorited = Column(Boolean, default=False)
    is_pro_trial = Column(Boolean, default=False, nullable=False)
```

- [ ] **Step 2: Add column to legacy ORM model**

In `backend/src/database/db.py`, `AnalysisHistory` class (line ~173), after `is_favorited`:
```python
    is_favorited = Column(Boolean, default=False)
    is_pro_trial = Column(Boolean, default=False)
```

- [ ] **Step 3: Add migration to init_db**

In `backend/src/database/db.py`, after the `is_favorited` ALTER TABLE block (lines ~326-332), add a new try/except block:
```python
    try:
        async with engine.begin() as conn:
            await conn.execute(text(
                "ALTER TABLE analysis_histories ADD COLUMN IF NOT EXISTS is_pro_trial BOOLEAN DEFAULT FALSE"
            ))
    except Exception:
        pass
```

- [ ] **Step 4: Commit**
```bash
git add backend/src/models/analysis.py backend/src/database/db.py
git commit -m "feat: add is_pro_trial column to analysis_histories"
```

---

## Task 2: Thread `is_pro_trial` through the job pipeline

**Files:**
- Modify: `backend/src/services/analysis_service.py:11-64`
- Modify: `backend/src/worker/tasks.py:158-181`
- Modify: `backend/src/api/routers/analyze.py:209`

- [ ] **Step 1: Add param to `submit_analysis`**

In `backend/src/services/analysis_service.py`, update the function signature and `enqueue_job` call:

```python
async def submit_analysis(
    db: AsyncSession,
    redis_pool,
    symbol: str,
    market: str,
    period: str,
    task_id: str,
    subscription: str = "free",
    usage_mode: str = "device",
    user_id: Optional[int] = None,
    device_id: Optional[str] = None,
    history_days: int = 90,
    holding_quantity: Optional[float] = None,
    cost_price: Optional[float] = None,
    max_position: Optional[float] = None,
    ohlcv_bars: Optional[list] = None,
    is_pro_trial: bool = False,          # NEW
) -> str:
```

In `enqueue_job` call, add `is_pro_trial=is_pro_trial` as a keyword argument (kwargs, not positional):
```python
    await redis_pool.enqueue_job(
        "analyze_task",
        task_id,
        symbol.upper(),
        market,
        period,
        history_days,
        holding_quantity,
        cost_price,
        max_position,
        subscription,
        usage_mode,
        user_id,
        device_id,
        ohlcv_bars,
        _job_id=task_id,
        is_pro_trial=is_pro_trial,    # NEW — passed as kwarg to avoid breaking positional order
    )
```

- [ ] **Step 2: Update `_save_analysis_history_in_worker`**

In `backend/src/worker/tasks.py`, update `_save_analysis_history_in_worker` signature and usage:

```python
async def _save_analysis_history_in_worker(
    symbol: str,
    market: str,
    period: str,
    result_payload: dict,
    user_id: Optional[int],
    device_id: Optional[str],
    is_pro_trial: bool = False,    # NEW
) -> None:
    """Save analysis history to DB using a fresh async session."""
    from src.database.db import async_session, AnalysisHistory
    analyzed_at = datetime.utcnow()
    history = AnalysisHistory(
        user_id=user_id,
        device_id=(device_id or "").strip() or None,
        symbol=symbol,
        market=market,
        period=period,
        result=json.dumps(result_payload, ensure_ascii=False),
        analysis_date=analyzed_at.date(),
        analyzed_at=analyzed_at,
        is_pro_trial=is_pro_trial,    # NEW
    )
```

- [ ] **Step 3: Update `analyze_task` to accept and pass the kwarg**

In `backend/src/worker/tasks.py`, `analyze_task` function signature, add `is_pro_trial: bool = False`:

```python
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
    subscription: str = "free",
    usage_mode: str = "device",
    user_id: Optional[int] = None,
    device_id: Optional[str] = None,
    ohlcv_bars: Optional[list] = None,
    is_pro_trial: bool = False,    # NEW
) -> dict:
```

Then find the call to `_save_analysis_history_in_worker` inside `analyze_task` and add `is_pro_trial=is_pro_trial`.

- [ ] **Step 4: Pass `is_pro_trial=is_first_trial` in router**

In `backend/src/api/routers/analyze.py`, find the `submit_analysis(...)` call (line ~209) and add:
```python
        await submit_analysis(
            ...existing args...,
            is_pro_trial=is_first_trial,    # NEW
        )
```

- [ ] **Step 5: Commit**
```bash
git add backend/src/services/analysis_service.py backend/src/worker/tasks.py backend/src/api/routers/analyze.py
git commit -m "feat: thread is_pro_trial through job pipeline to analysis history"
```

---

## Task 3: Expose `is_pro_trial` in history API schema

**Files:**
- Modify: `backend/src/api/schemas/analyze.py:63-73`

- [ ] **Step 1: Add field to `HistoryItem`**

In `backend/src/api/schemas/analyze.py`, `HistoryItem` class, add after `is_favorited`:
```python
class HistoryItem(BaseModel):
    id: int
    symbol: str
    market: str
    period: str
    created_at: str
    result: Optional[Any] = None
    is_favorited: bool = False
    is_pro_trial: bool = False    # NEW

    class Config:
        from_attributes = True
```

- [ ] **Step 2: Also add `is_pro_trial` to the manual dict in the history endpoint**

The `get_analysis_history` endpoint in `backend/src/api/routers/analyze.py` (line ~396-406) builds response dicts manually and does NOT use Pydantic serialization. Must add the field explicitly:

```python
            {
                "id": item.id,
                "symbol": item.symbol,
                "market": item.market,
                "period": item.period,
                "created_at": item.analyzed_at.isoformat() if item.analyzed_at else "",
                "is_favorited": bool(item.is_favorited),
                "is_pro_trial": bool(item.is_pro_trial),    # ADD
                "result": json.loads(item.result) if item.result else None,
            }
```

- [ ] **Step 3: Commit**
```bash
git add backend/src/api/schemas/analyze.py backend/src/api/routers/analyze.py
git commit -m "feat: expose is_pro_trial in history API response"
```

---

## Task 4: Create `ProTrialInProgressBanner` component (iOS capsule)

**Files:**
- Create: `frontend/components/trial/ProTrialInProgressBanner.vue`

- [ ] **Step 1: Create the component**

```vue
<script setup lang="ts">
// No props needed — shown via v-if in parent
</script>

<template>
  <Transition name="trial-capsule">
    <div class="pro-trial-capsule">
      <span class="capsule-star">✦</span>
      <span class="capsule-text">专业版体验中</span>
      <span class="capsule-dot">·</span>
      <span class="capsule-sub">深度分析进行中</span>
    </div>
  </Transition>
</template>

<style scoped>
.pro-trial-capsule {
  position: fixed;
  top: 60px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 100;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 20px;
  background: rgba(175, 82, 222, 0.15);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid rgba(175, 82, 222, 0.35);
  border-radius: 24px;
  box-shadow: 0 4px 20px rgba(175, 82, 222, 0.25);
  white-space: nowrap;
  pointer-events: none;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif;
}

.capsule-star {
  font-size: 11px;
  color: #AF52DE;
  opacity: 0.9;
}

.capsule-text {
  font-size: 14px;
  font-weight: 600;
  color: #AF52DE;
  letter-spacing: -0.1px;
}

.capsule-dot {
  font-size: 12px;
  color: rgba(175, 82, 222, 0.5);
}

.capsule-sub {
  font-size: 13px;
  color: rgba(175, 82, 222, 0.75);
  font-weight: 400;
}

/* Spring slide-down animation */
.trial-capsule-enter-active {
  transition: all 0.45s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.trial-capsule-leave-active {
  transition: all 0.25s cubic-bezier(0.4, 0, 1, 1);
}
.trial-capsule-enter-from,
.trial-capsule-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-12px) scale(0.92);
}
</style>
```

- [ ] **Step 2: Commit**
```bash
git add frontend/components/trial/ProTrialInProgressBanner.vue
git commit -m "feat: add ProTrialInProgressBanner iOS capsule component"
```

---

## Task 5: Create `ProTrialEndedBanner` component (dismissible info card)

**Files:**
- Create: `frontend/components/trial/ProTrialEndedBanner.vue`

- [ ] **Step 1: Create the component**

```vue
<script setup lang="ts">
const emit = defineEmits<{ (e: 'dismiss'): void }>()
</script>

<template>
  <Transition name="trial-ended-banner">
    <div class="trial-ended-banner">
      <div class="banner-body">
        <span class="banner-icon">✦</span>
        <div class="banner-content">
          <p class="banner-title">专业版体验已结束</p>
          <p class="banner-desc">后续分析将以当前套餐权限进行</p>
        </div>
      </div>
      <button class="banner-dismiss" @click="emit('dismiss')" aria-label="关闭">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
      </button>
    </div>
  </Transition>
</template>

<style scoped>
.trial-ended-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px 12px 16px;
  margin-bottom: 12px;
  background: rgba(175, 82, 222, 0.07);
  border: 1px solid rgba(175, 82, 222, 0.18);
  border-left: 3px solid #AF52DE;
  border-radius: 14px;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif;
}

.banner-body {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.banner-icon {
  font-size: 13px;
  color: #AF52DE;
  margin-top: 1px;
  flex-shrink: 0;
}

.banner-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.banner-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #6c3faa;
  letter-spacing: -0.1px;
}

.banner-desc {
  margin: 0;
  font-size: 12px;
  color: rgba(108, 63, 170, 0.75);
}

.banner-dismiss {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  cursor: pointer;
  color: rgba(175, 82, 222, 0.55);
  border-radius: 50%;
  padding: 0;
  -webkit-tap-highlight-color: transparent;
  transition: opacity 0.15s;
}
.banner-dismiss:active {
  opacity: 0.6;
}

.trial-ended-banner-enter-active {
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.trial-ended-banner-leave-active {
  transition: all 0.2s ease-out;
}
.trial-ended-banner-enter-from,
.trial-ended-banner-leave-to {
  opacity: 0;
  transform: translateY(-6px);
  max-height: 0;
}
</style>
```

- [ ] **Step 2: Commit**
```bash
git add frontend/components/trial/ProTrialEndedBanner.vue
git commit -m "feat: add ProTrialEndedBanner iOS inline info card component"
```

---

## Task 6: Overhaul `useTrial.ts` composable

**Files:**
- Modify: `frontend/composables/useTrial.ts`

- [ ] **Step 1: Rewrite composable**

Replace the entire file with:

```typescript
import { ref } from 'vue'
import { useAuthStore } from '~/stores/auth'

export function useTrial() {
  const auth = useAuthStore()

  const showGuestTrialEndedScreen = ref(false)
  const showProTrialWelcomeModal = ref(false)
  const showProTrialEndedBanner = ref(false)  // registered users who have used trial
  const trialActivated = ref(false)           // true from modal confirm until result returns

  // Called when user confirms the ProTrialWelcomeModal ("立即开始体验")
  function activateTrial() {
    trialActivated.value = true
    showProTrialWelcomeModal.value = false
  }

  // Called when analyze returns trial_expired error (belt-and-suspenders for guests)
  function handleGuestTrialExpired() {
    if (!auth.isLoggedIn) {
      showGuestTrialEndedScreen.value = true
    }
  }

  // Called on page load when registered user has already used their trial
  function handleRegisteredTrialExpired() {
    if (auth.isLoggedIn) {
      showProTrialEndedBanner.value = true
    }
  }

  function dismissGuestTrialScreen() {
    showGuestTrialEndedScreen.value = false
  }

  function dismissProTrialEndedBanner() {
    showProTrialEndedBanner.value = false
  }

  return {
    showGuestTrialEndedScreen,
    showProTrialWelcomeModal,
    showProTrialEndedBanner,
    trialActivated,
    activateTrial,
    handleGuestTrialExpired,
    handleRegisteredTrialExpired,
    dismissGuestTrialScreen,
    dismissProTrialEndedBanner,
  }
}
```

- [ ] **Step 2: Commit**
```bash
git add frontend/composables/useTrial.ts
git commit -m "feat: overhaul useTrial composable with trialActivated and registered trial banner"
```

---

## Task 7: Update `index.vue` — logic

**Files:**
- Modify: `frontend/pages/index.vue`

### 7a — History type and loadHistory

- [ ] **Step 1: Add `isProTrial` to history type definition (line ~85-89)**

```typescript
const history = ref<Array<{
  id: string; symbol: string; name: string; market: string;
  action?: string; confidence?: number; analyzedAt?: string;
  detail?: any; positionParams?: any; isProTrial?: boolean    // ADD isProTrial
}>>([])
```

- [ ] **Step 2: Map `is_pro_trial` in `loadHistory` (line ~235)**

```typescript
    history.value = rawItems.map((item: any) => ({
      id: String(item.id ?? `${item.symbol}_${item.analyzed_at || item.created_at}`),
      symbol: item.symbol,
      name: item.result?.data?.name || item.symbol,
      market: item.market,
      action: item.result?.result?.action,
      confidence: item.result?.result?.confidence,
      analyzedAt: item.analyzed_at || item.created_at,
      detail: item.result,
      positionParams: null,
      isProTrial: !!item.is_pro_trial,    // ADD
    }))
```

### 7b — Destructure new trial composable exports

- [ ] **Step 3: Update useTrial destructuring**

Find where `useTrial()` is called in `<script setup>` and **replace the entire destructuring** (removing old `dismissProTrialModal` and `handleProTrialConsumed`):
```typescript
const {
  showGuestTrialEndedScreen,
  showProTrialWelcomeModal,
  showProTrialEndedBanner,       // NEW
  trialActivated,                // NEW
  activateTrial,                 // NEW
  handleGuestTrialExpired,
  handleRegisteredTrialExpired,  // NEW
  dismissGuestTrialScreen,
  dismissProTrialEndedBanner,    // NEW
  // REMOVED: dismissProTrialModal (replaced by activateTrial)
  // REMOVED: handleProTrialConsumed (replaced by badge approach)
} = useTrial()
```

**Also search `index.vue` for any other references to `dismissProTrialModal` or `handleProTrialConsumed` and remove them.**

### 7c — Page load trigger (onMounted)

- [ ] **Step 4: Replace trial init block (lines ~256-265)**

```typescript
  // Show pro trial modal OR ended state on page load
  if (!auth.isLoggedIn) {
    if (trialState.value === 'available') {
      showProTrialWelcomeModal.value = true
    } else if (trialState.value === 'expired') {
      showGuestTrialEndedScreen.value = true  // proactive — no need to try analyzing
    }
  } else if (auth.isLoggedIn && auth.user &&
    (auth.user.tier === 'free' || auth.user.tier === 'basic')) {
    if (!auth.user.has_had_pro_trial) {
      showProTrialWelcomeModal.value = true
    } else {
      handleRegisteredTrialExpired()  // show dismissible banner
    }
  }
```

### 7d — Modal dismiss → activateTrial

- [ ] **Step 5: Change `@dismiss` handler on ProTrialWelcomeModal (line ~1202)**

```html
<TrialProTrialWelcomeModal v-if="showProTrialWelcomeModal" @dismiss="activateTrial"/>
```

### 7e — Trial in progress banner computed + result watch cleanup

- [ ] **Step 6: Add computed for banner visibility**

After existing computed values (around line 141):
```typescript
const showTrialInProgressBanner = computed(() =>
  trialActivated.value && isAnalyzing.value
)
```

- [ ] **Step 7: Clear `trialActivated` when result lands and add `isProTrial` to histItem (watch result, line ~269-297)**

```typescript
watch(result, (newResult) => {
  if (newResult) {
    const histItem = {
      id: `${analysisStore.symbol}_${Date.now()}`,
      symbol: analysisStore.symbol,
      name: newResult?.data?.name || analysisStore.symbol,
      market: analysisStore.market,
      action: newResult?.result?.action,
      confidence: newResult?.result?.confidence,
      analyzedAt: new Date().toISOString(),
      detail: newResult,
      positionParams: holdingQuantity.value ? {
        holdingQuantity: holdingQuantity.value,
        costPrice: costPrice.value,
        maxPosition: maxPosition.value,
      } : null,
      isProTrial: isFirstTrial.value,    // ADD
    }
    history.value = [histItem, ...history.value]
    selectedHistoryId.value = histItem.id
    sheetResult.value = newResult
    activePanel.value = 'result'
    resultSheetOpen.value = true
    unreadResults.value = 0
    fetchQuota()
    trialActivated.value = false    // ADD — clear after result lands
    // REMOVE: if (isFirstTrial.value) handleProTrialConsumed()
    stopNarrativeLoop()
    clearTimeout(analyzeTimeoutTimer)
  }
})
```

- [ ] **Step 8: Commit**
```bash
git add frontend/pages/index.vue
git commit -m "feat: update index.vue trial flow - page load triggers, banner computed, history badge"
```

---

## Task 8: Update `index.vue` — template

**Files:**
- Modify: `frontend/pages/index.vue` (template section)

### 8a — Add new banners to template

- [ ] **Step 1: Add `ProTrialInProgressBanner` (fixed, no placement in DOM flow)**

After the `<!-- ═══ PRO TRIAL WELCOME ═══ -->` block (line ~1202), add:
```html
    <!-- ═══ PRO TRIAL IN PROGRESS (floating capsule) ═══ -->
    <TrialProTrialInProgressBanner v-if="showTrialInProgressBanner" />
```

### 8b — Add ended banner inside analysis form area (BOTH layouts)

`index.vue` has two completely separate layout trees: `v-if="isDesktop"` (~line 447) and `v-else` (~line 736). The banner must appear in **both**.

- [ ] **Step 2a: Mobile layout** — Find the `activePanel === 'analyze'` section in the mobile branch and add the banner at the top of that panel container:
```html
    <!-- Pro trial ended info banner (registered users, mobile) -->
    <TrialProTrialEndedBanner
      v-if="showProTrialEndedBanner"
      @dismiss="dismissProTrialEndedBanner"
    />
```

- [ ] **Step 2b: Desktop layout** — Find the main content/form area inside the `v-if="isDesktop"` branch (the left-column input panel, ~line 470) and add the same banner at the top:
```html
    <!-- Pro trial ended info banner (registered users, desktop) -->
    <TrialProTrialEndedBanner
      v-if="showProTrialEndedBanner"
      @dismiss="dismissProTrialEndedBanner"
    />
```

### 8c — Add `isProTrial` badge to history cards

- [ ] **Step 3: Add badge in history card template (line ~1087, inside `.rg-card-info`)**

After the symbol chip row:
```html
                  <div style="display: flex; align-items: center; gap: 5px; margin-top: 1px;">
                    <span class="rg-card-symbol">{{ item.symbol }}</span>
                    <span v-if="item.market" class="rg-card-market-chip">{{ MARKET_LABELS[item.market] || item.market }}</span>
                  </div>
                  <!-- Pro trial badge -->
                  <div v-if="item.isProTrial" class="rg-card-pro-trial-badge">
                    <span>✦</span>
                    <span>专业版体验</span>
                  </div>
```

- [ ] **Step 4: Add badge CSS to the `<style>` block**

```css
.rg-card-pro-trial-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  margin-top: 3px;
  padding: 2px 7px;
  background: rgba(175, 82, 222, 0.1);
  color: #AF52DE;
  border: 1px solid rgba(175, 82, 222, 0.2);
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif;
}
```

- [ ] **Step 5: Commit**
```bash
git add frontend/pages/index.vue
git commit -m "feat: add trial banners and pro trial badge to index.vue template"
```

---

## Task 9: Polish existing trial components for iOS consistency

**Files:**
- Modify: `frontend/components/trial/GuestTrialEndedScreen.vue`

- [ ] **Step 1: Add safe-area bottom padding**

In `GuestTrialEndedScreen.vue`, find the outer fixed container and ensure it has:
```
padding-bottom: env(safe-area-inset-bottom, 24px)
```

- [ ] **Step 2: Commit**
```bash
git add frontend/components/trial/GuestTrialEndedScreen.vue
git commit -m "feat: add safe-area padding to GuestTrialEndedScreen"
```

---

## Verification Steps

- [ ] Start services: `powershell.exe -ExecutionPolicy Bypass -File start.ps1`
- [ ] **Guest first visit**: Open incognito → http://localhost:3000 → `ProTrialWelcomeModal` appears
- [ ] **Guest trial flow**: Click "立即开始体验" → submit analysis → floating capsule `✦ 专业版体验中` appears at top → result comes back → capsule disappears → result card has `✦ 专业版体验` badge
- [ ] **Guest return visit**: Reload page → `GuestTrialEndedScreen` shows immediately (without trying to analyze)
- [ ] **Registered free user first**: Login as free user (`has_had_pro_trial=false`) → `ProTrialWelcomeModal` shows
- [ ] **Registered free user return**: Login as free user (`has_had_pro_trial=true`) → info banner at top of form, form still usable
- [ ] **History badge from DB**: When logged-in user loads history, items with `is_pro_trial=true` show the badge
- [ ] **Mobile + desktop**: Check at 375px and 1280px widths — capsule and banner render correctly
