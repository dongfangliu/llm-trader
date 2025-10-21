/**
 * 总览仪表盘
 * V4架构核心页面 - 一屏掌握系统全貌
 */

import React from 'react';
import { Space } from 'antd';
import AccountMetrics from './AccountMetrics';
import MarketRegimePanel from './MarketRegimePanel';
import SignalSourcePanel from './SignalSourcePanel';
import StrategyCards from './StrategyCards';
import KlineChart from './KlineChart';

const Dashboard: React.FC = () => {
  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      {/* 第一行：账户权益和关键指标 */}
      <AccountMetrics />

      {/* 第二行：市场状态和信号分布 */}
      <div style={{ display: 'flex', gap: '16px' }}>
        <div style={{ flex: 1 }}>
          <MarketRegimePanel />
        </div>
        <div style={{ flex: 1 }}>
          <SignalSourcePanel />
        </div>
      </div>

      {/* 第三行：三大策略状态卡片 */}
      <StrategyCards />

      {/* 第四行：K线图表和持仓 */}
      <KlineChart />
    </Space>
  );
};

export default Dashboard;
