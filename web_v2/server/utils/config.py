"""
配置管理
"""

from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    """应用配置"""
    
    # 应用配置
    APP_NAME: str = "Trading System API"
    VERSION: str = "2.0.0"
    DEBUG: bool = True
    
    # 服务器配置
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    
    # CORS配置
    CORS_ORIGINS: List[str] = ["http://localhost:3000", "http://localhost:5173"]
    
    # 数据库配置
    DATABASE_PATH: str = "../data/market_data.db"
    
    # 数据推送配置
    WEBSOCKET_PUSH_INTERVAL: float = 1.0  # 秒
    
    # 交易系统连接
    USE_MOCK_DATA: bool = True  # 是否使用模拟数据
    
    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
