"""
配置管理服务
支持读取、更新、验证YAML配置文件，以及敏感信息掩码处理
"""

import os
import yaml
from pathlib import Path
from typing import Dict, Any, Optional
from copy import deepcopy


class ConfigService:
    """配置管理服务"""

    # 敏感字段列表（需要掩码处理）
    SENSITIVE_FIELDS = {
        'api_key', 'password', 'secret', 'token', 'key'
    }

    # 配置文件路径（相对于项目根目录）
    # 从当前文件向上找3级：services -> server -> web_v2 -> 项目根
    _PROJECT_ROOT = Path(__file__).parent.parent.parent.parent
    TRADING_PARAMS_PATH = _PROJECT_ROOT / "config" / "trading_params.yaml"
    API_KEYS_PATH = _PROJECT_ROOT / "config" / "api_keys.yaml"

    @classmethod
    def get_config(cls) -> Dict[str, Any]:
        """
        获取所有配置（敏感信息自动掩码）

        Returns:
            包含trading_params和api_keys的完整配置字典
        """
        config = {}

        # 读取trading_params
        if cls.TRADING_PARAMS_PATH.exists():
            with open(cls.TRADING_PARAMS_PATH, 'r', encoding='utf-8') as f:
                config['trading_params'] = yaml.safe_load(f) or {}
        else:
            config['trading_params'] = {}

        # 读取api_keys（掩码处理）
        if cls.API_KEYS_PATH.exists():
            with open(cls.API_KEYS_PATH, 'r', encoding='utf-8') as f:
                api_keys = yaml.safe_load(f) or {}
                config['api_keys'] = cls._mask_sensitive_data(api_keys)
        else:
            config['api_keys'] = {}

        return config

    @classmethod
    def update_config(cls, updates: Dict[str, Any]) -> Dict[str, Any]:
        """
        更新配置

        Args:
            updates: 要更新的配置项，格式：
                {
                    'trading_params': {...},
                    'api_keys': {...}
                }

        Returns:
            更新后的完整配置

        Raises:
            ValueError: 配置验证失败
        """
        result = {}

        # 更新trading_params
        if 'trading_params' in updates:
            cls._validate_trading_params(updates['trading_params'])
            current_params = cls._load_yaml(cls.TRADING_PARAMS_PATH)
            updated_params = cls._deep_merge(current_params, updates['trading_params'])
            cls._save_yaml(cls.TRADING_PARAMS_PATH, updated_params)
            result['trading_params'] = updated_params

        # 更新api_keys（处理掩码值）
        if 'api_keys' in updates:
            current_keys = cls._load_yaml(cls.API_KEYS_PATH)
            updated_keys = cls._merge_api_keys(current_keys, updates['api_keys'])
            cls._save_yaml(cls.API_KEYS_PATH, updated_keys)
            result['api_keys'] = cls._mask_sensitive_data(updated_keys)

        return result

    @classmethod
    def _load_yaml(cls, file_path: Path) -> Dict[str, Any]:
        """加载YAML文件"""
        if not file_path.exists():
            return {}

        with open(file_path, 'r', encoding='utf-8') as f:
            return yaml.safe_load(f) or {}

    @classmethod
    def _save_yaml(cls, file_path: Path, data: Dict[str, Any]) -> None:
        """
        保存到YAML文件
        使用default_flow_style=False保持可读性
        """
        # 确保目录存在
        file_path.parent.mkdir(parents=True, exist_ok=True)

        with open(file_path, 'w', encoding='utf-8') as f:
            yaml.dump(data, f, allow_unicode=True, default_flow_style=False, sort_keys=False)

    @classmethod
    def _mask_sensitive_data(cls, data: Any, parent_key: str = '') -> Any:
        """
        递归掩码敏感数据

        Args:
            data: 要处理的数据
            parent_key: 父级键名

        Returns:
            掩码后的数据
        """
        if isinstance(data, dict):
            result = {}
            for key, value in data.items():
                full_key = f"{parent_key}.{key}" if parent_key else key
                result[key] = cls._mask_sensitive_data(value, full_key)
            return result

        elif isinstance(data, str):
            # 检查是否是敏感字段
            if any(sensitive in parent_key.lower() for sensitive in cls.SENSITIVE_FIELDS):
                return cls._mask_string(data)
            return data

        elif isinstance(data, list):
            return [cls._mask_sensitive_data(item, parent_key) for item in data]

        else:
            return data

    @classmethod
    def _mask_string(cls, value: str) -> str:
        """
        掩码字符串，保留前后部分
        例如：sk-1234567890abcdef -> sk-***...***cdef
        """
        if not value or len(value) <= 8:
            return "***"

        # 保留前3个和后4个字符
        return f"{value[:3]}***...***{value[-4:]}"

    @classmethod
    def _is_masked_value(cls, value: str) -> bool:
        """判断是否是掩码值"""
        return isinstance(value, str) and "***" in value

    @classmethod
    def _merge_api_keys(cls, current: Dict[str, Any], updates: Dict[str, Any]) -> Dict[str, Any]:
        """
        合并API密钥配置，特殊处理掩码值
        如果更新值是掩码，则保留原值
        """
        result = deepcopy(current)

        for key, value in updates.items():
            if isinstance(value, dict) and key in result:
                result[key] = cls._merge_api_keys(result[key], value)
            elif isinstance(value, str) and cls._is_masked_value(value):
                # 掩码值，保留原值
                continue
            else:
                # 新值，更新
                result[key] = value

        return result

    @classmethod
    def _deep_merge(cls, base: Dict[str, Any], updates: Dict[str, Any]) -> Dict[str, Any]:
        """
        深度合并字典
        """
        result = deepcopy(base)

        for key, value in updates.items():
            if key in result and isinstance(result[key], dict) and isinstance(value, dict):
                result[key] = cls._deep_merge(result[key], value)
            else:
                result[key] = value

        return result

    @classmethod
    def _validate_trading_params(cls, params: Dict[str, Any]) -> None:
        """
        验证trading_params配置

        Raises:
            ValueError: 验证失败
        """
        # 验证trading配置
        if 'trading' in params:
            trading = params['trading']

            if 'initial_capital' in trading:
                if trading['initial_capital'] <= 0:
                    raise ValueError("initial_capital必须大于0")

            if 'max_position' in trading:
                if trading['max_position'] <= 0:
                    raise ValueError("max_position必须大于0")

            if 'single_trade' in trading:
                if trading['single_trade'] <= 0:
                    raise ValueError("single_trade必须大于0")

        # 验证risk配置
        if 'risk' in params:
            risk = params['risk']

            if 'stop_loss' in risk:
                if risk['stop_loss'] >= 0:
                    raise ValueError("stop_loss必须小于0（负数）")

            if 'daily_max_loss' in risk:
                if risk['daily_max_loss'] >= 0:
                    raise ValueError("daily_max_loss必须小于0（负数）")

            if 'max_drawdown' in risk:
                if not (0 < risk['max_drawdown'] <= 1):
                    raise ValueError("max_drawdown必须在0-1之间")

            if 'max_hold_hours' in risk:
                if risk['max_hold_hours'] <= 0:
                    raise ValueError("max_hold_hours必须大于0")

        # 验证decision配置
        if 'decision' in params:
            decision = params['decision']

            if 'confidence_threshold' in decision:
                if not (0 <= decision['confidence_threshold'] <= 100):
                    raise ValueError("confidence_threshold必须在0-100之间")

            if 'max_daily_trades' in decision:
                if decision['max_daily_trades'] <= 0:
                    raise ValueError("max_daily_trades必须大于0")

        # 验证llm配置
        if 'llm' in params:
            llm = params['llm']

            if 'temperature' in llm:
                if not (0 <= llm['temperature'] <= 2):
                    raise ValueError("temperature必须在0-2之间")

            if 'max_tokens' in llm:
                if llm['max_tokens'] <= 0:
                    raise ValueError("max_tokens必须大于0")

        # 验证data配置
        if 'data' in params:
            data = params['data']

            if 'fetch_interval' in data:
                if data['fetch_interval'] <= 0:
                    raise ValueError("fetch_interval必须大于0")

            if 'history_days' in data:
                if data['history_days'] <= 0:
                    raise ValueError("history_days必须大于0")

    @classmethod
    def get_config_schema(cls) -> Dict[str, Any]:
        """
        获取配置项的元数据（字段说明、类型、范围等）
        用于前端动态生成表单
        """
        return {
            'trading': {
                'initial_capital': {
                    'type': 'number',
                    'label': '初始资金',
                    'min': 1000,
                    'max': 10000000,
                    'unit': '元',
                    'description': '账户初始资金'
                },
                'max_position': {
                    'type': 'number',
                    'label': '最大持仓',
                    'min': 1,
                    'max': 100,
                    'unit': '手',
                    'description': '最大持仓手数'
                },
                'single_trade': {
                    'type': 'number',
                    'label': '单次交易量',
                    'min': 1,
                    'max': 10,
                    'unit': '手',
                    'description': '单次交易手数'
                },
                'symbol': {
                    'type': 'string',
                    'label': '交易品种',
                    'description': '交易合约代码（简称）'
                },
                'tqsdk_symbol': {
                    'type': 'string',
                    'label': 'TqSDK合约代码',
                    'description': '天勤SDK合约代码，如 KQ.m@CZCE.SA（主力合约）'
                }
            },
            'risk': {
                'stop_loss': {
                    'type': 'number',
                    'label': '止损金额',
                    'min': -10000,
                    'max': -10,
                    'unit': '元',
                    'description': '单笔交易最大亏损（负数）'
                },
                'daily_max_loss': {
                    'type': 'number',
                    'label': '日最大亏损',
                    'min': -50000,
                    'max': -100,
                    'unit': '元',
                    'description': '单日最大亏损限制（负数）'
                },
                'max_drawdown': {
                    'type': 'number',
                    'label': '最大回撤',
                    'min': 0.01,
                    'max': 0.5,
                    'step': 0.01,
                    'description': '允许的最大回撤比例（0-1）'
                },
                'max_hold_hours': {
                    'type': 'number',
                    'label': '最大持仓时长',
                    'min': 1,
                    'max': 168,
                    'unit': '小时',
                    'description': '单笔持仓最长时间'
                },
                'volatility_threshold': {
                    'type': 'number',
                    'label': '波动率阈值',
                    'min': 0.01,
                    'max': 0.5,
                    'step': 0.01,
                    'description': '市场异常波动阈值'
                }
            },
            'decision': {
                'confidence_threshold': {
                    'type': 'number',
                    'label': '置信度阈值',
                    'min': 0,
                    'max': 100,
                    'unit': '%',
                    'description': '信号置信度阈值，低于此值触发LLM复核'
                },
                'max_daily_trades': {
                    'type': 'number',
                    'label': '日最大交易次数',
                    'min': 1,
                    'max': 50,
                    'description': '每日最多开仓次数'
                },
                'min_trade_gap': {
                    'type': 'number',
                    'label': '最小交易间隔',
                    'min': 1,
                    'max': 120,
                    'unit': '分钟',
                    'description': '两次交易之间的最小间隔'
                },
                'tactical_interval': {
                    'type': 'number',
                    'label': '战术决策间隔',
                    'min': 1,
                    'max': 60,
                    'unit': '分钟',
                    'description': '量化策略决策周期'
                },
                'strategic_interval': {
                    'type': 'number',
                    'label': '战略评估间隔',
                    'min': 60,
                    'max': 1440,
                    'unit': '分钟',
                    'description': '战略层面评估周期'
                }
            },
            'llm': {
                'model': {
                    'type': 'string',
                    'label': 'LLM模型',
                    'description': 'LLM模型名称，如 claude-3-5-sonnet-20241022'
                },
                'temperature': {
                    'type': 'number',
                    'label': '温度参数',
                    'min': 0,
                    'max': 2,
                    'step': 0.1,
                    'description': '控制输出随机性，0=确定性，2=高随机性'
                },
                'max_tokens': {
                    'type': 'number',
                    'label': '最大Token数',
                    'min': 100,
                    'max': 8000,
                    'description': 'LLM响应的最大token数'
                },
                'timeout': {
                    'type': 'number',
                    'label': '超时时间',
                    'min': 5,
                    'max': 120,
                    'unit': '秒',
                    'description': 'API调用超时时间'
                }
            },
            'data': {
                'fetch_interval': {
                    'type': 'number',
                    'label': '数据获取间隔',
                    'min': 1,
                    'max': 60,
                    'unit': '秒',
                    'description': '行情数据获取周期'
                },
                'history_days': {
                    'type': 'number',
                    'label': '历史数据天数',
                    'min': 1,
                    'max': 365,
                    'unit': '天',
                    'description': '初始化时加载的历史数据天数'
                },
                'kline_period': {
                    'type': 'string',
                    'label': 'K线周期',
                    'description': '主K线周期，如 15（15分钟）'
                }
            },
            'system': {
                'log_level': {
                    'type': 'select',
                    'label': '日志级别',
                    'options': ['DEBUG', 'INFO', 'WARNING', 'ERROR'],
                    'description': '系统日志级别'
                },
                'review_time': {
                    'type': 'string',
                    'label': '复盘时间',
                    'description': '每日复盘时间，格式 HH:MM'
                },
                'timezone': {
                    'type': 'string',
                    'label': '时区',
                    'description': '系统时区，如 Asia/Shanghai'
                }
            },
            'backtest': {
                'commission_rate': {
                    'type': 'number',
                    'label': '手续费率',
                    'min': 0,
                    'max': 0.01,
                    'step': 0.00001,
                    'description': '回测手续费率'
                },
                'slippage_ticks': {
                    'type': 'number',
                    'label': '滑点',
                    'min': 0,
                    'max': 10,
                    'unit': 'ticks',
                    'description': '回测滑点（跳数）'
                }
            }
        }


# 单例实例
config_service = ConfigService()
