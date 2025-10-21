"""
数据桥接层
连接交易系统核心
"""

import sys
from pathlib import Path
from datetime import datetime, timedelta
from typing import Dict, List, Optional
import random

from loguru import logger

# 添加src目录到路径
project_root = Path(__file__).parent.parent.parent.parent
sys.path.insert(0, str(project_root / 'src'))


class TradingSystemBridge:
    """交易系统数据桥接层（单例）"""
    
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        if self._initialized:
            return
        
        self.data_collector = None
        self.account = None
        self.database = None
        self.use_mock = True
        self._cache = {}
        self._cache_ttl = {}
        self._initialized = True
        
        logger.info("数据桥接层创建完成")
    
    def init_connections(self, use_mock=True):
        """初始化连接"""
        self.use_mock = use_mock
        
        if use_mock:
            logger.info("✅ 使用模拟数据模式")
            return
        
        # TODO: 连接真实交易系统
        logger.info("尝试连接交易系统...")
    
    def get_db(self):
        """获取数据库连接"""
        if self.database is None:
            try:
                from src.data_fetcher.database import Database
                db_path = project_root / "data" / "market_data.db"
                self.database = Database(str(db_path))
                logger.info(f"✅ 数据库连接成功: {db_path}")
            except Exception as e:
                logger.error(f"❌ 数据库连接失败: {e}")
                # 返回一个简单的数据库适配器用于mock模式
                self.database = MockDatabase()
        return self.database
    
    def _get_cache(self, key: str, ttl: int = 60) -> Optional[any]:
        """获取缓存"""
        if key in self._cache:
            if datetime.now() < self._cache_ttl.get(key, datetime.min):
                return self._cache[key]
        return None
    
    def _set_cache(self, key: str, value: any, ttl: int = 60):
        """设置缓存"""
        self._cache[key] = value
        self._cache_ttl[key] = datetime.now() + timedelta(seconds=ttl)
    
    def get_kline_data(self, period: str, limit: int = 500) -> List[Dict]:
        """获取K线数据"""
        cache_key = f"kline_{period}_{limit}"
        cached = self._get_cache(cache_key, ttl=30)
        if cached:
            return cached
        
        # 生成模拟数据
        data = self._gen_mock_kline(period, limit)
        self._set_cache(cache_key, data, ttl=30)
        return data
    
    def _gen_mock_kline(self, period: str, limit: int) -> List[Dict]:
        """生成模拟K线"""
        intervals = {
            '1m': timedelta(minutes=1),
            '5m': timedelta(minutes=5),
            '15m': timedelta(minutes=15),
            '1h': timedelta(hours=1),
            '4h': timedelta(hours=4),
            '1d': timedelta(days=1)
        }
        interval = intervals.get(period, timedelta(minutes=15))
        
        result = []
        base_price = 2100
        base_time = datetime.now()
        
        for i in range(limit):
            ts = base_time - interval * (limit - i - 1)
            o = base_price + random.randint(-50, 50)
            c = o + random.randint(-30, 30)
            h = max(o, c) + random.randint(0, 20)
            l = min(o, c) - random.randint(0, 20)
            
            result.append({
                'timestamp': ts.strftime('%Y-%m-%d %H:%M:%S'),
                'open': float(o),
                'high': float(h),
                'low': float(l),
                'close': float(c),
                'volume': random.randint(100, 1000)
            })
        
        return result
    
    def get_account_info(self) -> Dict:
        """获取账户信息"""
        return {
            'balance': 100000.0,
            'equity': 102500.0,
            'pnl': 2500.0,
            'pnl_percent': 2.5,
            'drawdown': 0.03,
            'positions_count': 1,
            'timestamp': datetime.now().isoformat()
        }
    
    def get_positions(self) -> List[Dict]:
        """获取持仓"""
        return [
            {
                'symbol': 'SA601',
                'direction': 'long',
                'volume': 10,
                'entry_price': 2050.0,
                'current_price': 2100.0,
                'pnl': 2500.0,
                'pnl_percent': 2.44
            }
        ]
    
    def get_signals(self, limit: int = 10, strategy: Optional[str] = None) -> List[Dict]:
        """获取信号"""
        return []
    
    def get_market_regime(self) -> Dict:
        """获取市场状态"""
        return {
            'regime': 'trend',
            'confidence': 0.75,
            'adx': 28.5,
            'atr': 32.0,
            'volatility': 0.015
        }
    
    def get_order_flow(self) -> Dict:
        """获取订单流"""
        return {
            'vpin': 0.35,
            'depth_imbalance': 0.12,
            'interpretation': '买卖力量相对平衡'
        }
    
    def get_system_status(self) -> Dict:
        """获取系统状态"""
        return {
            'data_fetcher': 'running' if self.data_collector else 'stopped',
            'llm_engine': 'idle',
            'risk_control': 'running',
            'executor': 'running',
            'timestamp': datetime.now().isoformat()
        }
    
    def emergency_close_all(self) -> Dict:
        """紧急平仓"""
        logger.warning("执行紧急平仓（模拟）")
        return {
            'status': 'success',
            'message': '所有持仓已平仓',
            'timestamp': datetime.now().isoformat()
        }
    
    def toggle_strategy(self, strategy: str, enabled: bool) -> Dict:
        """策略开关"""
        logger.info(f"策略开关: {strategy} -> {enabled}")
        return {
            'status': 'success',
            'strategy': strategy,
            'enabled': enabled,
            'message': f"策略 {strategy} 已{'启用' if enabled else '禁用'}",
            'timestamp': datetime.now().isoformat()
        }
    
    def pause_trading(self, paused: bool, reason: Optional[str] = None) -> Dict:
        """暂停交易"""
        logger.info(f"交易状态: {'暂停' if paused else '恢复'} | 原因: {reason}")
        return {
            'status': 'success',
            'paused': paused,
            'reason': reason,
            'message': f"交易已{'暂停' if paused else '恢复'}",
            'timestamp': datetime.now().isoformat()
        }


class MockDatabase:
    """模拟数据库连接（当真实数据库不可用时）"""
    
    def execute_query(self, query: str, params: tuple = None):
        """执行查询"""
        logger.debug(f"Mock query: {query}")
        return []
    
    def execute_update(self, query: str, params: tuple = None):
        """执行更新"""
        logger.debug(f"Mock update: {query}")
        return True


# 全局单例
bridge = TradingSystemBridge()
