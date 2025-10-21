"""
LLM客户端工厂类
"""

import os
import yaml
from typing import Optional, Union, Dict, Any
from pathlib import Path
from loguru import logger

from .claude_client import ClaudeClient
from .openai_client import OpenAIClient


class LLMFactory:
    """LLM客户端工厂"""

    @staticmethod
    def create_client(config_path: Optional[str] = None) -> Union[ClaudeClient, OpenAIClient]:
        """
        根据配置文件创建LLM客户端

        Args:
            config_path: 配置文件路径，默认为 config/api_keys.yaml

        Returns:
            LLM客户端实例
        """
        # 默认配置文件路径
        if config_path is None:
            config_path = Path(__file__).parent.parent.parent / "config" / "api_keys.yaml"

        # 读取API配置
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                api_config = yaml.safe_load(f)
        except Exception as e:
            logger.error(f"读取API配置文件失败: {e}")
            raise

        # 读取LLM参数配置
        try:
            trading_params_path = Path(config_path).parent / "trading_params.yaml"
            with open(trading_params_path, 'r', encoding='utf-8') as f:
                trading_params = yaml.safe_load(f)
                llm_params = trading_params.get('llm', {})
        except Exception as e:
            logger.warning(f"读取trading_params.yaml失败，使用默认参数: {e}")
            llm_params = {}

        # 获取provider（默认claude）
        provider = api_config.get('provider', 'claude').lower()

        logger.info(f"创建LLM客户端: provider={provider}")

        # 获取通用参数（作为基础配置）
        base_params = LLMFactory._get_base_params(llm_params)

        # 获取提供商特定的覆盖参数
        provider_overrides = llm_params.get('provider_overrides', {}).get(provider, {})

        # 合并参数：provider_overrides 优先级更高
        merged_params = {**base_params, **provider_overrides}

        logger.debug(f"合并后的参数: {merged_params}")

        # 根据provider创建对应客户端
        if provider == 'claude':
            return LLMFactory._create_claude_client(api_config, merged_params)
        elif provider in ['openai', 'deepseek', 'custom']:
            return LLMFactory._create_openai_client(api_config, provider, merged_params)
        else:
            raise ValueError(f"不支持的provider: {provider}，请选择 'claude', 'openai', 'deepseek' 或 'custom'")

    @staticmethod
    def _get_base_params(llm_params: Dict[str, Any]) -> Dict[str, Any]:
        """提取基础参数"""
        base_params = {
            'model': llm_params.get('model', ''),
            'temperature': llm_params.get('temperature'),
            'max_tokens': llm_params.get('max_tokens', 2000),
            'timeout': llm_params.get('timeout', 30),
            'top_p': llm_params.get('top_p'),
        }

        # Claude特定参数
        if 'top_k' in llm_params:
            base_params['top_k'] = llm_params['top_k']

        # OpenAI特定参数
        if 'frequency_penalty' in llm_params:
            base_params['frequency_penalty'] = llm_params['frequency_penalty']
        if 'presence_penalty' in llm_params:
            base_params['presence_penalty'] = llm_params['presence_penalty']
        if 'stop' in llm_params:
            base_params['stop'] = llm_params['stop']

        # DeepSeek特定参数
        if 'enable_thinking' in llm_params:
            base_params['enable_thinking'] = llm_params['enable_thinking']
        if 'show_thinking' in llm_params:
            base_params['show_thinking'] = llm_params['show_thinking']

        return base_params

    @staticmethod
    def _create_claude_client(api_config: Dict[str, Any], params: Dict[str, Any]) -> ClaudeClient:
        """创建Claude客户端"""
        # 从新的配置结构读取
        providers_config = api_config.get('providers', {})
        claude_config = providers_config.get('claude', {})

        if not claude_config:
            raise ValueError("未找到providers.claude配置，请在config/api_keys.yaml中设置")

        api_key = claude_config.get('api_key') or os.getenv('ANTHROPIC_API_KEY')

        if not api_key or api_key == 'YOUR_CLAUDE_API_KEY_HERE':
            raise ValueError("未配置Claude API Key，请在config/api_keys.yaml中设置或使用环境变量ANTHROPIC_API_KEY")

        # 设置默认模型
        if not params.get('model'):
            params['model'] = "claude-3-5-sonnet-20241022"

        # 只传递Claude支持的参数
        claude_params = {
            'api_key': api_key,
            'model': params['model'],
            'temperature': params.get('temperature'),
            'max_tokens': params['max_tokens'],
            'timeout': params['timeout'],
            'top_p': params.get('top_p'),
            'top_k': params.get('top_k'),
        }

        # 移除None值
        claude_params = {k: v for k, v in claude_params.items() if v is not None}

        return ClaudeClient(**claude_params)

    @staticmethod
    def _create_openai_client(api_config: Dict[str, Any], provider: str, params: Dict[str, Any]) -> OpenAIClient:
        """创建OpenAI兼容客户端"""
        # 从新的配置结构读取
        providers_config = api_config.get('providers', {})
        provider_config = providers_config.get(provider, {})

        if not provider_config:
            raise ValueError(f"未找到providers.{provider}配置，请在config/api_keys.yaml中设置")

        api_key = provider_config.get('api_key') or os.getenv('OPENAI_API_KEY')
        base_url = provider_config.get('base_url') or os.getenv('OPENAI_BASE_URL')

        if not api_key or api_key == 'YOUR_OPENAI_API_KEY_HERE' or api_key == 'YOUR_API_KEY_HERE':
            raise ValueError(f"未配置{provider} API Key，请在config/api_keys.yaml中设置或使用环境变量OPENAI_API_KEY")

        # 设置默认模型和base_url
        if not params.get('model'):
            if provider == 'deepseek':
                params['model'] = 'deepseek-chat'
            else:
                params['model'] = 'gpt-3.5-turbo'

        if not base_url:
            if provider == 'deepseek':
                base_url = 'https://api.deepseek.com'
            else:
                base_url = 'https://api.openai.com/v1'

        # OpenAI客户端参数
        openai_params = {
            'api_key': api_key,
            'base_url': base_url,
            'model': params['model'],
            'temperature': params.get('temperature'),
            'max_tokens': params['max_tokens'],
            'timeout': params['timeout'],
            'top_p': params.get('top_p'),
            'frequency_penalty': params.get('frequency_penalty'),
            'presence_penalty': params.get('presence_penalty'),
            'stop': params.get('stop'),
        }

        # 移除None值（但保留空字典，避免误删enable_thinking等）
        openai_params = {k: v for k, v in openai_params.items() if v is not None}

        # DeepSeek特殊参数作为extra_params传递
        extra_params = {}
        if params.get('enable_thinking') is not None:
            extra_params['enable_thinking'] = params['enable_thinking']
        if params.get('show_thinking') is not None:
            extra_params['show_thinking'] = params['show_thinking']

        if extra_params:
            # 注意：这里不能用字典嵌套，要用**kwargs展开
            return OpenAIClient(**openai_params, **extra_params)
        else:
            return OpenAIClient(**openai_params)


if __name__ == "__main__":
    # 测试工厂
    try:
        client = LLMFactory.create_client()
        print(f"成功创建客户端: {type(client).__name__}")

        # 测试对话
        response = client.chat("你好，请简单介绍一下你自己。")
        print(f"\n响应:\n{response}")

    except Exception as e:
        print(f"错误: {e}")
