# FastAPI后端服务

专业的异步API服务，提供RESTful API和WebSocket实时推送

## 🚀 快速开始

```bash
# 安装依赖
pip install -r requirements.txt

# 启动开发服务器（自动重载）
python main.py

# 或使用uvicorn
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

## 📝 访问文档

- **交互式API文档（Swagger UI）**: http://localhost:8000/docs
- **ReDoc文档**: http://localhost:8000/redoc
- **WebSocket连接**: ws://localhost:8000/ws

## 📡 API端点

### K线数据
- `GET /api/v1/kline?period=1m&limit=500` - 获取K线数据

### 账户管理
- `GET /api/v1/account` - 获取账户信息
- `GET /api/v1/account/positions` - 获取持仓列表

### 交易信号
- `GET /api/v1/signal?limit=10` - 获取交易信号
- `GET /api/v1/signal/market_regime` - 获取市场状态
- `GET /api/v1/signal/order_flow` - 获取订单流

### 交易控制
- `POST /api/v1/control/emergency_close` - 紧急平仓
- `POST /api/v1/control/strategy/toggle` - 启用/禁用策略
- `POST /api/v1/control/trading/pause` - 暂停/恢复交易

### 系统监控
- `GET /api/v1/system/status` - 获取系统状态
- `GET /health` - 健康检查

## 🔌 WebSocket事件

### 客户端 → 服务端
```json
{
  "type": "subscribe",
  "channel": "kline"
}
```

### 服务端 → 客户端
```json
{
  "type": "realtime_update",
  "data": {
    "account": {...},
    "latest_kline": {...},
    "market_regime": {...}
  }
}
```

## 🛠️ 开发

```bash
# 格式化代码
black server/

# 类型检查
mypy server/

# 运行测试
pytest tests/
```

## 📦 依赖

- **FastAPI**: 现代高性能Web框架
- **Uvicorn**: ASGI服务器
- **Pydantic**: 数据验证
- **Loguru**: 优雅的日志库
- **WebSockets**: WebSocket支持
