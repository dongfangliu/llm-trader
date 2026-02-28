# LLM 交易策略分析器 - 开发进度文档

## 项目概述

基于 Python 的 LLM 量化交易策略分析系统，目标部署为 Web 服务，面向小红书散户。

---

## 一、当前状态总览

| 模块 | 状态 | 说明 |
|------|------|------|
| 后端 API | ⚠️ 部分完成 | 基础框架完成，部分功能待完善 |
| 前端 Next.js | ❌ 不可用 | 路由配置有问题，需要修复 |
| 用户系统 | ⚠️ 部分完成 | 基础登录可用，微信登录未集成 |
| 套餐系统 | ❌ 未实现 | 套餐页面有，但无法真正购买 |
| API 配置 | ❌ 未实现 | 用户需手动输入 API Key |

---

## 二、后端实现情况

### ✅ 已完成

1. **FastAPI 基础框架**
   - `backend/src/api/main.py` - 主应用
   - CORS 中间件配置
   - 健康检查端点 `/api/health`

2. **用户认证**
   - `POST /api/auth/login` - 登录（自动生成 OpenID）
   - `GET /api/auth/me` - 获取用户信息
   - JWT Token 生成和验证

3. **每日次数限制**
   - 免费版: 1次/天
   - 基础版: 5次/天
   - 高级版: 15次/天
   - 每日 0 点重置

4. **数据服务**
   - `GET /api/market/a/{symbol}` - A股数据
   - `GET /api/market/hk/{symbol}` - 港股数据
   - `GET /api/market/us/{symbol}` - 美股数据
   - 技术指标计算 (MA/RSI/ATR/MACD)

5. **LLM 分析**
   - `POST /api/analyze` - 分析接口
   - 支持 OpenAI 兼容 API (DeepSeek 等)
   - JSON 格式返回结果

6. **数据库**
   - SQLite + SQLAlchemy 异步
   - 用户模型、订阅模型

### ❌ 未完成 / 需要修复

1. **微信登录** - 暂用模拟 OpenID
2. **Ko-fi 支付集成** - 手动升级订阅
3. **期货数据** - 代码有但未测试
4. **定时任务** - 原有的 jobs.py 未迁移

---

## 三、前端实现情况

### ✅ 已完成

1. **项目结构**
   - Next.js 14 + TypeScript
   - Zustand 状态管理
   - Axios HTTP 客户端
   - 基础样式

2. **页面**
   - `/login` - 登录页面
   - `/` - 分析主页

### ❌ 未完成 / 有问题

1. **路由问题**
   - 问题：`/api/auth/login` 被 Next.js 误认为是页面路由
   - 原因：Next.js App Router 捕获了所有路径
   - 解决：需要配置 Next.js 代理或使用独立 API 路径

2. **微信登录按钮**
   - 显示"微信一键登录"但实际是模拟登录
   - 需要集成微信 OAuth2

3. **套餐购买**
   - 页面有显示套餐信息
   - 点击无法真正购买
   - 需要对接 Ko-fi 或手动升级

4. **API Key 管理**
   - 用户需要每次手动输入 API Key
   - 应该支持用户保存自己的 API Key

5. **数据图表**
   - 只有文字结果
   - 需要添加 K 线图表

6. **响应式布局**
   - 基础响应式，但细节需要优化

---

## 四、待实现功能清单

### P0 - 必须修复（阻断问题）

- [ ] **修复前端路由问题** - `/api/*` 路径被 Next.js 拦截
- [ ] **确保前后端通信正常** - 前端能正确调用后端 API

### P1 - 核心功能

- [ ] 集成微信登录 (WeChat OAuth2)
- [ ] Ko-fi 支付集成
- [ ] 用户 API Key 保存和管理
- [ ] 订阅套餐自动升级

### P2 - 增强功能

- [ ] K 线图表展示
- [ ] 历史分析记录
- [ ] 用户个人中心
- [ ] 期货数据支持完善

### P3 - 优化

- [ ] 响应式 UI 优化
- [ ] 加载状态优化
- [ ] 错误提示优化

---

## 五、启动指南

### 本地开发

```bash
# 1. 启动后端
cd backend
set PYTHONPATH=src
python -m uvicorn src.api.main:app --port 8000

# 2. 启动前端
cd frontend
npm run dev
```

### Docker 部署

```bash
docker-compose up -d
```

---

## 六、配置文件

### 后端环境变量

文件: `backend/.env`

```bash
DATABASE_URL=sqlite+aiosqlite:///./data/trader.db
SECRET_KEY=change-this-to-random-key
ACCESS_TOKEN_EXPIRE_MINUTES=10080
```

### 前端环境变量

文件: `frontend/.env`

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## 七、API 文档

启动后端后访问: http://localhost:8000/docs

### 主要接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/auth/login | 用户登录 |
| GET | /api/auth/me | 获取当前用户 |
| GET | /api/analyze/limits | 获取每日限额 |
| POST | /api/analyze | LLM 分析 |
| GET | /api/market/{market}/{symbol} | 获取市场数据 |
| GET | /api/health | 健康检查 |

---

## 八、下次工作安排

1. **优先修复**: 前端路由问题，确保前后端联调正常
2. **核心功能**: 微信登录 + API Key 管理
3. **支付对接**: Ko-fi 集成

---

*文档更新: 2026-02-28*
*版本: v0.1 - 开发中*
