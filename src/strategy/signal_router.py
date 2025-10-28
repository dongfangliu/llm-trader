"""
信号路由器 (Signal Router)

负责:
1. 收集多个策略的信号
2. 选择最佳信号 (置信度最高)
3. 信号过滤 (置信度阈值、风险检查)
4. 判断是否需要LLM复核
"""

from typing import Dict, Any, List, Optional
from loguru import logger

from .market_regime import MarketRegimeDetector
from .trend_following import TrendFollowingStrategy
from .mean_reversion import MeanReversionStrategy
from .breakout import BreakoutStrategy


class SignalRouter:
    """信号路由器 - 协调多个策略"""
    
    def __init__(self):
        # 初始化组件
        self.regime_detector = MarketRegimeDetector()
        
        # 初始化策略
        self.strategies = {
            'trend_following': TrendFollowingStrategy(),
            'mean_reversion': MeanReversionStrategy(),
            'breakout': BreakoutStrategy(),
        }
        
        logger.info(f"信号路由器初始化完成, 策略数量: {len(self.strategies)}")
        
    def generate_signal(self, market_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        生成交易信号
        
        流程:
        1. 识别市场状态
        2. 运行所有策略
        3. 选择最佳信号
        4. 信号过滤
        5. 判断是否需要LLM复核
        
        Args:
            market_data: 市场数据
            
        Returns:
            {
                'action': str,
                'confidence': float,
                'entry_price': float,
                'stop_loss': float,
                'take_profit': float,
                'position_size': int,
                'reasoning': list,
                'source': str,
                'strategy': str,
                'market_regime': dict,
                'need_llm_review': bool,
                'all_signals': list  # 所有策略的信号
            }
        """
        
        # 步骤1: 识别市场状态
        market_regime = self.regime_detector.detect(market_data)
        
        # 步骤2: 运行所有策略
        all_signals = []
        for strategy_name, strategy in self.strategies.items():
            try:
                signal = strategy.generate_signal(market_data, market_regime)
                signal['strategy_name'] = strategy_name
                all_signals.append(signal)
            except Exception as e:
                logger.error(f"策略 {strategy_name} 执行失败: {e}")
        
        # 步骤3: 选择最佳信号 (置信度最高)
        valid_signals = [s for s in all_signals if s['action'] != 'hold']
        
        if not valid_signals:
            logger.info("所有策略均为hold信号")
            return self._create_hold_signal(market_regime, all_signals)
        
        # 按置信度排序
        valid_signals.sort(key=lambda x: x['confidence'], reverse=True)
        best_signal = valid_signals[0]
        
        logger.info(f"最佳信号: {best_signal['strategy_name']} - {best_signal['action']} "
                   f"(置信度: {best_signal['confidence']:.2f})")
        
        # 步骤4: 信号过滤
        filter_result = self._filter_signal(best_signal, market_regime)
        if not filter_result['passed']:
            logger.warning(f"信号被过滤: {filter_result['reason']}")
            return self._create_hold_signal(market_regime, all_signals, 
                                          filter_reason=filter_result['reason'])
        
        # 步骤5: 判断是否需要LLM复核
        need_llm = self._need_llm_review(best_signal, market_regime, all_signals)
        
        # 构建最终信号
        final_signal = {
            **best_signal,
            'market_regime': market_regime,
            'need_llm_review': need_llm,
            'all_signals': all_signals,
            'filter_passed': True
        }
        
        return final_signal
    
    def _filter_signal(self, signal: Dict[str, Any], market_regime: Dict[str, Any]) -> Dict[str, bool]:
        """
        信号过滤
        
        过滤条件:
        1. 置信度阈值
        2. 市场状态一致性
        3. 异常市场额外检查
        """
        
        # 获取阈值（降低默认阈值）
        threshold = market_regime.get('strategy_params', {}).get('signal_threshold', 0.60)
        
        # 检查1: 置信度阈值
        if signal['confidence'] < threshold:
            return {
                'passed': False,
                'reason': f"置信度 {signal['confidence']:.2f} 低于阈值 {threshold:.2f}"
            }
        
        # 检查2: 异常市场额外检查
        if market_regime['regime'] == 'abnormal':
            if signal['confidence'] < 0.90:
                return {
                    'passed': False,
                    'reason': f"异常市场要求置信度>0.90, 当前: {signal['confidence']:.2f}"
                }
        
        # 检查3: 仓位合理性
        if signal.get('position_size', 0) <= 0:
            return {
                'passed': False,
                'reason': "仓位大小无效"
            }
        
        return {'passed': True, 'reason': None}
    
    def _need_llm_review(self, signal: Dict[str, Any], market_regime: Dict[str, Any], 
                        all_signals: List[Dict[str, Any]]) -> bool:
        """
        判断是否需要LLM复核
        
        触发条件:
        1. 置信度 < 0.85 (不够确定)
        2. 市场状态异常
        3. 多个策略信号冲突
        4. 市场状态强制要求 (abnormal)
        """
        
        # 条件1: 置信度不足（降低阈值）
        if signal['confidence'] < 0.75:
            logger.info(f"触发LLM复核: 置信度不足 ({signal['confidence']:.2f})")
            return True
        
        # 条件2: 异常市场
        if market_regime['regime'] == 'abnormal':
            logger.info("触发LLM复核: 异常市场")
            return True
        
        # 条件3: 策略信号冲突
        valid_signals = [s for s in all_signals if s['action'] != 'hold']
        if len(valid_signals) > 1:
            # 检查是否有相反方向的信号
            actions = [s['action'] for s in valid_signals]
            if 'open_long' in actions and 'open_short' in actions:
                logger.info("触发LLM复核: 策略信号冲突 (多空分歧)")
                return True
        
        # 条件4: 市场状态要求
        if market_regime.get('strategy_params', {}).get('use_llm', False):
            logger.info("触发LLM复核: 市场状态要求")
            return True
        
        return False
    
    def _create_hold_signal(self, market_regime: Dict[str, Any], 
                          all_signals: List[Dict[str, Any]],
                          filter_reason: Optional[str] = None) -> Dict[str, Any]:
        """创建持仓信号"""
        reasoning = []
        
        if filter_reason:
            reasoning.append(f"过滤原因: {filter_reason}")
        else:
            reasoning.append("所有策略均为hold")
        
        return {
            'action': 'hold',
            'confidence': 0.0,
            'reasoning': reasoning,
            'source': 'quant',
            'strategy': 'SignalRouter',
            'market_regime': market_regime,
            'need_llm_review': False,
            'all_signals': all_signals,
            'filter_passed': False if filter_reason else True
        }
    
    def apply_llm_review(self, signal: Dict[str, Any], llm_response: Dict[str, Any]) -> Dict[str, Any]:
        """
        应用LLM复核结果到信号
        
        Args:
            signal: 原始信号
            llm_response: LLM复核响应，包含:
                - approved: bool
                - concerns: List[str]
                - warnings: List[str]
                - severe_warning: bool (新增)
                - warning_reason: str (新增)
        
        Returns:
            Dict: 修改后的信号
        """
        # 复制信号避免修改原对象
        reviewed_signal = signal.copy()
        reviewed_signal['llm_reviewed'] = True
        reviewed_signal['llm_response'] = llm_response
        
        # 检查严重警告
        if llm_response.get('severe_warning', False):
            warning_reason = llm_response.get('warning_reason', '存在严重风险')
            logger.warning(f"LLM严重警告: {warning_reason}")
            
            # 强制拒绝信号
            reviewed_signal['action'] = 'hold'
            reviewed_signal['confidence'] = 0.0
            reviewed_signal['reasoning'] = [f"LLM严重警告: {warning_reason}"]
            reviewed_signal['llm_rejected'] = True
            
            return reviewed_signal
        
        # 检查是否批准
        if not llm_response.get('approved', False):
            concerns = llm_response.get('concerns', [])
            logger.info(f"LLM拒绝信号: {', '.join(concerns)}")
            
            # 拒绝信号
            reviewed_signal['action'] = 'hold'
            reviewed_signal['confidence'] = 0.0
            reviewed_signal['reasoning'] = [f"LLM拒绝: {', '.join(concerns)}"]
            reviewed_signal['llm_rejected'] = True
            
            return reviewed_signal
        
        # LLM批准，但可能有关注点和警告
        concerns = llm_response.get('concerns', [])
        warnings = llm_response.get('warnings', [])
        
        if concerns or warnings:
            logger.info(f"LLM批准信号，但有关注点: {', '.join(concerns + warnings)}")
            reviewed_signal['reasoning'] = reviewed_signal.get('reasoning', []) + concerns + warnings
            
            # 降低置信度（如果有较多关注点）
            concern_count = len(concerns) + len(warnings)
            if concern_count >= 2:
                confidence_penalty = min(0.1, concern_count * 0.05)
                reviewed_signal['confidence'] = max(0.5, reviewed_signal['confidence'] - confidence_penalty)
                logger.info(f"因LLM关注点，置信度降低至: {reviewed_signal['confidence']:.2f}")
        else:
            logger.info("LLM完全批准信号，无关注点")
        
        reviewed_signal['llm_rejected'] = False
        return reviewed_signal

