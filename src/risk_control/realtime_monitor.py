"""
实时风险监控器
每3秒检查一次持仓风险，触发风控时立即平仓

集成:
1. 自适应风控 (AdaptiveRiskControl)
2. 移动止损 (TrailingStopManager)
3. 账户风控检查
"""

from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass
from datetime import datetime, timedelta
from loguru import logger
import sys
import os

sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
from trading.account import Account, Position
from risk_control.adaptive_risk_control import AdaptiveRiskControl, AdaptiveRiskConfig
from risk_control.trailing_stop import TrailingStopManager, TrailingStopConfig


@dataclass
class RiskAction:
    """风控动作"""
    action_type: str  # 'FORCE_CLOSE', 'STOP_TRADING', 'UPDATE_STOP', 'WARNING', 'OK'
    reason: str
    position: Optional[Position] = None
    new_stop_loss: Optional[float] = None
    timestamp: datetime = None
    
    def __post_init__(self):
        if self.timestamp is None:
            self.timestamp = datetime.now()


class RealtimeRiskMonitor:
    """实时风险监控器"""
    
    def __init__(
        self,
        adaptive_config: AdaptiveRiskConfig = None,
        trailing_config: TrailingStopConfig = None
    ):
        """
        初始化实时风险监控器
        
        Args:
            adaptive_config: 自适应风控配置
            trailing_config: 移动止损配置
        """
        self.adaptive_risk = AdaptiveRiskControl(adaptive_config)
        self.trailing_stop = TrailingStopManager(trailing_config)
        
        # 风控动作历史
        self.action_history: List[RiskAction] = []
        
        logger.info("实时风险监控器初始化完成")
    
    def monitor_all(
        self,
        account: Account,
        market_data: Dict,
        enable_trailing_stop: bool = True
    ) -> List[RiskAction]:
        """
        执行全面风险检查
        
        Args:
            account: 账户对象
            market_data: 市场数据字典
                - current_price: 当前价格
                - atr: 当前ATR
                - atr_percentile: ATR分位数
                - timestamp: 时间戳
            enable_trailing_stop: 是否启用移动止损
        
        Returns:
            风控动作列表
        """
        actions = []
        
        # 更新账户权益
        current_price = market_data.get('current_price', 0)
        if current_price > 0:
            account.update_equity({'SA0': current_price})
        
        # 1. 检查账户级风控
        account_action_type, account_reason = self.adaptive_risk.check_account_risk(account)
        
        if account_action_type != 'OK':
            action = RiskAction(
                action_type=account_action_type,
                reason=account_reason,
                position=None
            )
            actions.append(action)
            self.action_history.append(action)
            logger.warning(f"账户风控触发: {account_action_type} - {account_reason}")
            
            # 如果是FORCE_CLOSE_ALL，立即返回
            if account_action_type == 'FORCE_CLOSE_ALL':
                return actions
        
        # 2. 检查每个持仓
        current_timestamp = market_data.get('timestamp', datetime.now())
        
        for position in account.positions[:]:
            # 计算持仓时长
            hold_hours = (current_timestamp - position.entry_time).total_seconds() / 3600
            
            # 2.1 检查持仓风险
            pos_action_type, pos_reason = self.adaptive_risk.check_position_risk(
                position, current_price, hold_hours
            )
            
            if pos_action_type == 'FORCE_CLOSE':
                action = RiskAction(
                    action_type='FORCE_CLOSE',
                    reason=pos_reason,
                    position=position
                )
                actions.append(action)
                self.action_history.append(action)
                logger.error(f"持仓风控触发: {pos_reason}")
                continue
            
            elif pos_action_type == 'WARNING':
                action = RiskAction(
                    action_type='WARNING',
                    reason=pos_reason,
                    position=position
                )
                actions.append(action)
                self.action_history.append(action)
                logger.warning(f"持仓预警: {pos_reason}")
            
            # 2.2 更新移动止损 (如果启用)
            if enable_trailing_stop:
                atr = market_data.get('atr')
                
                # 优先使用盈亏平衡止损
                new_stop = self.trailing_stop.update_trailing_stop(
                    position, current_price, method='breakeven'
                )
                
                # 如果盈亏平衡未触发，尝试ATR移动止损
                if not new_stop and atr:
                    new_stop = self.trailing_stop.update_trailing_stop(
                        position, current_price, atr=atr, method='atr'
                    )
                
                # 如果需要更新止损
                if new_stop:
                    action = RiskAction(
                        action_type='UPDATE_STOP',
                        reason=f"移动止损: {position.stop_loss:.2f} -> {new_stop:.2f}",
                        position=position,
                        new_stop_loss=new_stop
                    )
                    actions.append(action)
                    self.action_history.append(action)
                    
                    # 实际更新持仓止损
                    position.stop_loss = new_stop
                    logger.info(f"止损已更新: {position.symbol} {position.direction} -> {new_stop:.2f}")
        
        # 如果没有任何风控动作，返回OK
        if not actions:
            actions.append(RiskAction(
                action_type='OK',
                reason='所有风控检查通过'
            ))
        
        return actions
    
    def get_risk_summary(self, account: Account) -> Dict:
        """
        获取风险概况
        
        Args:
            account: 账户对象
        
        Returns:
            风险概况字典
        """
        summary = {
            'account_equity': account.equity,
            'balance': account.balance,
            'drawdown': account.drawdown,
            'today_pnl': account.today_pnl,
            'total_position': account.total_position,
            'total_unrealized_pnl': sum(pos.unrealized_pnl for pos in account.positions),
            'risk_exposure': 0.0,  # 总风险敞口
            'positions': []
        }
        
        # 计算总风险敞口
        for pos in account.positions:
            price_risk = abs(pos.entry_price - pos.stop_loss)
            risk_amount = price_risk * pos.size * 5  # 5吨/手
            risk_ratio = risk_amount / account.equity if account.equity > 0 else 0
            
            summary['risk_exposure'] += risk_ratio
            
            summary['positions'].append({
                'symbol': pos.symbol,
                'direction': pos.direction,
                'size': pos.size,
                'entry_price': pos.entry_price,
                'stop_loss': pos.stop_loss,
                'take_profit': pos.take_profit,
                'unrealized_pnl': pos.unrealized_pnl,
                'risk_amount': risk_amount,
                'risk_ratio': risk_ratio
            })
        
        return summary
    
    def get_recent_actions(self, hours: int = 24) -> List[RiskAction]:
        """
        获取最近的风控动作
        
        Args:
            hours: 查询时间范围(小时)
        
        Returns:
            风控动作列表
        """
        cutoff_time = datetime.now() - timedelta(hours=hours)
        
        recent_actions = [
            action for action in self.action_history
            if action.timestamp >= cutoff_time
        ]
        
        return recent_actions
    
    def clear_history(self):
        """清空风控动作历史"""
        self.action_history.clear()
        logger.info("风控动作历史已清空")


# 测试代码
if __name__ == "__main__":
    from trading.account import Account, Position
    
    print("\n=== 实时风险监控器测试 ===\n")
    
    # 初始化监控器
    monitor = RealtimeRiskMonitor()
    
    # 创建测试账户
    account = Account(
        initial_capital=50000.0,
        max_drawdown=0.10
    )
    
    # 创建测试持仓
    position1 = Position(
        symbol='SA0',
        direction='long',
        size=2,
        entry_price=2000.0,
        stop_loss=1960.0,
        take_profit=2100.0,
        entry_time=datetime.now() - timedelta(hours=2)
    )
    account.positions.append(position1)
    
    # 测试场景1: 正常情况
    print("场景1: 正常市场，价格小幅上涨")
    market_data = {
        'current_price': 2020.0,
        'atr': 18.0,
        'atr_percentile': 50.0,
        'timestamp': datetime.now()
    }
    
    actions = monitor.monitor_all(account, market_data)
    print(f"风控动作数: {len(actions)}")
    for action in actions:
        print(f"  {action.action_type}: {action.reason}")
    
    # 测试场景2: 触发盈亏平衡止损
    print("\n场景2: 价格大幅上涨，触发盈亏平衡止损")
    market_data['current_price'] = 2065.0
    
    actions = monitor.monitor_all(account, market_data)
    print(f"风控动作数: {len(actions)}")
    for action in actions:
        print(f"  {action.action_type}: {action.reason}")
        if action.new_stop_loss:
            print(f"    新止损: {action.new_stop_loss}")
    
    # 测试场景3: 触发止损
    print("\n场景3: 价格下跌，触及止损")
    market_data['current_price'] = 1958.0
    
    actions = monitor.monitor_all(account, market_data)
    print(f"风控动作数: {len(actions)}")
    for action in actions:
        print(f"  {action.action_type}: {action.reason}")
    
    # 测试场景4: 持仓时间过长
    print("\n场景4: 持仓时间超过最大限制")
    position2 = Position(
        symbol='SA0',
        direction='short',
        size=1,
        entry_price=2000.0,
        stop_loss=2040.0,
        take_profit=1900.0,
        entry_time=datetime.now() - timedelta(hours=8.5)  # 超过8小时
    )
    account.positions.append(position2)
    
    market_data['current_price'] = 2010.0
    
    actions = monitor.monitor_all(account, market_data)
    print(f"风控动作数: {len(actions)}")
    for action in actions:
        print(f"  {action.action_type}: {action.reason}")
    
    # 测试场景5: 账户回撤超限
    print("\n场景5: 账户回撤超限")
    account.peak_equity = 60000.0
    account.equity = 53000.0  # 回撤11.7%，超过10%
    
    actions = monitor.monitor_all(account, market_data)
    print(f"风控动作数: {len(actions)}")
    for action in actions:
        print(f"  {action.action_type}: {action.reason}")
    
    # 获取风险概况
    print("\n=== 风险概况 ===")
    summary = monitor.get_risk_summary(account)
    print(f"账户权益: {summary['account_equity']:.2f}")
    print(f"回撤: {summary['drawdown']*100:.2f}%")
    print(f"总持仓: {summary['total_position']}手")
    print(f"风险敞口: {summary['risk_exposure']*100:.2f}%")
    print(f"未实现盈亏: {summary['total_unrealized_pnl']:.2f}")
    
    print("\n持仓详情:")
    for pos in summary['positions']:
        print(f"  {pos['symbol']} {pos['direction']} {pos['size']}手")
        print(f"    入场: {pos['entry_price']:.2f}, 止损: {pos['stop_loss']:.2f}")
        print(f"    未实现: {pos['unrealized_pnl']:.2f}, 风险: {pos['risk_ratio']*100:.2f}%")
    
    # 查看最近的风控动作
    print("\n=== 最近风控动作 ===")
    recent = monitor.get_recent_actions(hours=1)
    print(f"最近1小时内的风控动作: {len(recent)}个")
    for action in recent[-5:]:  # 显示最近5个
        print(f"  [{action.timestamp.strftime('%H:%M:%S')}] {action.action_type}: {action.reason}")
    
    print("\n✓ 实时风险监控器测试完成")
