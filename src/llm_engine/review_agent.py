"""
复盘Agent - 重构版
每日分析交易表现，生成经验教训，无缝集成所有模块
"""

import json
from typing import Dict, List, Union, Optional
from datetime import datetime, date, timedelta
from loguru import logger

from .claude_client import ClaudeClient
from .openai_client import OpenAIClient
from .prompt_builder import PromptBuilder


class ReviewAgent:
    """
    复盘Agent - 核心功能:
    1. 每日复盘交易表现
    2. 分析成功/失败交易模式
    3. 提取可操作的经验教训
    4. 生成结构化报告
    5. 支持历史复盘数据查询
    """

    def __init__(self, llm_client: Union[ClaudeClient, OpenAIClient], database=None):
        """
        初始化复盘Agent

        Args:
            llm_client: LLM客户端（支持Claude或OpenAI-compatible）
            database: 数据库实例（可选，用于直接访问历史数据）
        """
        self.client = llm_client
        self.prompt_builder = PromptBuilder()
        self.database = database
        self.last_review_date = None
        logger.info("复盘Agent初始化完成")

    def daily_review(self,
                     trades_today: List[Dict],
                     decisions_today: List[Dict],
                     review_date: Optional[date] = None,
                     account_state: Optional[Dict] = None) -> Optional[Dict]:
        """
        每日复盘 - 核心方法

        Args:
            trades_today: 今日交易记录
            decisions_today: 今日决策记录
            review_date: 复盘日期（默认为今天）
            account_state: 账户状态信息（余额、权益、回撤等）

        Returns:
            dict: 复盘结果 {
                'date': date,
                'performance_rating': 7,
                'total_trades': 5,
                'win_rate': 60.0,
                'total_pnl': 250.0,
                'good_decisions': [...],
                'bad_decisions': [...],
                'patterns_found': [...],
                'lessons': [...],
                'strategy_adjustment': '...',
                'account_summary': {...}
            }
        """
        review_date = review_date or date.today()
        
        logger.info("=" * 80)
        logger.info(f"开始每日复盘 - {review_date}")
        logger.info("=" * 80)

        # 处理无交易情况
        if not trades_today or len(trades_today) == 0:
            logger.info("今日无交易，生成简化复盘")
            return self._create_no_trade_review(review_date, decisions_today, account_state)

        # 计算今日表现指标
        performance = self._calculate_performance(trades_today)
        
        # 添加账户状态信息
        if account_state:
            performance.update({
                'balance': account_state.get('balance', 0),
                'equity': account_state.get('equity', 0),
                'drawdown': account_state.get('drawdown', 0)
            })

        # 分析交易质量
        trade_quality = self._analyze_trade_quality(trades_today, decisions_today)
        
        # 构建复盘prompt
        prompt = self.prompt_builder.build_review_prompt(
            trades_today=trades_today,
            decisions_today=decisions_today,
            performance=performance
        )

        # 调用LLM进行深度分析
        try:
            response = self.client.chat_json(prompt)
            
            if not response:
                logger.error("复盘失败：LLM未返回有效响应")
                return self._create_fallback_review(review_date, performance, trade_quality)

            # 验证响应格式
            required_keys = ['performance_rating', 'lessons']
            if not self.client.validate_response(response, required_keys):
                logger.error("复盘响应格式不正确，使用备用方案")
                return self._create_fallback_review(review_date, performance, trade_quality)

        except Exception as e:
            logger.error(f"LLM复盘调用失败: {e}，使用备用方案")
            return self._create_fallback_review(review_date, performance, trade_quality)

        # 补充基础数据
        response['date'] = review_date
        response['total_trades'] = performance['total_trades']
        response['win_rate'] = performance['win_rate']
        response['total_pnl'] = performance['total_pnl']
        response['account_summary'] = {
            'balance': performance.get('balance', 0),
            'equity': performance.get('equity', 0),
            'drawdown': performance.get('drawdown', 0)
        }

        # 记录复盘完成
        self.last_review_date = review_date

        # 输出复盘结果摘要
        self._log_review_summary(response)

        return response

    def _create_no_trade_review(self, review_date: date, 
                                 decisions_today: List[Dict],
                                 account_state: Optional[Dict]) -> Dict:
        """创建无交易日的复盘记录"""
        decision_count = len(decisions_today) if decisions_today else 0
        
        return {
            'date': review_date,
            'performance_rating': 5,
            'total_trades': 0,
            'win_rate': 0,
            'total_pnl': 0,
            'good_decisions': [],
            'bad_decisions': [],
            'patterns_found': [f'今日共{decision_count}次决策，但均未执行交易'],
            'lessons': ['今日未交易，保持观望'],
            'strategy_adjustment': '继续观察市场，等待合适机会',
            'account_summary': account_state or {}
        }

    def _create_fallback_review(self, review_date: date,
                                 performance: Dict,
                                 trade_quality: Dict) -> Dict:
        """创建备用复盘记录（当LLM失败时）"""
        # 基于规则生成简单的复盘
        rating = self._calculate_rating(performance)
        lessons = self._generate_rule_based_lessons(performance, trade_quality)
        
        return {
            'date': review_date,
            'performance_rating': rating,
            'total_trades': performance['total_trades'],
            'win_rate': performance['win_rate'],
            'total_pnl': performance['total_pnl'],
            'good_decisions': [],
            'bad_decisions': [],
            'patterns_found': [f'胜率{performance["win_rate"]:.1f}%，盈亏比{trade_quality.get("profit_loss_ratio", 1):.2f}'],
            'lessons': lessons,
            'strategy_adjustment': '建议优化交易策略',
            'account_summary': {
                'balance': performance.get('balance', 0),
                'equity': performance.get('equity', 0),
                'drawdown': performance.get('drawdown', 0)
            }
        }

    def _log_review_summary(self, review_result: Dict):
        """输出复盘结果摘要到日志"""
        logger.info("复盘完成:")
        logger.info(f"  日期: {review_result['date']}")
        logger.info(f"  评分: {review_result['performance_rating']}/10")
        logger.info(f"  总交易: {review_result['total_trades']}笔")
        logger.info(f"  胜率: {review_result['win_rate']:.1f}%")
        logger.info(f"  总盈亏: {review_result['total_pnl']:+.2f}元")
        
        if review_result.get('account_summary'):
            acc = review_result['account_summary']
            if acc.get('balance'):
                logger.info(f"  账户余额: {acc['balance']:.2f}元")
            if acc.get('drawdown'):
                logger.info(f"  回撤: {acc['drawdown']:.2%}")

        if review_result.get('lessons'):
            logger.info("  核心教训:")
            for i, lesson in enumerate(review_result['lessons'][:3], 1):
                logger.info(f"    {i}. {lesson}")

    def _calculate_performance(self, trades: List[Dict]) -> Dict:
        """
        计算交易表现指标（增强版）
        
        Args:
            trades: 交易记录列表
            
        Returns:
            dict: 表现指标
        """
        # 筛选平仓交易（只有平仓才计算盈亏）
        close_trades = [t for t in trades if t.get('action') == 'CLOSE']
        total_trades = len(close_trades)

        if total_trades == 0:
            return {
                'total_trades': 0,
                'win_trades': 0,
                'loss_trades': 0,
                'win_rate': 0,
                'total_pnl': 0,
                'avg_win': 0,
                'avg_loss': 0,
                'max_win': 0,
                'max_loss': 0,
                'profit_factor': 0,
                'consecutive_wins': 0,
                'consecutive_losses': 0
            }

        # 统计盈亏
        pnls = [t.get('pnl', 0) for t in close_trades if t.get('pnl') is not None]
        win_pnls = [p for p in pnls if p > 0]
        loss_pnls = [p for p in pnls if p < 0]

        win_trades = len(win_pnls)
        loss_trades = len(loss_pnls)
        win_rate = (win_trades / total_trades * 100) if total_trades > 0 else 0
        total_pnl = sum(pnls)
        
        # 盈亏统计
        avg_win = sum(win_pnls) / len(win_pnls) if win_pnls else 0
        avg_loss = sum(loss_pnls) / len(loss_pnls) if loss_pnls else 0
        max_win = max(pnls) if pnls else 0
        max_loss = min(pnls) if pnls else 0
        
        # 盈亏比
        total_wins = sum(win_pnls) if win_pnls else 0
        total_losses = abs(sum(loss_pnls)) if loss_pnls else 0
        profit_factor = (total_wins / total_losses) if total_losses > 0 else (total_wins if total_wins > 0 else 0)
        
        # 连续盈亏
        consecutive = self._calculate_consecutive_trades(pnls)

        return {
            'total_trades': total_trades,
            'win_trades': win_trades,
            'loss_trades': loss_trades,
            'win_rate': win_rate,
            'total_pnl': total_pnl,
            'avg_win': avg_win,
            'avg_loss': avg_loss,
            'max_win': max_win,
            'max_loss': max_loss,
            'profit_factor': profit_factor,
            'consecutive_wins': consecutive['max_wins'],
            'consecutive_losses': consecutive['max_losses']
        }

    def _calculate_consecutive_trades(self, pnls: List[float]) -> Dict:
        """计算最大连续盈亏"""
        if not pnls:
            return {'max_wins': 0, 'max_losses': 0}
        
        max_wins = 0
        max_losses = 0
        current_wins = 0
        current_losses = 0
        
        for pnl in pnls:
            if pnl > 0:
                current_wins += 1
                current_losses = 0
                max_wins = max(max_wins, current_wins)
            elif pnl < 0:
                current_losses += 1
                current_wins = 0
                max_losses = max(max_losses, current_losses)
        
        return {'max_wins': max_wins, 'max_losses': max_losses}

    def _analyze_trade_quality(self, trades: List[Dict], decisions: List[Dict]) -> Dict:
        """
        分析交易质量
        
        Returns:
            dict: 交易质量指标
        """
        close_trades = [t for t in trades if t.get('action') == 'CLOSE']
        
        if not close_trades:
            return {'profit_loss_ratio': 0, 'decision_execution_rate': 0}
        
        # 盈亏比
        wins = [t.get('pnl', 0) for t in close_trades if t.get('pnl', 0) > 0]
        losses = [abs(t.get('pnl', 0)) for t in close_trades if t.get('pnl', 0) < 0]
        
        avg_win = sum(wins) / len(wins) if wins else 0
        avg_loss = sum(losses) / len(losses) if losses else 0
        profit_loss_ratio = avg_win / avg_loss if avg_loss > 0 else (avg_win if avg_win > 0 else 0)
        
        # 决策执行率
        executed_decisions = len([d for d in decisions if d.get('executed')])
        total_decisions = len(decisions)
        execution_rate = (executed_decisions / total_decisions * 100) if total_decisions > 0 else 0
        
        return {
            'profit_loss_ratio': profit_loss_ratio,
            'decision_execution_rate': execution_rate,
            'avg_win': avg_win,
            'avg_loss': avg_loss
        }

    def _calculate_rating(self, performance: Dict) -> int:
        """
        基于规则计算评分（1-10分）
        
        评分逻辑：
        - 胜率 > 60%: +2分
        - 总盈利 > 0: +2分
        - 盈亏比 > 1.5: +2分
        - 最大亏损 < 200: +2分
        - 交易次数适中(2-6笔): +2分
        """
        rating = 5  # 基础分
        
        if performance['win_rate'] > 60:
            rating += 2
        elif performance['win_rate'] > 50:
            rating += 1
        
        if performance['total_pnl'] > 0:
            rating += 2
        elif performance['total_pnl'] > -100:
            rating += 1
        
        if performance.get('profit_factor', 0) > 1.5:
            rating += 2
        elif performance.get('profit_factor', 0) > 1:
            rating += 1
        
        if abs(performance['max_loss']) < 200:
            rating += 1
        
        trades_count = performance['total_trades']
        if 2 <= trades_count <= 6:
            rating += 1
        
        return min(10, max(1, rating))

    def _generate_rule_based_lessons(self, performance: Dict, trade_quality: Dict) -> List[str]:
        """基于规则生成经验教训"""
        lessons = []
        
        # 胜率相关
        if performance['win_rate'] < 40:
            lessons.append("胜率偏低，需要提高交易准确性，考虑提升入场条件")
        elif performance['win_rate'] > 70:
            lessons.append("胜率良好，保持当前策略")
        
        # 盈亏比相关
        pl_ratio = trade_quality.get('profit_loss_ratio', 0)
        if pl_ratio < 1:
            lessons.append("盈亏比低于1，止盈过早或止损过晚，需优化出场策略")
        elif pl_ratio > 2:
            lessons.append("盈亏比表现优秀，继续维持")
        
        # 交易频率
        if performance['total_trades'] > 8:
            lessons.append("交易过于频繁，可能存在过度交易，建议提高交易标准")
        elif performance['total_trades'] == 0:
            lessons.append("今日未交易，注意不要错过合适机会")
        
        # 连续亏损
        if performance.get('consecutive_losses', 0) >= 3:
            lessons.append("连续亏损达到3次，需暂停交易，重新评估策略")
        
        # 最大亏损
        if abs(performance['max_loss']) > 400:
            lessons.append("单笔最大亏损过大，需严格执行止损")
        
        return lessons[:5]  # 最多返回5条

    def extract_lessons(self, review_result: Dict) -> List[str]:
        """
        从复盘结果提取关键经验教训（智能去重）

        Args:
            review_result: 复盘结果

        Returns:
            list: 经验教训列表
        """
        lessons = []
        seen = set()  # 用于去重

        # 1. 提取lessons字段
        if review_result.get('lessons'):
            for lesson in review_result['lessons']:
                # 简单去重（基于内容前50字符）
                key = lesson[:50]
                if key not in seen:
                    lessons.append(lesson)
                    seen.add(key)

        # 2. 提取发现的模式（只取前2个）
        if review_result.get('patterns_found'):
            for pattern in review_result['patterns_found'][:2]:
                lesson_text = f"模式发现: {pattern}"
                key = lesson_text[:50]
                if key not in seen:
                    lessons.append(lesson_text)
                    seen.add(key)

        # 3. 提取策略调整建议
        if review_result.get('strategy_adjustment'):
            lesson_text = f"策略建议: {review_result['strategy_adjustment']}"
            key = lesson_text[:50]
            if key not in seen:
                lessons.append(lesson_text)
                seen.add(key)

        # 限制数量（最多5条核心教训）
        return lessons[:5]

    def get_historical_performance(self, days: int = 7) -> Optional[Dict]:
        """
        获取历史表现统计（需要database支持）
        
        Args:
            days: 统计天数
            
        Returns:
            dict: 历史表现统计
        """
        if not self.database:
            logger.warning("未提供database实例，无法查询历史表现")
            return None
        
        try:
            reviews = self.database.get_recent_reviews(days=days)
            
            if not reviews:
                return None
            
            total_trades = sum(r.get('total_trades', 0) for r in reviews)
            total_pnl = sum(r.get('total_pnl', 0) for r in reviews)
            avg_win_rate = sum(r.get('win_rate', 0) for r in reviews) / len(reviews)
            
            return {
                'period_days': days,
                'total_trades': total_trades,
                'total_pnl': total_pnl,
                'avg_win_rate': avg_win_rate,
                'reviews_count': len(reviews)
            }
            
        except Exception as e:
            logger.error(f"查询历史表现失败: {e}")
            return None

    def compare_with_history(self, current_review: Dict, history_days: int = 7) -> Optional[Dict]:
        """
        对比当前表现与历史平均水平
        
        Args:
            current_review: 当前复盘结果
            history_days: 历史对比天数
            
        Returns:
            dict: 对比结果
        """
        history = self.get_historical_performance(history_days)
        
        if not history:
            return None
        
        return {
            'win_rate_diff': current_review['win_rate'] - history['avg_win_rate'],
            'pnl_vs_avg': current_review['total_pnl'] - (history['total_pnl'] / history['reviews_count']),
            'history_avg_pnl': history['total_pnl'] / history['reviews_count'],
            'history_avg_win_rate': history['avg_win_rate']
        }

    def format_review_report(self, review_result: Dict, include_history: bool = False) -> str:
        """
        格式化复盘报告为可读文本（增强版）

        Args:
            review_result: 复盘结果
            include_history: 是否包含历史对比

        Returns:
            str: 格式化的报告
        """
        if not review_result:
            return "无复盘数据"

        report_lines = [
            "=" * 70,
            f"📊 复盘报告 - {review_result.get('date', date.today())}",
            "=" * 70,
            "",
            f"【综合评分】⭐ {review_result.get('performance_rating', 0)}/10",
            "",
            "【交易统计】",
            f"  总交易笔数: {review_result.get('total_trades', 0)} 笔",
            f"  盈利交易: {review_result.get('win_trades', 0)} 笔 | 亏损交易: {review_result.get('loss_trades', 0)} 笔" 
                if 'loss_trades' in review_result else "",
            f"  胜率: {review_result.get('win_rate', 0):.1f}%",
            f"  总盈亏: {review_result.get('total_pnl', 0):+.2f} 元",
        ]

        # 添加详细统计
        if 'avg_win' in review_result:
            report_lines.extend([
                f"  平均盈利: +{review_result['avg_win']:.2f} 元",
                f"  平均亏损: {review_result['avg_loss']:.2f} 元",
                f"  最大盈利: +{review_result.get('max_win', 0):.2f} 元",
                f"  最大亏损: {review_result.get('max_loss', 0):.2f} 元",
            ])

        if 'profit_factor' in review_result:
            report_lines.append(f"  盈亏比: {review_result['profit_factor']:.2f}")

        report_lines.append("")

        # 账户状态
        if review_result.get('account_summary'):
            acc = review_result['account_summary']
            report_lines.extend([
                "【账户状态】",
                f"  余额: {acc.get('balance', 0):.2f} 元",
                f"  权益: {acc.get('equity', 0):.2f} 元",
                f"  回撤: {acc.get('drawdown', 0):.2%}",
                ""
            ])

        # 历史对比（如果可用）
        if include_history:
            comparison = self.compare_with_history(review_result)
            if comparison:
                report_lines.extend([
                    "【历史对比】",
                    f"  胜率差异: {comparison['win_rate_diff']:+.1f}% (vs 7日均值{comparison['history_avg_win_rate']:.1f}%)",
                    f"  盈亏差异: {comparison['pnl_vs_avg']:+.2f}元 (vs 7日均值{comparison['history_avg_pnl']:.2f}元)",
                    ""
                ])

        # 优秀决策
        if review_result.get('good_decisions'):
            report_lines.append("【✓ 优秀决策】")
            for i, decision in enumerate(review_result['good_decisions'], 1):
                reason = decision.get('reason', '') if isinstance(decision, dict) else decision
                report_lines.append(f"  {i}. {reason}")
            report_lines.append("")

        # 失败决策
        if review_result.get('bad_decisions'):
            report_lines.append("【✗ 失败决策】")
            for i, decision in enumerate(review_result['bad_decisions'], 1):
                reason = decision.get('reason', '') if isinstance(decision, dict) else decision
                report_lines.append(f"  {i}. {reason}")
            report_lines.append("")

        # 发现的模式
        if review_result.get('patterns_found'):
            report_lines.append("【🔍 发现的模式】")
            for i, pattern in enumerate(review_result['patterns_found'], 1):
                report_lines.append(f"  {i}. {pattern}")
            report_lines.append("")

        # 经验教训（高亮显示）
        if review_result.get('lessons'):
            report_lines.append("【💡 核心教训】")
            for i, lesson in enumerate(review_result['lessons'], 1):
                report_lines.append(f"  {i}. {lesson}")
            report_lines.append("")

        # 策略调整建议
        if review_result.get('strategy_adjustment'):
            report_lines.extend([
                "【📋 策略调整建议】",
                f"  {review_result['strategy_adjustment']}",
                ""
            ])

        report_lines.append("=" * 70)

        return "\n".join(report_lines)

    def export_review_json(self, review_result: Dict, filepath: str = None) -> bool:
        """
        导出复盘结果为JSON文件
        
        Args:
            review_result: 复盘结果
            filepath: 导出文件路径（默认为 reviews/YYYY-MM-DD.json）
            
        Returns:
            bool: 是否成功
        """
        try:
            if not filepath:
                from pathlib import Path
                reviews_dir = Path("data/reviews")
                reviews_dir.mkdir(parents=True, exist_ok=True)
                filepath = reviews_dir / f"{review_result['date']}.json"
            
            # 转换date对象为字符串
            export_data = review_result.copy()
            if isinstance(export_data.get('date'), date):
                export_data['date'] = export_data['date'].isoformat()
            
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(export_data, f, ensure_ascii=False, indent=2)
            
            logger.info(f"复盘结果已导出到: {filepath}")
            return True
            
        except Exception as e:
            logger.error(f"导出复盘结果失败: {e}")
            return False

    def validate_review_result(self, review_result: Dict) -> bool:
        """
        验证复盘结果的完整性
        
        Args:
            review_result: 复盘结果
            
        Returns:
            bool: 是否有效
        """
        required_fields = ['date', 'performance_rating', 'total_trades', 
                          'win_rate', 'total_pnl', 'lessons']
        
        for field in required_fields:
            if field not in review_result:
                logger.warning(f"复盘结果缺少必需字段: {field}")
                return False
        
        # 验证数值范围
        if not (1 <= review_result['performance_rating'] <= 10):
            logger.warning(f"评分超出范围: {review_result['performance_rating']}")
            return False
        
        if not (0 <= review_result['win_rate'] <= 100):
            logger.warning(f"胜率超出范围: {review_result['win_rate']}")
            return False
        
        return True


# 辅助函数：批量复盘
def batch_review(review_agent: ReviewAgent, 
                 database, 
                 start_date: date, 
                 end_date: date) -> List[Dict]:
    """
    批量复盘指定日期范围的交易
    
    Args:
        review_agent: 复盘Agent实例
        database: 数据库实例
        start_date: 开始日期
        end_date: 结束日期
        
    Returns:
        list: 复盘结果列表
    """
    results = []
    current_date = start_date
    
    while current_date <= end_date:
        logger.info(f"复盘日期: {current_date}")
        
        # 获取当日数据（需要数据库支持按日期查询）
        # 这里假设database有相应方法
        try:
            trades = database.get_trades_by_date(current_date)
            decisions = database.get_decisions_by_date(current_date)
            
            review_result = review_agent.daily_review(
                trades_today=trades,
                decisions_today=decisions,
                review_date=current_date
            )
            
            if review_result:
                results.append(review_result)
                
        except Exception as e:
            logger.error(f"复盘 {current_date} 失败: {e}")
        
        current_date += timedelta(days=1)
    
    return results


if __name__ == "__main__":
    """测试代码"""
    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).parent.parent))
    
    from llm_engine.llm_factory import LLMFactory
    from data_fetcher.database import Database

    # 初始化
    try:
        client = LLMFactory.create_client()
        database = Database("data/market_data.db")
        agent = ReviewAgent(client, database=database)
        
        print("=" * 70)
        print("复盘Agent测试")
        print("=" * 70)

        # 模拟交易记录
        mock_trades = [
            {
                'timestamp': '2025-10-11 10:00:00',
                'direction': 'LONG',
                'action': 'OPEN',
                'price': 1850,
                'quantity': 1
            },
            {
                'timestamp': '2025-10-11 11:30:00',
                'direction': 'LONG',
                'action': 'CLOSE',
                'price': 1860,
                'quantity': 1,
                'pnl': 50,
                'commission': 5
            },
            {
                'timestamp': '2025-10-11 14:00:00',
                'direction': 'SHORT',
                'action': 'OPEN',
                'price': 1855,
                'quantity': 1
            },
            {
                'timestamp': '2025-10-11 15:30:00',
                'direction': 'SHORT',
                'action': 'CLOSE',
                'price': 1865,
                'quantity': 1,
                'pnl': -50,
                'commission': 5
            }
        ]

        mock_decisions = [
            {
                'timestamp': '2025-10-11 10:00:00',
                'decision_layer': 'tactical',
                'executed': True
            },
            {
                'timestamp': '2025-10-11 14:00:00',
                'decision_layer': 'tactical',
                'executed': True
            }
        ]
        
        mock_account_state = {
            'balance': 49000,
            'equity': 49500,
            'drawdown': 0.01
        }

        # 执行复盘
        print("\n测试1: 完整复盘")
        review_result = agent.daily_review(
            mock_trades, 
            mock_decisions,
            account_state=mock_account_state
        )

        if review_result:
            print("\n✓ 复盘结果:")
            print(json.dumps(review_result, ensure_ascii=False, indent=2, default=str))

            print("\n" + "=" * 70)
            print("格式化报告:")
            print(agent.format_review_report(review_result, include_history=False))

            print("\n" + "=" * 70)
            print("提取的经验教训:")
            lessons = agent.extract_lessons(review_result)
            for i, lesson in enumerate(lessons, 1):
                print(f"  {i}. {lesson}")
            
            # 测试验证
            print("\n" + "=" * 70)
            print("验证复盘结果:")
            is_valid = agent.validate_review_result(review_result)
            print(f"  有效性: {'✓ 通过' if is_valid else '✗ 失败'}")
            
            # 测试导出
            print("\n" + "=" * 70)
            print("测试导出JSON:")
            success = agent.export_review_json(review_result, "data/reviews/test_review.json")
            print(f"  导出: {'✓ 成功' if success else '✗ 失败'}")

        # 测试2: 无交易日
        print("\n\n" + "=" * 70)
        print("测试2: 无交易日复盘")
        empty_review = agent.daily_review([], [], account_state=mock_account_state)
        if empty_review:
            print("✓ 无交易日复盘结果:")
            print(agent.format_review_report(empty_review))

        # 测试3: 历史表现查询
        print("\n" + "=" * 70)
        print("测试3: 历史表现统计")
        history = agent.get_historical_performance(days=7)
        if history:
            print(f"✓ 近7日表现:")
            print(f"  总交易: {history['total_trades']}笔")
            print(f"  总盈亏: {history['total_pnl']:+.2f}元")
            print(f"  平均胜率: {history['avg_win_rate']:.1f}%")
        else:
            print("  暂无历史数据")

        print("\n" + "=" * 70)
        print("所有测试完成!")
        print("=" * 70)
        
    except Exception as e:
        print(f"测试失败: {e}")
        import traceback
        traceback.print_exc()

