# 日常运维手册

所有命令默认在服务器 `/opt/trader/` 目录执行。

---

## 查看服务状态

```bash
# 所有服务状态
docker compose ps

# 实时日志（Ctrl+C 退出）
docker compose logs -f

# 指定服务日志
docker compose logs -f backend
docker compose logs -f worker
docker compose logs -f data-collector

# 最近 100 行日志
docker compose logs --tail=100 backend
```

---

## 更新部署

```bash
cd /opt/trader

# 拉取最新代码（Git 方式）
git pull origin main

# 重新构建并重启
docker compose build
docker compose up -d

# 仅重启某个服务（不重新构建）
docker compose restart backend
docker compose restart worker
docker compose restart frontend
```

> **注意：** 修改了 Python 依赖（`requirements.txt`）或前端依赖（`package.json`）后必须 `build`，否则只需 `up -d`。

---

## 数据库操作

### 备份

```bash
# 备份 PostgreSQL（推荐每日执行）
docker compose exec postgres pg_dump -U trader trader > /opt/backups/trader_$(date +%Y%m%d_%H%M).sql

# 创建备份目录
mkdir -p /opt/backups
```

**设置每日自动备份（crontab）：**

```bash
crontab -e
```
添加：
```
0 3 * * * cd /opt/trader && docker compose exec -T postgres pg_dump -U trader trader > /opt/backups/trader_$(date +\%Y\%m\%d).sql 2>&1
0 4 * * * find /opt/backups -name "*.sql" -mtime +30 -delete   # 保留 30 天
```

### 恢复

```bash
# 从备份恢复（会覆盖现有数据！）
docker compose exec -T postgres psql -U trader trader < /opt/backups/trader_20260310.sql
```

### 进入数据库

```bash
docker compose exec postgres psql -U trader trader
```

常用 SQL：

```sql
-- 查看用户列表
SELECT id, email, subscription_tier, daily_usage, bonus_quota, created_at FROM users ORDER BY id DESC LIMIT 20;

-- 查看今日分析次数
SELECT DATE(analyzed_at), COUNT(*) FROM analysis_histories WHERE analyzed_at >= CURRENT_DATE GROUP BY 1;

-- 重置某用户每日配额
UPDATE users SET daily_usage = 0 WHERE email = 'user@example.com';

-- 手动设置用户套餐
UPDATE users SET subscription_tier = 'premium' WHERE email = 'user@example.com';
```

---

## 配额管理（Admin API）

> 需要在 `backend/.env` 中配置 `ADMIN_TOKEN`。

### 查看用户列表

```bash
curl https://yourdomain.com/api/admin/users \
  -H "x-admin-token: $ADMIN_TOKEN"
```

### 设置用户配额

```bash
# 重置今日使用量（daily_usage=0 表示今天还没用过）
curl -X PATCH https://yourdomain.com/api/admin/users/{user_id}/quota \
  -H "Content-Type: application/json" \
  -H "x-admin-token: $ADMIN_TOKEN" \
  -d '{"daily_usage": 0}'

# 设置永久额外配额（bonus_quota，不受每日限制）
curl -X PATCH https://yourdomain.com/api/admin/users/{user_id}/quota \
  -H "Content-Type: application/json" \
  -H "x-admin-token: $ADMIN_TOKEN" \
  -d '{"bonus_quota": 50}'

# 同时设置两者
curl -X PATCH https://yourdomain.com/api/admin/users/{user_id}/quota \
  -H "Content-Type: application/json" \
  -H "x-admin-token: $ADMIN_TOKEN" \
  -d '{"daily_usage": 0, "bonus_quota": 100}'
```

### 修改用户套餐

```bash
curl -X PATCH https://yourdomain.com/api/admin/users/{user_id} \
  -H "Content-Type: application/json" \
  -H "x-admin-token: $ADMIN_TOKEN" \
  -d '{"subscription_tier": "premium"}'
```

### 查看仪表盘统计

```bash
curl https://yourdomain.com/api/admin/dashboard \
  -H "x-admin-token: $ADMIN_TOKEN"
```

---

## Redis 运维

```bash
# 进入 Redis CLI
docker compose exec redis redis-cli

# 常用命令
PING                          # 检查连通性
KEYS task:*                   # 查看待处理/已完成任务
KEYS analysis_cache:*         # 查看分析缓存
GET task:{task_id}            # 查看某个任务状态
DEL analysis_cache:*          # 清空分析缓存（下次分析会重新调用 LLM）
INFO memory                   # 查看内存使用
DBSIZE                        # 查看 key 总数
```

### 清空全部缓存（不影响任务队列）

```bash
docker compose exec redis redis-cli --scan --pattern "analysis_cache:*" | xargs docker compose exec -T redis redis-cli DEL
```

---

## 市场数据管理

### 查看数据采集状态

```bash
curl https://yourdomain.com/api/admin/market-data/status \
  -H "x-admin-token: $ADMIN_TOKEN"
```

### 手动触发数据更新

```bash
curl -X POST https://yourdomain.com/api/admin/market-data/refresh \
  -H "x-admin-token: $ADMIN_TOKEN"
```

### 管理自选股监控列表

```bash
# 查看当前监控列表
curl https://yourdomain.com/api/admin/watchlist \
  -H "x-admin-token: $ADMIN_TOKEN"

# 更新监控列表
curl -X POST https://yourdomain.com/api/admin/watchlist \
  -H "Content-Type: application/json" \
  -H "x-admin-token: $ADMIN_TOKEN" \
  -d '{"symbols": [{"symbol": "600519", "market": "a"}, {"symbol": "00700", "market": "hk"}]}'
```

---

## 故障处理

### 服务异常重启

```bash
# 重启单个服务
docker compose restart backend
docker compose restart worker

# 完全停止后重启
docker compose down
docker compose up -d
```

### Worker 停止处理任务

```bash
# 检查 Worker 日志
docker compose logs --tail=50 worker

# 检查 Redis 连接
docker compose exec redis redis-cli ping

# 重启 Worker
docker compose restart worker
```

### 磁盘空间不足

```bash
# 查看磁盘使用
df -h

# 清理 Docker 无用资源
docker system prune -f

# 清理旧日志（Docker 日志）
docker compose logs --no-log-prefix backend > /dev/null  # 触发轮转
find /var/lib/docker/containers -name "*.log" -size +100M

# 清理旧备份（保留最近 7 天）
find /opt/backups -name "*.sql" -mtime +7 -delete
```

### PostgreSQL 连接数耗尽

```bash
# 查看当前连接数
docker compose exec postgres psql -U trader -c "SELECT count(*) FROM pg_stat_activity;"

# 终止空闲连接
docker compose exec postgres psql -U trader -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'idle' AND query_start < now() - interval '5 minutes';"
```

---

## 监控建议

### 简单监控脚本（crontab 每 5 分钟执行）

```bash
cat > /opt/trader/health-check.sh << 'EOF'
#!/bin/bash
DOMAIN="yourdomain.com"
STATUS=$(curl -sf "https://$DOMAIN/api/health" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null)
if [ "$STATUS" != "ok" ]; then
  echo "[$(date)] Health check FAILED: $STATUS" >> /var/log/trader-health.log
  # 可选：发送告警通知
  cd /opt/trader && docker compose restart backend worker
fi
EOF
chmod +x /opt/trader/health-check.sh
```

```bash
crontab -e
# 添加：
*/5 * * * * /opt/trader/health-check.sh
```

---

## 扩容建议

| 场景 | 措施 |
|------|------|
| 并发分析需求大 | 增加 `worker` 实例数：`docker compose up -d --scale worker=3` |
| 数据库读压力大 | 为 PostgreSQL 添加只读副本（超出本文范围） |
| Redis 内存不足 | 在 `docker-compose.yml` 中为 Redis 加 `maxmemory 512mb` 配置 |
| 服务器内存不足 | 升级 ECS 到 8G/16G，或将 PostgreSQL 迁移到 RDS |
