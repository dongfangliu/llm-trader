/**
 * 总览仪表盘 - 专业炒股软件风格
 * 实时交易监控与快速下单界面
 */

import React from 'react';
import { Row, Col } from 'antd';
import RealTimePricePanel from './RealTimePricePanel';
import QuickTradePanel from './QuickTradePanel';
import PositionPanel from './PositionPanel';
import AccountMetrics from './AccountMetrics';
import KlineChart from './KlineChart';
import MarketRegimePanel from './MarketRegimePanel';
import SignalSourcePanel from './SignalSourcePanel';
import './Dashboard.css';

interface DashboardProps {
  klineUpdates?: Map<string, any[]>;  // 新增
  latestTick?: any;                   // 新增
}

const Dashboard: React.FC<DashboardProps> = ({
  klineUpdates,
  latestTick
}) => {
  return (
    <div className="professional-trading-layout">
      {/* 主体区域：左右分栏 */}
      <Row gutter={[12, 12]} style={{ height: '100%' }}>
        {/* 左侧主图表区 (70%) */}
        <Col xs={24} xl={17} style={{ height: '100%' }}>
          <div className="left-main-area">
            {/* K线图表/分时图 - 占主要空间 */}
            <div className="chart-section">
              {/* 传递klineUpdates，图表内已集成分时图切换 */}
              <KlineChart klineUpdates={klineUpdates} />
            </div>

            {/* 底部信息面板 - 市场态势 + 信号分布 */}
            <div className="bottom-info-section">
              <Row gutter={12}>
                <Col xs={24} md={12}>
                  <MarketRegimePanel />
                </Col>
                <Col xs={24} md={12}>
                  <SignalSourcePanel />
                </Col>
              </Row>
            </div>
          </div>
        </Col>

        {/* 右侧交易控制区 (30%) */}
        <Col xs={24} xl={7} style={{ height: '100%' }}>
          <div className="right-trading-area">
            {/* 实时报价 */}
            <div className="price-ticker-section">
              {/* 传递latestTick */}
              <RealTimePricePanel latestTick={latestTick} />
            </div>

            {/* 快速交易面板 */}
            <div className="quick-trade-section">
              <QuickTradePanel />
            </div>

            {/* 持仓明细 */}
            <div className="position-section">
              <PositionPanel />
            </div>

            {/* 账户信息 */}
            <div className="account-section">
              <AccountMetrics />
            </div>
          </div>
        </Col>
      </Row>
    </div>
  );
};

export default Dashboard;
