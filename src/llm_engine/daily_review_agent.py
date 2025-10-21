"""
每日复盘Agent

每日21:00自动运行，分析当日交易，提取教训
"""

from typing import Dict, List, Any, Optional
from datetime import datetime, date, timedelta
import logging
import sys
import os

# 添加父目录到路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from src.llm_engine.prompts.daily_review import DailyReviewPrompt
    from src.llm_engine.response_parser import ResponseParser
except ImportError:
    # 如果作为模块导入
    from .prompts.daily_review import DailyReviewPrompt
    from .response_parser import ResponseParser

logger = logging.getLogger(__name__)


class DailyReviewAgent:
    """
    每日复盘Agent
    
    功能：
    1. 收集当日交易数据
    2. 调用LLM分析
    3. 提取教训
    4. 管理教训生命周期
    """
    
    def __init__(self, database, llm_client):
        """
        初始化复盘Agent
        
        Args:
            database: 数据库实例
            llm_client: LLM客户端实例
        """
        self.db = database
        self.llm = llm_client
        self.prompt_builder = DailyReviewPrompt()
        self.parser = ResponseParser()
    
    def run_daily_review(self, target_date: Optional[date] = None) -> Dict[str, Any]:
        """
        运行每日复盘
        
        Args:
            target_date: 目标日期，默认为今天
            
        Returns:
            dict: 复盘结果
                - success: bool
                - summary: str
                - lessons: List[Dict]
                - trades_count: int
                - review_id: int
        """
        if target_date is None:
            target_date = date.today()
        
        logger.info(f"开始每日复盘: {target_date}")
        
        try:
            # 1. 收集数据
            trades = self._collect_trades(target_date)
            market_summary = self._collect_market_summary(target_date)
            
            if not trades:
                logger.warning(f"{target_date} 无交易记录，跳过复盘")
                return {
                    'success': False,
                    'summary': '当日无交易',
                    'lessons': [],
                    'trades_count': 0,
                    'review_id': None
                }
            
            # 2. 构建Prompt
            prompt = self.prompt_builder.build_prompt(trades, market_summary)
            
            # 3. 调用LLM
            logger.info(f"调用LLM分析{len(trades)}笔交易...")
            response = self.llm.generate(prompt)
            
            # 4. 解析响应
            result = self.parser.parse_daily_review(response)
            
            # 5. 保存复盘结果
            review_id = self._save_review(target_date, result, len(trades))
            
            # 6. 保存教训
            self._save_lessons(result['lessons'], target_date)
            
            # 7. 更新教训状态
            self._update_lesson_lifecycle()
            
            logger.info(f"每日复盘完成: 提取{len(result['lessons'])}条教训")
            
            return {
                'success': True,
                'summary': result['summary'],
                'lessons': result['lessons'],
                'trades_count': len(trades),
                'review_id': review_id
            }
            
        except Exception as e:
            logger.error(f"每日复盘失败: {e}", exc_info=True)
            return {
                'success': False,
                'summary': f'复盘失败: {str(e)}',
                'lessons': [],
                'trades_count': 0,
                'review_id': None
            }
    
    def _collect_trades(self, target_date: date) -> List[Dict[str, Any]]:
        """
        收集当日交易数据
        
        Args:
            target_date: 目标日期
            
        Returns:
            List[Dict]: 交易列表
        """
        try:
            # 从数据库获取当日交易
            # 假设有get_trades_by_date方法
            trades = self.db.get_trades_by_date(target_date)
            
            # 格式化交易数据
            formatted_trades = []
            for trade in trades:
                formatted_trades.append({
                    'open_time': trade.get('open_time', 'unknown'),
                    'action': self._format_action(trade.get('direction')),
                    'volume': trade.get('volume', 0),
                    'open_price': trade.get('open_price', 0),
                    'strategy': trade.get('strategy', 'unknown'),
                    'confidence': trade.get('confidence', 0),
                    'result': self._format_result(trade.get('status')),
                    'close_price': trade.get('close_price', 0),
                    'pnl_text': self._format_pnl(trade.get('pnl', 0)),
                    'duration': self._format_duration(
                        trade.get('open_time'),
                        trade.get('close_time')
                    )
                })
            
            return formatted_trades
            
        except Exception as e:
            logger.error(f"收集交易数据失败: {e}")
            return []
    
    def _collect_market_summary(self, target_date: date) -> Dict[str, Any]:
        """
        收集市场表现总结
        
        Args:
            target_date: 目标日期
            
        Returns:
            Dict: 市场总结
        """
        try:
            # 获取当日K线数据
            daily_kline = self.db.get_daily_kline(target_date)
            
            # 获取当日交易统计
            stats = self.db.get_trade_stats(target_date)
            
            return {
                'price_range': f"{daily_kline.get('open', 0):.0f} → {daily_kline.get('close', 0):.0f}",
                'volatility': self._format_volatility(daily_kline.get('atr_percentile', 0)),
                'atr_percentile': daily_kline.get('atr_percentile', 0),
                'volume_level': self._format_volume(daily_kline.get('volume_ratio', 1.0)),
                'dominant_trend': daily_kline.get('trend', 'unknown'),
                'winning_trades': stats.get('winning_trades', 0),
                'losing_trades': stats.get('losing_trades', 0),
                'net_pnl': stats.get('net_pnl', 0),
                'win_rate': stats.get('win_rate', 0)
            }
            
        except Exception as e:
            logger.error(f"收集市场数据失败: {e}")
            return {
                'price_range': 'unknown',
                'volatility': 'unknown',
                'atr_percentile': 0,
                'volume_level': 'unknown',
                'dominant_trend': 'unknown',
                'winning_trades': 0,
                'losing_trades': 0,
                'net_pnl': 0,
                'win_rate': 0
            }
    
    def _save_review(
        self,
        target_date: date,
        result: Dict[str, Any],
        trades_count: int
    ) -> int:
        """
        保存复盘结果到数据库
        
        Args:
            target_date: 复盘日期
            result: 复盘结果
            trades_count: 交易数量
            
        Returns:
            int: 复盘记录ID
        """
        try:
            review_data = {
                'review_date': target_date,
                'summary': result['summary'],
                'total_trades': trades_count,
                'lessons_count': len(result['lessons']),
                'created_at': datetime.now()
            }
            
            review_id = self.db.insert('reviews', review_data)
            logger.info(f"复盘结果已保存: review_id={review_id}")
            
            return review_id
            
        except Exception as e:
            logger.error(f"保存复盘结果失败: {e}")
            return None
    
    def _save_lessons(self, lessons: List[Dict[str, Any]], source_date: date):
        """
        保存教训到数据库
        
        Args:
            lessons: 教训列表
            source_date: 来源日期
        """
        try:
            for lesson in lessons:
                lesson_data = {
                    'content': lesson['content'],
                    'source_date': source_date,
                    'importance': lesson['importance'],
                    'status': 'active',  # 新教训默认激活
                    'hit_count': 0,
                    'last_hit_date': None,
                    'created_at': datetime.now()
                }
                
                lesson_id = self.db.insert('lessons', lesson_data)
                logger.info(f"教训已保存: lesson_id={lesson_id}, importance={lesson['importance']}")
            
        except Exception as e:
            logger.error(f"保存教训失败: {e}")
    
    def _update_lesson_lifecycle(self):
        """
        更新教训生命周期
        
        规则：
        1. 7天未命中 → 停用（status='inactive'）
        2. 命中次数>5 → 提升重要性为high
        3. 连续30天未命中 → 删除
        """
        try:
            # 规则1：7天未命中 → 停用
            seven_days_ago = date.today() - timedelta(days=7)
            inactive_count = self.db.update_lessons_status(
                condition="status='active' AND (last_hit_date IS NULL OR last_hit_date < ?)",
                params=(seven_days_ago,),
                new_status='inactive'
            )
            if inactive_count > 0:
                logger.info(f"停用{inactive_count}条教训（7天未命中）")
            
            # 规则2：命中次数>5 → 提升重要性
            popular_count = self.db.update_lessons_importance(
                condition="hit_count > 5 AND importance != 'high'",
                new_importance='high'
            )
            if popular_count > 0:
                logger.info(f"提升{popular_count}条教训重要性为high（命中>5次）")
            
            # 规则3：连续30天未命中 → 删除
            thirty_days_ago = date.today() - timedelta(days=30)
            deleted_count = self.db.delete_lessons(
                condition="status='inactive' AND (last_hit_date IS NULL OR last_hit_date < ?)",
                params=(thirty_days_ago,)
            )
            if deleted_count > 0:
                logger.info(f"删除{deleted_count}条教训（30天未命中）")
            
        except Exception as e:
            logger.error(f"更新教训生命周期失败: {e}")
    
    def get_active_lessons(self, limit: int = 5) -> List[Dict[str, Any]]:
        """
        获取活跃的教训
        
        Args:
            limit: 最大数量
            
        Returns:
            List[Dict]: 教训列表
        """
        try:
            lessons = self.db.get_lessons(
                status='active',
                order_by='importance DESC, hit_count DESC',
                limit=limit
            )
            return lessons
        except Exception as e:
            logger.error(f"获取活跃教训失败: {e}")
            return []
    
    def record_lesson_hit(self, lesson_id: int):
        """
        记录教训命中（在决策时引用了某条教训）
        
        Args:
            lesson_id: 教训ID
        """
        try:
            self.db.increment_lesson_hit_count(lesson_id, date.today())
            logger.debug(f"教训命中: lesson_id={lesson_id}")
        except Exception as e:
            logger.error(f"记录教训命中失败: {e}")
    
    # ========== 辅助方法 ==========
    
    @staticmethod
    def _format_action(direction: str) -> str:
        """格式化交易方向"""
        mapping = {
            'long': '开多',
            'short': '开空',
            'close_long': '平多',
            'close_short': '平空'
        }
        return mapping.get(direction, direction)
    
    @staticmethod
    def _format_result(status: str) -> str:
        """格式化交易结果"""
        mapping = {
            'stop_loss': '止损',
            'take_profit': '止盈',
            'trailing_stop': '移动止损',
            'time_exit': '超时平仓',
            'holding': '持仓中'
        }
        return mapping.get(status, status)
    
    @staticmethod
    def _format_pnl(pnl: float) -> str:
        """格式化盈亏"""
        if pnl > 0:
            return f"盈利+{pnl:.0f}元"
        elif pnl < 0:
            return f"亏损{pnl:.0f}元"
        else:
            return "持平"
    
    @staticmethod
    def _format_duration(open_time, close_time) -> str:
        """格式化持仓时长"""
        if not open_time or not close_time:
            return "持仓中"
        
        try:
            if isinstance(open_time, str):
                open_time = datetime.fromisoformat(open_time)
            if isinstance(close_time, str):
                close_time = datetime.fromisoformat(close_time)
            
            duration = close_time - open_time
            hours = duration.total_seconds() / 3600
            
            if hours < 1:
                return f"{int(duration.total_seconds() / 60)}分钟"
            elif hours < 24:
                return f"{hours:.1f}小时"
            else:
                return f"{hours/24:.1f}天"
        except:
            return "未知"
    
    @staticmethod
    def _format_volatility(atr_percentile: float) -> str:
        """格式化波动率"""
        if atr_percentile < 0.2:
            return "极低"
        elif atr_percentile < 0.4:
            return "较低"
        elif atr_percentile < 0.6:
            return "正常"
        elif atr_percentile < 0.8:
            return "较高"
        else:
            return "极高"
    
    @staticmethod
    def _format_volume(volume_ratio: float) -> str:
        """格式化成交量"""
        if volume_ratio < 0.5:
            return "极低"
        elif volume_ratio < 0.8:
            return "较低"
        elif volume_ratio < 1.2:
            return "正常"
        elif volume_ratio < 1.5:
            return "放大"
        else:
            return "暴增"


# 测试代码
if __name__ == "__main__":
    import logging
    
    # 配置日志
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    # 模拟数据库和LLM客户端
    class MockDatabase:
        def get_trades_by_date(self, target_date):
            return [
                {
                    'open_time': '09:30',
                    'direction': 'long',
                    'volume': 2,
                    'open_price': 2080,
                    'strategy': '趋势跟踪',
                    'confidence': 0.85,
                    'status': 'take_profit',
                    'close_price': 2110,
                    'pnl': 300,
                    'close_time': '11:30'
                }
            ]
        
        def get_daily_kline(self, target_date):
            return {
                'open': 2080,
                'close': 2110,
                'atr_percentile': 0.45,
                'volume_ratio': 1.0,
                'trend': '弱多头'
            }
        
        def get_trade_stats(self, target_date):
            return {
                'winning_trades': 1,
                'losing_trades': 0,
                'net_pnl': 300,
                'win_rate': 1.0
            }
        
        def insert(self, table, data):
            return 1
        
        def update_lessons_status(self, condition, params, new_status):
            return 0
        
        def update_lessons_importance(self, condition, new_importance):
            return 0
        
        def delete_lessons(self, condition, params):
            return 0
    
    class MockLLMClient:
        def generate(self, prompt):
            return """
{
    "summary": "今日1笔交易，盈利+300元",
    "lessons": [
        {
            "content": "趋势跟踪策略在正常波动市有效",
            "importance": "high"
        }
    ]
}
"""
    
    # 测试
    db = MockDatabase()
    llm = MockLLMClient()
    agent = DailyReviewAgent(db, llm)
    
    print("=" * 60)
    print("测试：运行每日复盘")
    result = agent.run_daily_review()
    print(f"\n复盘结果:")
    print(f"  成功: {result['success']}")
    print(f"  总结: {result['summary']}")
    print(f"  教训数: {len(result['lessons'])}")
    for i, lesson in enumerate(result['lessons'], 1):
        print(f"  教训{i}: {lesson['content']} [{lesson['importance']}]")
    
    print("\n✓ 测试通过")
