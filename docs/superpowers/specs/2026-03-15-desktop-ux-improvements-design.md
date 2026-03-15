# Desktop UX Improvements — Design Spec
**Date**: 2026-03-15
**Scope**: `frontend/src/app/page.tsx`, `frontend/src/components/SharePreviewSheet.tsx`
**Design principle**: Apple / Jobs aesthetic — reduction, purpose, motion with meaning

---

## 1. Trial Version Shows Deep Analysis (Bug Fix)

### Problem
Desktop result panel uses `effectiveTier` (current runtime state) to decide whether to render premium content. After a trial analysis completes, `proTrialConsumed` is set to `true`, causing `effectiveTier` to revert to the user's actual tier (free/basic). This hides the deep analysis tabs and premium signal block even though the analysis was performed at premium quality.

Mobile already passes `tier={resultDisplayTier}` to ResultSheet and is correct.

### Fix
In the result panel (`activePanel === 'result'`), replace every `effectiveTier` reference used for **display decisions** with `resultDisplayTier`. The `effectiveTier` variable continues to control **submission gating** (what market/features can be submitted).

Affected lines in page.tsx result section:
- Signal block condition: `effectiveTier === 'free'` → `resultDisplayTier === 'free'`
- Deep analysis tabs condition: `effectiveTier !== 'free'` → `resultDisplayTier !== 'free'`
- Risk factors / indicators section: same swap
- Position advice section: same swap
- Upgrade banners section: same swap
- Share button variant (free vs premium): same swap

---

## 2. Premium Users: No Upgrade Cards in Analyze Page

### Problem
The yellow "专业版特别功能" promotional box renders for ALL desktop users, including actual premium subscribers. This is noise for paying users and undermines the premium experience.

### Fix
**Conditional rendering split in the analyze form (desktop-only section)**:

- `effectiveTier === 'premium'`: Render holding inputs directly as plain form fields, no yellow box, no promotional copy. Section header is a simple label "持仓参数（可选）" in the same weight as other form labels.
- `effectiveTier !== 'premium'`: Keep the yellow box exactly as-is, with "升级解锁" button.

The upgrade card grid (`{effectiveTier !== 'premium' && <div className="desktop-only">🔒 升级后解锁...`)` already correctly gates on `effectiveTier !== 'premium'` — no change needed there.

Note: `effectiveTier === 'premium'` is also true for active pro-trial users (`isRegisteredProTrial` or `isGuestTrial`). This is intentional — trial users should see the plain holding-input fields, not the upsell box.

---

## 3. Background Analysis — No Loading Panel Takeover

### Architecture

Remove the `activePanel === 'loading'` takeover entirely from `handleAnalyze`. Users stay on whatever panel they're currently viewing.

#### New types
```ts
// Discriminated union for history items
interface AnalyzingPlaceholder {
  id: string;       // tempId, e.g. "analyzing_1710000000000_AAPL"
  symbol: string;
  name: string;
  market: string;
  analyzedAt: string;
  analyzing: true;  // discriminant
  action: undefined;
  confidence: undefined;
  detail: undefined;
}
type HistoryEntry = ReturnType<typeof toHistoryCardItem> | AnalyzingPlaceholder;
```
`history` state type changes from `any[]` to `HistoryEntry[]`. The placeholder is inserted directly (bypasses `toHistoryCardItem`). History card rendering checks `item.analyzing === true` to show the spinner UI.

#### New state
```ts
const [analyzingItemIds, setAnalyzingItemIds] = useState<Set<string>>(new Set());
```

#### handleAnalyze flow (revised)
1. Validate inputs (unchanged)
2. Generate `tempId = \`analyzing_\${Date.now()}_\${symbol}\``
3. Insert placeholder into `history` head:
   ```ts
   { id: tempId, symbol, name: symbol, market, action: undefined,
     confidence: undefined, analyzedAt: new Date().toISOString(),
     analyzing: true }
   ```
4. Add `tempId` to `analyzingItemIds`
5. Submit `analyze(request)` → get `task_id`
6. Connect WebSocket / polling in background (no panel switch)
7. On **success**:
   - Build `realItem` from `taskData` (same shape as existing history items)
   - In a single `setHistory` call: replace placeholder (`id === tempId`) with `realItem`
   - In a single `setAnalyzingItemIds` call: remove `tempId` (use functional update with new Set)
   - `analyzeStartedAt` value = `taskData.analyzed_at || new Date().toISOString()` — captured in closure
   - `showToast('✅ ${name || symbol} 研判完成，点击查看', 'success', () => { /* open result */ })` — toast onClick callback opens result sheet for this item
   - Do NOT call `setActivePanel('result')` or `setResultSheetOpen(true)` automatically
8. On **error**:
   - In a single `setHistory` call: remove placeholder (`id === tempId`)
   - In a single `setAnalyzingItemIds` call: remove `tempId`
   - (Both removals happen in same React render cycle to avoid flash states)
   - `showToast(errorMessage, 'error')`

#### Loading panel and `activePanel` cleanup
The entire `{activePanel === 'loading' && (...)}` block (lines ~1779–1927) is removed. `activePanel` type narrows to `'analyze' | 'result'`.

All remaining `activePanel === 'loading'` references must be updated:
- `maxWidth` conditional (line ~1172): `activePanel === 'analyze' || activePanel === 'loading'` → `activePanel === 'analyze'`
- Desktop nav active-state class: drop `|| activePanel === 'loading'` arm
- Any other conditional referencing `'loading'`: remove or collapse

Both desktop and mobile use the same background analysis model — no loading overlay on either platform.

#### History card "analyzing" state

History card items with `item.analyzing === true`:
- Card background: `rgba(0,122,255,0.04)`
- Bottom-right: replace chevron with `分析中` label + 12px spinning circle (blue, `animation: spin 0.9s linear infinite`)
- Not clickable (`pointer-events: none`, `cursor: default`)
- Opacity: 0.75 on the action badge area (since action is unknown)
- Show symbol as title, name field shows "—"

#### Toast click-to-open
The `Toast` component and `ToastState` interface must be extended:
```ts
// ToastState gains:
onClick?: () => void

// useToast show() gains third argument:
show(msg: string, type?: 'success'|'error', onClick?: () => void): void
```
The Toast DOM element calls `onClick?.()` when clicked. When a completion toast is clicked:
1. Finds the history item by `realItemId` (captured in closure)
2. Sets `result(item.detail)`, `selectedHistoryId(realItemId)`, `analyzeStartedAt(item.analyzedAt)`
3. Switches to result panel (`setActivePanel('result')`) and opens result sheet (`setResultSheetOpen(true)`)

`analyzeStartedAt` is set to `taskData.analyzed_at || new Date().toISOString()` — the same value used when building the real history item — captured in the `handleAnalysisResult` closure and passed into the toast callback.

---

## 4. Premium Multi-Entry Analysis

### Desktop
No additional work needed. Without the loading panel, the analyze form is always accessible. The submit button copy:
- No pending tasks: `开始分析`
- 1+ pending tasks: `开始分析  ·  进行中 ${analyzingItemIds.size}` (gray secondary text)
- Button is never disabled due to pending tasks (for premium)
- Button is disabled for non-premium when `analyzingItemIds.size > 0`

Remove `premiumPendingCount` state — replaced by `analyzingItemIds.size`.

### Mobile
Same background model. FAB button:
- Premium, no pending: `开始分析`
- Premium, pending: `开始分析 (${analyzingItemIds.size}进行中)` — still tappable
- Non-premium, pending: FAB disabled + shows spinner, reverts when done

Bottom nav "记录" tab: show a blue badge dot (not count) when `analyzingItemIds.size > 0`. Implemented as a `position:absolute` 8px circle on the tab icon.

---

## 5. Desktop Share: Centered Modal Popup

### Behavior
- On desktop (`isDesktop === true`): render as centered modal over frosted backdrop
- On mobile: keep existing bottom-sheet behavior unchanged

### Visual design (Apple aesthetic)
- **Backdrop**: `position:fixed; inset:0; background:rgba(0,0,0,0.45); backdrop-filter:blur(12px)`
- **Card**: `position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); width:min(480px,90vw); max-height:85vh; overflow-y:auto; background:#fff; border-radius:20px; box-shadow:0 24px 80px rgba(0,0,0,0.35)`
- **Enter animation**: `scale(0.92) opacity(0)` → `scale(1) opacity(1)`, `0.28s cubic-bezier(0.34,1.56,0.64,1)` (spring)
- **Exit animation**: `scale(0.95) opacity(0)`, `0.18s ease-in`
- **Close**: × button top-right (32×32px, `border-radius:50%`, hover `background:#f2f2f7`); click backdrop also closes
- **Content layout**: same as current sheet — image preview centered, mode dots, meta strip, action buttons full-width

### Implementation
Add `isDesktop?: boolean` prop to `SharePreviewSheet`. When `isDesktop`:
- Replace `sps2-panel` class with inline modal styles (or `sps2-panel-desktop` CSS class)
- Replace slide-up animation (`sps2-panel-out`) with scale-fade animation
- Remove drag handle pill (desktop has no swipe-to-dismiss)
- Keep all internal logic (mode switching, download, archive) identical

**Close behavior**: Both the × button and backdrop click must call the same `dismiss()` function (which sets `closing = true` → waits for exit animation → calls `onClose()`). Backdrop click must NOT call `onClose()` directly — it must go through the `closing` animation state, identical to mobile behavior.

---

## Files to Change
| File | Changes |
|------|---------|
| `frontend/src/app/page.tsx` | Issues 1–4: result display tier fix, premium form redesign, background analysis state machine, button copy |
| `frontend/src/components/SharePreviewSheet.tsx` | Issue 5: isDesktop prop, modal rendering path |
| `frontend/src/app/globals.css` (or equivalent) | Add `.sps2-panel-desktop` CSS class for modal animation |

---

## Out of Scope
- Backend changes (none required)
- Multi-period analysis (existing TODO, untouched)
- Mobile ResultSheet component (unchanged)
