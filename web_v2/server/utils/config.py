"""
配置管理
"""

from pydantic_settings import BaseSettings
from typing import List
from pathlib import Path
import yaml


def _read_use_mock_from_config() -> bool:
    """从 api_keys.yaml 读取配置，判断是否使用模拟数据"""
    try:
        # 获取项目根目录
        project_root = Path(__file__).parent.parent.parent.parent
        config_path = project_root / "config" / "api_keys.yaml"

        with open(config_path, 'r', encoding='utf-8') as f:
            config = yaml.safe_load(f)

        # use_sim=False 表示真实账户 → use_mock=False
        # use_sim=True 表示模拟账户 → use_mock=True (但仍从数据库读取)
        use_sim = config.get('tqsdk', {}).get('use_sim', True)

        # 注意：即使 use_sim=True (模拟账户)，我们仍然从数据库读取数据
        # 只有在开发/测试时才使用完全的 mock 数据
        return False  # 默认从数据库/TqSDK读取，不使用纯mock
    except Exception as e:
        print(f"⚠️ 读取配置失败: {e}，默认使用数据库数据")
        return False


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
    # 从配置文件读取，与 api_keys.yaml 中的 use_sim 保持一致
    USE_MOCK_DATA: bool = _read_use_mock_from_config()

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
