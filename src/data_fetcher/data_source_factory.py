"""
数据源工厂 - 完全基于 TqSDK
创建 TqSDK 客户端和执行器
"""

from loguru import logger
from typing import Optional
import yaml
from pathlib import Path


class DataSourceFactory:
    """数据源工厂类 - 专注于 TqSDK"""

    @staticmethod
    def create_client(config: dict, api_keys_config: Optional[dict] = None):
        """
        创建 TqSDK 数据客户端

        Args:
            config: 交易配置
            api_keys_config: API密钥配置（可选）

        Returns:
            TqSdkClient 实例
        """
        from .tqsdk_client import TqSdkClient

        logger.info("创建 TqSDK 数据客户端")

        # 获取合约代码
        symbol = config['trading'].get('tqsdk_symbol', 'CZCE.SA0')

        # 获取认证信息
        username = None
        password = None
        use_sim = True

        if api_keys_config and 'tqsdk' in api_keys_config:
            tqsdk_config = api_keys_config['tqsdk']
            username = tqsdk_config.get('username')
            password = tqsdk_config.get('password')
            use_sim = tqsdk_config.get('use_sim', True)

        return TqSdkClient(
            symbol=symbol,
            auth_username=username,
            auth_password=password,
            use_sim=use_sim
        )

    @staticmethod
    def create_executor(config: dict, account, data_client=None, api_keys_config: Optional[dict] = None, use_mock: bool = False):
        """
        创建交易执行器

        Args:
            config: 交易配置
            account: 账户对象
            data_client: TqSDK 数据客户端
            api_keys_config: API密钥配置（未使用）
            use_mock: 是否使用模拟执行器（用于回测）

        Returns:
            TqSdkExecutor 或 MockExecutor 实例
        """
        if use_mock:
            logger.info("使用 MockExecutor 作为交易执行器（回测模式）")
            from trading.mock_executor import MockExecutor
            return MockExecutor(
                account=account,
                slippage_ticks=config['backtest']['slippage_ticks'],
                commission_rate=config['backtest']['commission_rate']
            )
        else:
            logger.info("使用 TqSdkExecutor 作为交易执行器")
            from trading.tqsdk_executor import TqSdkExecutor

            if data_client is None or not hasattr(data_client, '_api'):
                logger.error("TqSDK 执行器需要有效的 TqSDK 数据客户端")
                raise ValueError("TqSDK 执行器需要有效的数据客户端")

            # 确保 TqSDK API 已初始化
            if not data_client._connected:
                data_client._init_api()

            return TqSdkExecutor(
                account=account,
                tqsdk_api=data_client._api,
                commission_rate=config['backtest']['commission_rate']
            )


if __name__ == "__main__":
    # 测试代码
    config_path = Path(__file__).parent.parent.parent / "config" / "trading_params.yaml"
    keys_path = Path(__file__).parent.parent.parent / "config" / "api_keys.yaml"

    with open(config_path, 'r', encoding='utf-8') as f:
        config = yaml.safe_load(f)

    with open(keys_path, 'r', encoding='utf-8') as f:
        api_keys = yaml.safe_load(f)

    print("="*60)
    print("TqSDK 数据源工厂测试")
    print("="*60)

    try:
        # 创建 TqSDK 客户端
        client = DataSourceFactory.create_client(config, api_keys)
        print(f"✓ TqSDK 客户端创建成功: {type(client).__name__}")
        print(f"  合约代码: {config['trading'].get('tqsdk_symbol', 'CZCE.SA0')}")

        # 测试连接
        if client.test_connection():
            print("✓ TqSDK 连接测试通过")
        else:
            print("✗ TqSDK 连接测试失败")

    except Exception as e:
        print(f"✗ 创建 TqSDK 客户端失败: {e}")

    print("\n" + "="*60)
