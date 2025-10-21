"""
性能监控器 (Performance Monitor)

监控系统运行性能指标:
1. 决策延迟
2. LLM调用频率和成本
3. 数据库查询性能
4. 策略执行时间
"""

import time
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
from collections import deque
from loguru import logger
import statistics


class PerformanceMonitor:
    """系统性能监控器"""
    
    def __init__(self, window_size: int = 100):
        """
        初始化性能监控器
        
        Args:
            window_size: 滑动窗口大小（记录最近N次操作）
        """
        self.window_size = window_size
        
        # 各类操作的延迟记录 (使用deque限制大小)
        self.decision_latencies = deque(maxlen=window_size)  # 决策延迟
        self.llm_latencies = deque(maxlen=window_size)  # LLM调用延迟
        self.db_query_latencies = deque(maxlen=window_size)  # 数据库查询延迟
        self.strategy_latencies = deque(maxlen=window_size)  # 策略计算延迟
        
        # LLM调用统计
        self.llm_call_count = 0
        self.llm_token_count = 0
        self.llm_cost = 0.0  # 累计成本（美元）
        
        # 系统启动时间
        self.start_time = datetime.now()
        
        # 当前运行中的操作 (用于计时)
        self._active_timers = {}
        
        logger.info("性能监控器初始化完成")
    
    def start_timer(self, operation_name: str) -> str:
        """
        开始计时
        
        Args:
            operation_name: 操作名称
            
        Returns:
            str: 计时器ID
        """
        timer_id = f"{operation_name}_{time.time()}"
        self._active_timers[timer_id] = time.time()
        return timer_id
    
    def stop_timer(self, timer_id: str, operation_type: str):
        """
        停止计时并记录延迟
        
        Args:
            timer_id: 计时器ID
            operation_type: 操作类型 ('decision', 'llm', 'db_query', 'strategy')
        """
        if timer_id not in self._active_timers:
            logger.warning(f"计时器不存在: {timer_id}")
            return
        
        start_time = self._active_timers.pop(timer_id)
        latency = time.time() - start_time
        
        # 记录到对应队列
        if operation_type == 'decision':
            self.decision_latencies.append(latency)
        elif operation_type == 'llm':
            self.llm_latencies.append(latency)
        elif operation_type == 'db_query':
            self.db_query_latencies.append(latency)
        elif operation_type == 'strategy':
            self.strategy_latencies.append(latency)
    
    def record_llm_call(self, input_tokens: int, output_tokens: int, 
                       cost_per_1k_input: float = 0.0014, 
                       cost_per_1k_output: float = 0.0028):
        """
        记录LLM调用
        
        Args:
            input_tokens: 输入token数
            output_tokens: 输出token数
            cost_per_1k_input: 每1K输入token成本 (DeepSeek默认$0.0014)
            cost_per_1k_output: 每1K输出token成本 (DeepSeek默认$0.0028)
        """
        self.llm_call_count += 1
        self.llm_token_count += input_tokens + output_tokens
        
        call_cost = (input_tokens / 1000 * cost_per_1k_input + 
                    output_tokens / 1000 * cost_per_1k_output)
        self.llm_cost += call_cost
        
        logger.debug(f"LLM调用记录: tokens={input_tokens + output_tokens}, cost=${call_cost:.4f}")
    
    def get_stats(self) -> Dict[str, Any]:
        """
        获取性能统计信息
        
        Returns:
            Dict: 统计信息
        """
        uptime = datetime.now() - self.start_time
        
        return {
            # 系统运行时间
            'uptime_seconds': uptime.total_seconds(),
            'uptime_str': str(uptime).split('.')[0],  # 去除微秒
            
            # 决策延迟统计 (秒)
            'decision_latency': self._calc_latency_stats(self.decision_latencies),
            
            # LLM调用统计
            'llm_calls': {
                'count': self.llm_call_count,
                'tokens': self.llm_token_count,
                'cost_usd': round(self.llm_cost, 4),
                'avg_latency': self._calc_latency_stats(self.llm_latencies),
            },
            
            # 数据库查询统计
            'db_queries': {
                'count': len(self.db_query_latencies),
                'avg_latency': self._calc_latency_stats(self.db_query_latencies),
            },
            
            # 策略计算统计
            'strategy_exec': {
                'count': len(self.strategy_latencies),
                'avg_latency': self._calc_latency_stats(self.strategy_latencies),
            },
            
            # 性能评估
            'performance_grade': self._grade_performance(),
        }
    
    def _calc_latency_stats(self, latencies: deque) -> Dict[str, float]:
        """
        计算延迟统计信息
        
        Args:
            latencies: 延迟队列
            
        Returns:
            Dict: 统计信息 (ms)
        """
        if not latencies:
            return {
                'count': 0,
                'avg_ms': 0,
                'median_ms': 0,
                'p95_ms': 0,
                'max_ms': 0
            }
        
        latencies_list = list(latencies)
        sorted_latencies = sorted(latencies_list)
        
        # 计算百分位
        p95_index = int(len(sorted_latencies) * 0.95)
        p95 = sorted_latencies[p95_index] if p95_index < len(sorted_latencies) else sorted_latencies[-1]
        
        return {
            'count': len(latencies_list),
            'avg_ms': round(statistics.mean(latencies_list) * 1000, 2),
            'median_ms': round(statistics.median(latencies_list) * 1000, 2),
            'p95_ms': round(p95 * 1000, 2),
            'max_ms': round(max(latencies_list) * 1000, 2)
        }
    
    def _grade_performance(self) -> str:
        """
        评估系统性能等级
        
        Returns:
            str: A/B/C/D/F
        """
        # 决策延迟评分
        if not self.decision_latencies:
            decision_score = 100
        else:
            avg_decision_ms = statistics.mean(self.decision_latencies) * 1000
            if avg_decision_ms < 100:
                decision_score = 100
            elif avg_decision_ms < 500:
                decision_score = 80
            elif avg_decision_ms < 1000:
                decision_score = 60
            elif avg_decision_ms < 2000:
                decision_score = 40
            else:
                decision_score = 20
        
        # LLM延迟评分
        if not self.llm_latencies:
            llm_score = 100
        else:
            avg_llm_ms = statistics.mean(self.llm_latencies) * 1000
            if avg_llm_ms < 2000:
                llm_score = 100
            elif avg_llm_ms < 5000:
                llm_score = 80
            elif avg_llm_ms < 10000:
                llm_score = 60
            else:
                llm_score = 40
        
        # 数据库查询评分
        if not self.db_query_latencies:
            db_score = 100
        else:
            avg_db_ms = statistics.mean(self.db_query_latencies) * 1000
            if avg_db_ms < 10:
                db_score = 100
            elif avg_db_ms < 50:
                db_score = 80
            elif avg_db_ms < 100:
                db_score = 60
            else:
                db_score = 40
        
        # 综合评分
        total_score = (decision_score * 0.4 + llm_score * 0.3 + db_score * 0.3)
        
        if total_score >= 90:
            return 'A'
        elif total_score >= 80:
            return 'B'
        elif total_score >= 70:
            return 'C'
        elif total_score >= 60:
            return 'D'
        else:
            return 'F'
    
    def print_summary(self):
        """打印性能摘要"""
        stats = self.get_stats()
        
        logger.info("=" * 80)
        logger.info("性能监控摘要")
        logger.info("=" * 80)
        logger.info(f"系统运行时间: {stats['uptime_str']}")
        logger.info(f"性能评级: {stats['performance_grade']}")
        logger.info("")
        
        # 决策延迟
        decision = stats['decision_latency']
        if decision['count'] > 0:
            logger.info(f"决策延迟 (共{decision['count']}次):")
            logger.info(f"  平均: {decision['avg_ms']:.2f}ms | "
                       f"P95: {decision['p95_ms']:.2f}ms | "
                       f"最大: {decision['max_ms']:.2f}ms")
        
        # LLM调用
        llm = stats['llm_calls']
        if llm['count'] > 0:
            logger.info(f"LLM调用 (共{llm['count']}次):")
            logger.info(f"  Tokens: {llm['tokens']} | "
                       f"成本: ${llm['cost_usd']:.4f} | "
                       f"平均延迟: {llm['avg_latency']['avg_ms']:.2f}ms")
        
        # 数据库查询
        db = stats['db_queries']
        if db['count'] > 0:
            logger.info(f"数据库查询 (共{db['count']}次):")
            logger.info(f"  平均延迟: {db['avg_latency']['avg_ms']:.2f}ms | "
                       f"P95: {db['avg_latency']['p95_ms']:.2f}ms")
        
        # 策略执行
        strategy = stats['strategy_exec']
        if strategy['count'] > 0:
            logger.info(f"策略执行 (共{strategy['count']}次):")
            logger.info(f"  平均延迟: {strategy['avg_latency']['avg_ms']:.2f}ms")
        
        logger.info("=" * 80)
    
    def check_alerts(self) -> List[str]:
        """
        检查性能告警
        
        Returns:
            List[str]: 告警信息列表
        """
        alerts = []
        
        # 决策延迟告警
        if self.decision_latencies:
            avg_decision_ms = statistics.mean(self.decision_latencies) * 1000
            if avg_decision_ms > 1000:
                alerts.append(f"⚠️ 决策延迟过高: {avg_decision_ms:.2f}ms (建议<1000ms)")
        
        # LLM调用频率告警 (每小时>20次视为异常)
        uptime_hours = (datetime.now() - self.start_time).total_seconds() / 3600
        if uptime_hours > 0:
            llm_per_hour = self.llm_call_count / uptime_hours
            if llm_per_hour > 20:
                alerts.append(f"⚠️ LLM调用频率过高: {llm_per_hour:.1f}次/小时 (建议<20)")
        
        # LLM成本告警 (每天>$5)
        uptime_days = (datetime.now() - self.start_time).total_seconds() / 86400
        if uptime_days > 0:
            cost_per_day = self.llm_cost / uptime_days
            if cost_per_day > 5:
                alerts.append(f"⚠️ LLM成本过高: ${cost_per_day:.2f}/天 (建议<$5)")
        
        # 数据库查询延迟告警
        if self.db_query_latencies:
            avg_db_ms = statistics.mean(self.db_query_latencies) * 1000
            if avg_db_ms > 100:
                alerts.append(f"⚠️ 数据库查询延迟过高: {avg_db_ms:.2f}ms (建议<100ms)")
        
        return alerts


# 全局单例
_monitor_instance = None

def get_monitor() -> PerformanceMonitor:
    """获取全局性能监控器单例"""
    global _monitor_instance
    if _monitor_instance is None:
        _monitor_instance = PerformanceMonitor()
    return _monitor_instance


# 测试代码
if __name__ == "__main__":
    import logging
    logging.basicConfig(level=logging.INFO)
    
    monitor = PerformanceMonitor(window_size=50)
    
    print("测试1: 记录决策延迟")
    timer = monitor.start_timer("decision")
    time.sleep(0.1)
    monitor.stop_timer(timer, 'decision')
    
    print("测试2: 记录LLM调用")
    timer = monitor.start_timer("llm")
    time.sleep(2)
    monitor.stop_timer(timer, 'llm')
    monitor.record_llm_call(input_tokens=500, output_tokens=200)
    
    print("测试3: 记录数据库查询")
    for _ in range(10):
        timer = monitor.start_timer("db_query")
        time.sleep(0.01)
        monitor.stop_timer(timer, 'db_query')
    
    print("测试4: 打印统计信息")
    monitor.print_summary()
    
    print("测试5: 检查告警")
    alerts = monitor.check_alerts()
    if alerts:
        for alert in alerts:
            print(alert)
    else:
        print("✓ 无性能告警")
