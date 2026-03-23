# 重写项目现状总结

**日期**: 2026-03-19
**分支**: `feature/full-rewrite`
**工作目录**: `C:\Users\Administrator\Desktop\trader\.worktrees\full-rewrite\`

---

## 项目背景

将原 Next.js + React 前端 + FastAPI monolith 后端，完全重写为 Nuxt 3 + Vue 3 前端 + FastAPI Clean Architecture 后端。

**原版参考代码位置**: `C:\Users\Administrator\Desktop\trader\frontend\src\`

---

## 当前状态

### ✅ 后端（已完成）

结构已全部重写为 Clean Architecture：
- `backend/src/config.py` — Pydantic Settings
- `backend/src/api/routers/` — auth, analyze, subscription, market, admin, config
- `backend/src/api/schemas/` — 所有 Pydantic 模型
- `backend/src/api/dependencies/` — auth, db
- `backend/src/services/` — auth_service, quota_service, trial_service, subscription_service, analysis_service
- `backend/src/models/` — SQLAlchemy 模型
- `backend/src/database/db.py` + `new_db.py`
- `backend/src/worker/` — arq worker
- `backend/src/services/data/` + `services/llm/` — 原样保留

后端 http://localhost:8000 运行正常，`/api/health` 返回 200。

### ⚠️ 前端（存在以下问题）

Docker 构建成功，http://localhost:3000 可访问，但有严重视觉问题。

---

## 前端待修复问题（按优先级）

### 🔴 问题1：主分析页 `pages/index.vue` 与原版差距大

**原版**: `C:\Users\Administrator\Desktop\trader\frontend\src\app\page.tsx` (1362行) + `src\components\mobile\MobileView.tsx` (1043行)

当前 `pages/index.vue` 只有 787 行，视觉细节严重缺失：
- iOS 样式不够地道，缺少很多细节
- 需要完全对照原版 MobileView.tsx 重做

**关键原版组件需要参考**:
- `src/components/mobile/MobileView.tsx` (1043行) — 完整移动端布局
- `src/components/ResultSheet.tsx` (810行) — 结果底部卡片
- `src/components/BottomNav.tsx` (113行) — 底部导航
- `src/components/HotStocksStrip.tsx` — 热门股票横条
- `src/components/MarketSegmented.tsx` — 市场切换控件
- `src/components/SymbolAutocomplete.tsx` — 股票代码输入
- `src/components/AdvancedSettingsPanel.tsx` — 高级设置面板
- `src/components/SignalHero.tsx` — 信号英雄区
- `src/components/HistorySheet.tsx` — 历史记录抽屉
- `src/components/SavedRecordsSheet.tsx` — 收藏记录抽屉
- `src/components/UserMenuSheet.tsx` — 用户菜单抽屉
- `src/styles/globals.css` (3288行) — 所有 CSS 类

### 🔴 问题2：桌面端布局完全未做

**原版**:
- `src/components/desktop/DesktopView.tsx` (483行) — 桌面三栏布局（侧边栏+主内容+结果面板）
- `src/components/desktop/DesktopSidebar.tsx` — 桌面侧边栏
- `src/components/desktop/UpgradeDesktopView.tsx` — 桌面升级页

当前 `components/layout/DesktopLayout.vue` 只是空架子，桌面端（>1024px）没有正确布局。
必须实现：≥1024px 时切换为桌面三栏布局，而非继续用移动端竖排布局。

### 🔴 问题3：Admin 页面几乎没有功能

**原版 admin 页面**（总计约 1707 行）:
- `src/app/admin/users/page.tsx` (661行) — 用户管理（搜索、编辑quota、tier badge、分页）
- `src/app/admin/settings/page.tsx` (578行) — 系统设置（LLM配置、价格设置、公告等）
- `src/app/admin/market-data/page.tsx` (453行) — 市场数据管理（触发采集、查看状态）
- `src/app/admin/page.tsx` (5行，重定向到 dashboard)
- `src/app/admin/devices/page.tsx` (10行，重定向)

当前新版 admin 页面：
- `pages/admin/index.vue` (89行) — 极简空壳
- `pages/admin/users.vue` (81行) — 极简空壳

**需要**完全重写 admin 模块，包括：
- admin 登录（独立 admin token，非 JWT）
- 用户列表（搜索、tier 修改、quota 编辑、封禁）
- 系统设置（运行时配置 KV 对）
- 市场数据管理（触发采集、查看各标的数据状态）

### 🟡 问题4：缺少 terms 和 privacy 页面

**原版**:
- `src/app/terms/page.tsx` — 服务条款
- `src/app/privacy/page.tsx` — 隐私政策

新版完全缺失，但 GuestTrialEndedScreen、register 等地方已有链接指向 `/terms` 和 `/privacy`，点击会 404。

### 🟡 问题5：部分 admin 后端 API 需检查

Admin 页面所需后端 API：
- `GET /api/admin/users` — 用户列表
- `PATCH /api/admin/users/{id}` — 修改用户（tier/quota）
- `GET /api/admin/settings` — 系统设置
- `POST /api/admin/settings` — 更新设置
- `GET /api/admin/market-data/status` — 市场数据状态
- `POST /api/admin/refresh-market-data` — 触发采集

需验证这些 API 是否在新后端中完整实现。

---

## 已完成的前端页面（相对较好）

| 页面/组件 | 行数 | 状态 |
|-----------|------|------|
| `components/trial/GuestTrialEndedScreen.vue` | 82 | ✅ 基本对标原版 |
| `components/trial/ProTrialWelcomeModal.vue` | 65 | ✅ 基本对标原版 |
| `pages/login.vue` | ~150 | ✅ 基本可用 |
| `pages/register.vue` | ~120 | ✅ 基本可用 |
| `pages/upgrade.vue` | 待查 | ⚠️ 需对照原版验证 |
| `pages/account.vue` | 待查 | ⚠️ 需对照原版验证 |
| `pages/verify-email.vue` | 待查 | ⚠️ 需验证 |

---

## 工作方式

**全部用 Docker**，绝不直接运行 `npm run dev` 或 `uvicorn`：
```bash
# 重建并启动（在 .worktrees/full-rewrite/ 目录下）
docker compose up --build -d

# 查看日志
docker compose logs -f frontend
docker compose logs -f backend

# 验证
curl http://localhost:8000/api/health
# 浏览器打开 http://localhost:3000
```

---

## 原版代码参考路径

```
原版 Next.js 前端:  C:\Users\Administrator\Desktop\trader\frontend\src\
  app/page.tsx                    — 主页状态机 (1362行)
  components/mobile/MobileView.tsx — 移动端完整布局 (1043行)
  components/desktop/DesktopView.tsx — 桌面端布局 (483行)
  components/desktop/DesktopSidebar.tsx
  components/ResultSheet.tsx       — 结果卡片 (810行)
  components/BottomNav.tsx
  components/HotStocksStrip.tsx
  components/MarketSegmented.tsx
  components/SymbolAutocomplete.tsx
  components/AdvancedSettingsPanel.tsx
  components/SignalHero.tsx
  components/HistorySheet.tsx
  components/SavedRecordsSheet.tsx
  components/UserMenuSheet.tsx
  styles/globals.css               — 所有样式 (3288行)
  app/admin/users/page.tsx         — 管理用户 (661行)
  app/admin/settings/page.tsx      — 系统设置 (578行)
  app/admin/market-data/page.tsx   — 市场数据 (453行)
  app/terms/page.tsx
  app/privacy/page.tsx
```

---

## 优先级顺序建议

1. **先修复 index.vue** — 对照 MobileView.tsx 完整重写，确保 iOS 风格完全一致
2. **实现桌面端布局** — 对照 DesktopView.tsx + DesktopSidebar.tsx 实现 ≥1024px 布局
3. **完整重写 admin 模块** — 对照原版三个 admin 页面（users/settings/market-data）
4. **添加 terms/privacy 页面** — 可以简单内容
5. **全链路测试** — Docker 重建，完整流程验证

---

## Git 状态

```
branch: feature/full-rewrite
worktree: C:\Users\Administrator\Desktop\trader\.worktrees\full-rewrite\
最近 commit: 8a7142b 修复一堆。
```
