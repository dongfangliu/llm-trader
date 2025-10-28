"""
FastAPI应用入口
提供RESTful API和WebSocket实时推送
"""

import sys
import asyncio
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from loguru import logger

# 添加web_v2目录到路径，以便导入server模块
web_v2_root = Path(__file__).parent.parent
sys.path.insert(0, str(web_v2_root))

# 添加项目根目录到路径，以便导入src模块
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from server.api import kline, account, signal, control, system, config, tick, timeshare
from server.api import market_regime, strategy, order_flow, llm_expert, backtest, debug
from server.core.websocket import WebSocketManager
from server.core.bridge import bridge
from server.utils.config import settings


# 配置日志
logger.remove()

# Windows console UTF-8 support
import io
import platform
if platform.system() == "Windows":
    # 使用UTF-8编码包装stdout，避免emoji字符错误
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

logger.add(
    sys.stdout,
    colorize=True,
    format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan> | <level>{message}</level>",
    level="DEBUG" if settings.DEBUG else "INFO"
)
# Ensure logs directory exists
logs_dir = Path(__file__).parent / "logs"
logs_dir.mkdir(parents=True, exist_ok=True)
logger.add(
    str(logs_dir / "api_{time}.log"),
    rotation="10 MB",
    retention="7 days",
    level="INFO",
    format="{time:YYYY-MM-DD HH:mm:ss} | {level: <8} | {name}:{function} | {message}",
    enqueue=True,  # Thread-safe logging (prevents Windows file locking issues)
    encoding="utf-8"
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    logger.info("=" * 60)
    logger.info("🚀 Trading System API 启动中...")
    logger.info("=" * 60)

    # ⚠️ 重要：先启动RealtimePushService
    logger.info("1️⃣ 启动实时推送服务...")
    from server.services.realtime_push_service import get_push_service
    push_service = get_push_service(
        ws_manager=ws_manager,
        event_loop=asyncio.get_event_loop()
    )
    push_service.start()

    # 等待推送服务初始化完成（等待缓存填充）
    await asyncio.sleep(2)  # 给TqSDK连接和数据订阅留出时间

    # 2️⃣ 再初始化Bridge（依赖推送服务的缓存）
    logger.info("2️⃣ 初始化数据桥接层...")
    bridge.init_connections()

    logger.info(f"✅ API服务启动成功")
    logger.info(f"📝 交互式文档: http://{settings.HOST}:{settings.PORT}/docs")
    logger.info(f"📚 ReDoc文档: http://{settings.HOST}:{settings.PORT}/redoc")
    logger.info(f"🔌 WebSocket: ws://{settings.HOST}:{settings.PORT}/ws")
    logger.info("=" * 60)

    yield

    # 关闭时清理
    logger.info("🛑 Trading System API 关闭中...")
    push_service.stop()


# WebSocket管理器（需要在lifespan之前创建）
ws_manager = WebSocketManager()


# 创建FastAPI应用
app = FastAPI(
    title="Trading System API",
    description="LLM量化交易系统 RESTful API",
    version="2.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)


# CORS中间件
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# 注册路由
app.include_router(kline.router, prefix="/api/v1/kline", tags=["K线数据"])
app.include_router(tick.router, prefix="/api/v1/tick", tags=["Tick数据"])
app.include_router(timeshare.router, prefix="/api/v1/timeshare", tags=["分时图"])
app.include_router(account.router, prefix="/api/v1/account", tags=["账户管理"])
app.include_router(signal.router, prefix="/api/v1/signal", tags=["交易信号"])
app.include_router(control.router, prefix="/api/v1/control", tags=["交易控制"])
app.include_router(system.router, prefix="/api/v1/system", tags=["系统监控"])
app.include_router(config.router, prefix="/api/v1", tags=["配置管理"])

# V4架构新增API
app.include_router(market_regime.router, prefix="/api/v1/market-regime", tags=["市场态势"])
app.include_router(strategy.router, prefix="/api/v1/strategy", tags=["策略表现"])
app.include_router(order_flow.router, prefix="/api/v1/order-flow", tags=["订单流分析"])
app.include_router(llm_expert.router, prefix="/api/v1/llm", tags=["LLM专家系统"])
app.include_router(backtest.router, prefix="/api/v1/backtest", tags=["回测系统"])

# 调试工具API
app.include_router(debug.router, tags=["数据调试"])


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket连接端点"""
    await ws_manager.connect(websocket)


# 根路由
@app.get("/", tags=["Root"])
async def root():
    """API根路径"""
    return {
        "name": "Trading System API",
        "version": "2.0.0",
        "docs": "/docs",
        "status": "running"
    }


# 健康检查
@app.get("/health", tags=["Health"])
async def health_check():
    """健康检查端点"""
    return {
        "status": "healthy",
        "service": "trading-api",
        "version": "2.0.0"
    }


# 全局异常处理
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """全局异常处理"""
    logger.error(f"未捕获异常: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "code": 500,
            "message": "Internal server error",
            "detail": str(exc) if settings.DEBUG else "An error occurred"
        }
    )


if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        log_level="info"
    )
