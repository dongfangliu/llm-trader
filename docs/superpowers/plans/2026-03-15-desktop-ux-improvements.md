# Desktop UX Improvements Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:executing-plans to implement this plan.

**Goal:** Fix 5 desktop UX issues: trial deep analysis display, premium upgrade cards, background analysis with history spinners, desktop share modal, and mobile multi-entry analysis.

**Architecture:** All changes confined to `page.tsx`, `Toast.tsx`, `SharePreviewSheet.tsx`, and `globals.css`. No backend changes. Background analysis replaces the loading-panel state machine with an `analyzingItemIds` Set.

**Tech Stack:** Next.js 14, TypeScript, React hooks, CSS animations

---

## Chunk 1: Toast onClick extension + result display tier fix

### Task 1: Extend Toast to support onClick callbacks

**Files:**
- Modify: `frontend/src/components/Toast.tsx`

- [ ] Add `onClick?: () => void` to `ToastState`, wire it to the DOM element, add third param to `show()`:

```tsx
interface ToastState {
  msg: string;
  type: ToastType;
  onClick?: () => void;
}

export function Toast({ toast }: { toast: ToastState | null }) {
  if (!toast) return null;
  return (
    <div
      onClick={toast.onClick}
      style={{
        position: 'fixed',
        bottom: '1.5rem',
        right: '1.5rem',
        zIndex: 9999,
        padding: '0.75rem 1.25rem',
        borderRadius: '0.5rem',
        background: BG[toast.type],
        color: '#fff',
        fontSize: '0.875rem',
        boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
        maxWidth: '24rem',
        lineHeight: 1.5,
        pointerEvents: toast.onClick ? 'auto' : 'none',
        cursor: toast.onClick ? 'pointer' : 'default',
      }}
    >
      {ICON[toast.type]} {toast.msg}
    </div>
  );
}

export function useToast(durationMs = 3500) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const show = useCallback(
    (msg: string, type: ToastType = 'info', onClick?: () => void) => {
      setToast({ msg, type, onClick });
      setTimeout(() => setToast(null), durationMs);
    },
    [durationMs],
  );
  return { toast, show };
}
```

- [ ] Commit: `git add frontend/src/components/Toast.tsx && git commit -m "feat: extend Toast with onClick callback support"`

### Task 2: Fix result panel using resultDisplayTier instead of effectiveTier

**Files:**
- Modify: `frontend/src/app/page.tsx` (result panel section, ~lines 2082–2380)

- [ ] In the result panel (`activePanel === 'result'`), find every condition that gates premium content and swap `effectiveTier` → `resultDisplayTier`:
  - Share button variant: `effectiveTier === 'free'` → `resultDisplayTier === 'free'`
  - Signal block: `effectiveTier === 'free'` → `resultDisplayTier === 'free'`
  - Deep analysis tabs block: `effectiveTier !== 'free'` → `resultDisplayTier !== 'free'`
  - Risk factors + indicators section: `effectiveTier !== 'free'` → `resultDisplayTier !== 'free'`
  - Position advice section: `effectiveTier !== 'free'` → `resultDisplayTier !== 'free'`
  - Desktop upgrade banners: keep `effectiveTier` here (these should reflect current subscription, not result tier)
  - Mobile UpgradeNudge: keep `effectiveTier`

- [ ] Commit: `git add frontend/src/app/page.tsx && git commit -m "fix: use resultDisplayTier for result panel display, not effectiveTier"`

---

## Chunk 2: Premium analyze form — no upgrade cards for premium users

### Task 3: Remove yellow promo box for premium users on analyze form

**Files:**
- Modify: `frontend/src/app/page.tsx` (desktop analyze panel, ~lines 1308–1344)

- [ ] Replace the entire yellow box block with a conditional:

```tsx
{/* Premium holding inputs — plain section for premium, promo box for others */}
{(effectiveTier === 'basic' || effectiveTier === 'premium') && effectiveTier === 'premium' ? (
  /* Premium: clean holding inputs, no promo wrapper */
  <div className="form-group" style={{ marginBottom: '1rem' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
      <label className="label" style={{ marginBottom: 0 }}>持仓参数 <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: '0.8rem' }}>（可选）</span></label>
      <button className="btn btn-secondary" style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', minHeight: 'auto' }} onClick={() => setPremiumInputsOpen(v => !v)}>
        {premiumInputsOpen ? '收起' : '展开'}
      </button>
    </div>
    {premiumInputsOpen && (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
        <div className="form-group"><label className="label">持有数量(股)</label><input className="input" inputMode="numeric" value={holdingQuantity} onChange={e => setHoldingQuantity(e.target.value.replace(/\D/g,'').slice(0,10))} /></div>
        <div className="form-group"><label className="label">成本价</label><input className="input" inputMode="decimal" value={costPrice} onChange={e => { const v = e.target.value.replace(/[^\d.]/g,''); const parts = v.split('.'); setCostPrice(parts.length > 2 ? parts[0]+'.'+parts.slice(1).join('') : v.slice(0,15)); }} /></div>
        <div className="form-group"><label className="label">最大持仓(股)</label><input className="input" inputMode="numeric" value={maxPosition} onChange={e => setMaxPosition(e.target.value.replace(/\D/g,'').slice(0,10))} /></div>
      </div>
    )}
    <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.25rem' }}>3项都不填=默认空仓；若填写则3项必须全部填写。</p>
  </div>
) : (
  /* Non-premium: yellow promo box (existing code unchanged) */
  <div style={{ border: '1px solid #f59e0b', background: '#fffbeb', borderRadius: '0.75rem', padding: '0.9rem', marginBottom: '1rem' }}>
    {/* ... existing yellow box content ... */}
  </div>
)}
```

  Keep the existing yellow box content intact for non-premium. Only the wrapper condition changes.

- [ ] Commit: `git add frontend/src/app/page.tsx && git commit -m "feat: hide upgrade cards in analyze form for premium users"`

---

## Chunk 3: Background analysis — remove loading panel, add analyzingItemIds

### Task 4: Add AnalyzingPlaceholder type and analyzingItemIds state

**Files:**
- Modify: `frontend/src/app/page.tsx` (top of component, ~line 200–330)

- [ ] Add after the `SavedRecord` interface definition:

```ts
interface AnalyzingPlaceholder {
  id: string;
  symbol: string;
  name: string;
  market: string;
  analyzedAt: string;
  analyzing: true;
  action: undefined;
  confidence: undefined;
  detail: undefined;
  positionParams?: null;
}
```

- [ ] Change `history` state type from `any[]` to `(ReturnType<typeof toHistoryCardItem> | AnalyzingPlaceholder)[]`
  (In practice: `const [history, setHistory] = useState<any[]>([])` stays as `any[]` to avoid cascading type errors — add the interface as a comment doc instead, and add `analyzing?: boolean` to the items)

- [ ] Add new state after existing state declarations:
```ts
const [analyzingItemIds, setAnalyzingItemIds] = useState<Set<string>>(new Set());
```

- [ ] Remove `premiumPendingCount` state and all references to `setPremiumPendingCount` / `premiumPendingCount` (replaced by `analyzingItemIds.size`)

- [ ] Commit: `git add frontend/src/app/page.tsx && git commit -m "refactor: add analyzingItemIds state, remove premiumPendingCount"`

### Task 5: Refactor handleAnalyze to background model

**Files:**
- Modify: `frontend/src/app/page.tsx` (handleAnalyze function, ~lines 652–866)

- [ ] Replace `handleAnalyze` with the new background model:
  - Remove `setActivePanel('loading')` call
  - Remove `setAnalyzingSymbol(...)` (no longer needed for loading panel)
  - Remove `setAnalyzeTimedOut(false)` (no loading panel timeout UI)
  - Generate `tempId = \`analyzing_\${Date.now()}_\${symbol.trim().toUpperCase()}\``
  - Insert placeholder at head of history:
    ```ts
    const placeholder = {
      id: tempId, symbol: symbol.trim().toUpperCase(),
      name: symbol.trim().toUpperCase(), market,
      analyzedAt: new Date().toISOString(),
      analyzing: true as const,
      action: undefined, confidence: undefined, detail: undefined,
    };
    setHistory(prev => [placeholder, ...prev]);
    setAnalyzingItemIds(prev => new Set([...prev, tempId]));
    ```
  - For non-premium: keep `setIsAnalyzing(true)` for button disabled state
  - For premium: no longer track with `premiumPendingCount`, use `analyzingItemIds`
  - On success (`handleAnalysisResult`):
    - Build `realItem` as before
    - Replace placeholder: `setHistory(prev => [realItem, ...prev.filter(h => h.id !== tempId && h.id !== realItem.id)])`
    - Remove from set: `setAnalyzingItemIds(prev => { const s = new Set(prev); s.delete(tempId); return s; })`
    - Do NOT call `setActivePanel('result')` or `setResultSheetOpen(true)`
    - Call: `showToast(\`✅ \${realItem.name || realItem.symbol} 研判完成，点击查看\`, 'ok', () => { setResult(realItem.detail); setSelectedHistoryId(realItem.id); setAnalyzeStartedAt(realItem.analyzedAt); setActivePanel('result'); setResultSheetOpen(true); setActiveTab(0); })`
  - On error:
    - Remove placeholder: `setHistory(prev => prev.filter(h => h.id !== tempId))`
    - Remove from set: `setAnalyzingItemIds(prev => { const s = new Set(prev); s.delete(tempId); return s; })`
    - Show error toast (existing logic)
  - Remove 3-minute frontend timeout (no loading panel to show it on)
  - Keep WebSocket + polling logic unchanged

- [ ] Commit: `git add frontend/src/app/page.tsx && git commit -m "feat: background analysis — no loading panel takeover"`

### Task 6: Remove loading panel block and fix all activePanel === 'loading' references

**Files:**
- Modify: `frontend/src/app/page.tsx`

- [ ] Delete the entire `{activePanel === 'loading' && (...)}` block (~lines 1779–1927)

- [ ] Fix `maxWidth` conditional (line ~1172):
  ```ts
  maxWidth: activePanel === 'analyze' ? '820px' : '980px',
  ```

- [ ] Find and remove any remaining `activePanel === 'loading'` references in nav active-class conditions

- [ ] Remove `analyzingSymbol` state and `setAnalyzingSymbol` calls (was only used by loading panel)

- [ ] Remove `analyzeTimedOut` state and `setAnalyzeTimedOut` calls

- [ ] Commit: `git add frontend/src/app/page.tsx && git commit -m "refactor: remove loading panel, clean up activePanel references"`

### Task 7: History card analyzing spinner UI

**Files:**
- Modify: `frontend/src/app/page.tsx` (mobile history card render, ~lines 1953–2027)
- Modify: `frontend/src/app/page.tsx` (desktop history card render if applicable)

- [ ] In the mobile history card `<button>`:
  - Wrap with: `if (item.analyzing) cursor = 'default'`, disable onClick
  - Replace `rg-card-chevron` svg with spinner when `item.analyzing`:
    ```tsx
    {(item as any).analyzing ? (
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: 11, color: '#007aff', fontWeight: 500 }}>分析中</span>
        <div style={{ width: 12, height: 12, borderRadius: '50%', border: '2px solid #007aff', borderTopColor: 'transparent', animation: 'spin 0.9s linear infinite', flexShrink: 0 }} />
      </div>
    ) : (
      <svg className="rg-card-chevron" ...existing chevron... />
    )}
    ```
  - Card background for analyzing items: `rgba(0,122,255,0.04)` tint
  - `pointer-events: none` on analyzing cards
  - Show `—` for action badge when analyzing (or omit badge)

- [ ] Check if desktop result panel also renders a history list — if so apply same treatment

- [ ] Commit: `git add frontend/src/app/page.tsx && git commit -m "feat: analyzing spinner in history cards"`

---

## Chunk 4: Analyze button copy + mobile multi-entry

### Task 8: Update analyze button copy for background model

**Files:**
- Modify: `frontend/src/app/page.tsx`

- [ ] Desktop analyze button (~line 1347):
  ```tsx
  <button className="btn btn-primary" style={{ width: '100%', marginTop: '1rem' }}
    onClick={handleAnalyze}
    disabled={!symbol.trim() || (effectiveTier !== 'premium' && analyzingItemIds.size > 0)}
  >
    {analyzingItemIds.size > 0
      ? effectiveTier === 'premium'
        ? `开始分析  ·  进行中 ${analyzingItemIds.size}`
        : '分析中，请稍候...'
      : '开始分析'}
  </button>
  ```

- [ ] Mobile FAB button:
  ```tsx
  <button className="fab-btn" onClick={handleAnalyze}
    disabled={!symbol.trim() || (effectiveTier !== 'premium' && analyzingItemIds.size > 0)}
  >
    {analyzingItemIds.size > 0
      ? effectiveTier === 'premium'
        ? `开始分析 (${analyzingItemIds.size}进行中)`
        : '分析中...'
      : '开始分析'}
  </button>
  ```

- [ ] Add bottom nav "记录" tab badge dot when `analyzingItemIds.size > 0`:
  In BottomNav component or inline in the nav, add a 8px blue circle `position:absolute` on the tab icon

- [ ] Commit: `git add frontend/src/app/page.tsx && git commit -m "feat: analyze button copy reflects background analysis state"`

---

## Chunk 5: Desktop share centered modal

### Task 9: Add sps2-panel-desktop CSS class

**Files:**
- Modify: `frontend/src/styles/globals.css`

- [ ] Add after `.sps2-panel-out` block:

```css
/* Desktop modal variant */
.sps2-root-desktop {
  position: fixed; inset: 0; z-index: 1100;
  background: rgba(0,0,0,0.45);
  -webkit-backdrop-filter: blur(12px);
  backdrop-filter: blur(12px);
  display: flex; align-items: center; justify-content: center;
}
.sps2-panel-desktop {
  position: relative;
  width: min(480px, 90vw);
  max-height: 85vh;
  background: #0c0c12;
  border-radius: 20px;
  overflow-y: auto;
  display: flex; flex-direction: column;
  animation: sps2-modal-in 0.28s cubic-bezier(0.34,1.56,0.64,1) forwards;
  box-shadow: 0 24px 80px rgba(0,0,0,0.55);
}
.sps2-panel-desktop-out {
  animation: sps2-modal-out 0.18s ease-in forwards;
}
@keyframes sps2-modal-in {
  from { opacity: 0; transform: scale(0.92); }
  to   { opacity: 1; transform: scale(1); }
}
@keyframes sps2-modal-out {
  from { opacity: 1; transform: scale(1); }
  to   { opacity: 0; transform: scale(0.95); }
}
```

- [ ] Commit: `git add frontend/src/styles/globals.css && git commit -m "feat: add sps2 desktop modal CSS classes"`

### Task 10: Add isDesktop prop to SharePreviewSheet

**Files:**
- Modify: `frontend/src/components/SharePreviewSheet.tsx`

- [ ] Add `isDesktop?: boolean` to props interface

- [ ] Swap root class and panel class based on `isDesktop`:
  - Root: `sps2-root` → `sps2-root-desktop` when isDesktop
  - Panel: `sps2-panel` (+ `sps2-panel-out`) → `sps2-panel-desktop` (+ `sps2-panel-desktop-out`) when isDesktop

- [ ] When `isDesktop`: remove `<div className="sps2-handle-zone">` (no drag handle on desktop)

- [ ] Backdrop close (click on root div) must call `dismiss()` not `onClose()` — this is already the case since `onClick={dismiss}` is on `.sps2-root`; verify it still works for desktop root div

- [ ] Commit: `git add frontend/src/components/SharePreviewSheet.tsx && git commit -m "feat: SharePreviewSheet desktop centered modal variant"`

### Task 11: Pass isDesktop to SharePreviewSheet in page.tsx

**Files:**
- Modify: `frontend/src/app/page.tsx`

- [ ] Find all `<SharePreviewSheet` usages, add `isDesktop={isDesktop}` prop

- [ ] Commit: `git add frontend/src/app/page.tsx && git commit -m "feat: pass isDesktop to SharePreviewSheet"`

---

## Chunk 6: Integration testing

### Task 12: Start services and browser test

- [ ] Start frontend: `powershell.exe -ExecutionPolicy Bypass -File start.ps1 -Service frontend`
- [ ] Open http://localhost:3000 in browser
- [ ] Test checklist:
  - [ ] Trial user: analyze → result shows deep analysis tabs (market_diagnosis etc.)
  - [ ] Premium user: analyze form shows plain holding inputs, no yellow promo box
  - [ ] Non-premium user: analyze form still shows yellow promo box with upgrade button
  - [ ] Any user: submit analysis → stays on current panel, history card shows spinner → toast on completion
  - [ ] Premium user: can submit second analysis while first is in progress
  - [ ] Click completion toast → result panel opens for that item
  - [ ] Desktop share button → centered modal popup (not bottom sheet)
  - [ ] Modal backdrop click → closes with animation
- [ ] Fix any issues found, retest
