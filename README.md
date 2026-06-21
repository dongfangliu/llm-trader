# K线AI分析助手

LLM 驱动的 A股 / 港股 / 美股 / 期货技术分析 SaaS。

## 快速导航

| 文档 | 说明 |
|------|------|
| [本地开发](docs/local-dev.md) | Windows 本地启动、调试 |
| [阿里云部署](docs/deploy-aliyun.md) | 生产环境完整部署指南 |
| [日常运维](docs/maintenance.md) | 备份、更新、监控、故障处理 |
| [管理后台](docs/admin.md) | Admin API、用户配额管理 |

## 架构一览

```
用户浏览器
    │
    └── Nginx (80/443)
           │
           └── frontend:3000  (Nuxt 3)
                    │
                    ├── /api/* 代理 → backend:8000 (FastAPI)
                    └── /ws/*  代理 → backend:8000 (WebSocket)
                                          │
                                    ┌─────┴──────┐
                               redis:6379     postgres:5432
                                    │
                               worker (arq)  ← LLM API
                          data-collector     ← AKShare
```

## 服务说明

| 服务 | 端口 | 说明 |
|------|------|------|
| `frontend` | 3000 | Nuxt 3，用户界面 |
| `backend` | 8000 | FastAPI，REST API + WebSocket |
| `worker` | — | arq 后台 Worker，执行 LLM 分析 |
| `redis` | 6379 | 任务队列 + 分析结果缓存 |
| `postgres` | 5432 | 主数据库（用户、历史、行情）|
| `data-collector` | — | 定时拉取 AKShare 行情数据 |
