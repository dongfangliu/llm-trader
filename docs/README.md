# 文档索引

> LLM Trading Analyzer — AI 驱动的股票 / 期货分析平台

## 文档目录

| 文档 | 说明 |
|------|------|
| [pricing-tiers.md](./pricing-tiers.md) | 付费层级设计、功能矩阵、定价策略、小红书推广方案 |
| [architecture.md](./architecture.md) | 系统架构、技术栈、API 端点、数据库模型 |
| [local-dev.md](./local-dev.md) | 本地开发环境搭建与用户权限调试 |
| [admin.md](./admin.md) | 管理员操作：可视化界面、用户/设备 CRUD、系统设置 |
| [afdian.md](./afdian.md) | 爱发电订阅接入（API 验证模式 + Webhook 模式） |
| [deployment-backend.md](./deployment-backend.md) | 后端部署：阿里云 + Docker Compose（宝塔/Coolify） |
| [deployment-frontend.md](./deployment-frontend.md) | 前端部署：Vercel |
| [deployment-aliyun-hk.md](./deployment-aliyun-hk.md) | 🌏 推荐方案：阿里云香港 + Cloudflare 域名 + Vercel（无需备案） |

## 快速导航

- **第一次本地跑起来** → [local-dev.md](./local-dev.md)
- **查看付费层级设计** → [pricing-tiers.md](./pricing-tiers.md)
- **调试用户权限 / 订阅等级** → [local-dev.md § 调试用户权限](./local-dev.md#调试用户权限)
- **生产上线（推荐）** → [deployment-aliyun-hk.md](./deployment-aliyun-hk.md)
- **生产上线（Docker Compose）** → [deployment-backend.md](./deployment-backend.md) + [deployment-frontend.md](./deployment-frontend.md)
- **后台管理用户** → [admin.md](./admin.md)（可视化界面：`/admin`）
- **接入爱发电订阅** → [afdian.md](./afdian.md)
