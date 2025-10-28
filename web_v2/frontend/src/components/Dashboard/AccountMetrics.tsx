/**
 * 账户权益指标组件
 * 展示账户余额、今日收益、胜率、夏普比率等核心指标
 */

import React, { useEffect, useState } from 'react';
import { Card, Row, Col, Statistic, Progress, Space, Tag } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined, TrophyOutlined, RiseOutlined } from '@ant-design/icons';
import { getAccount } from '../../api/trading';
import { getStrategyPerformance } from '../../api/strategy';
import { safeToFixed, safeNumber } from '../../utils/format';

interface AccountMetricsData {
  equity: number;
  equityChange: number;
  equityChangePercent: number;
  todayPnl: number;
  todayPnlPercent: number;
  winRate: number;
  totalTrades: number;
  winTrades: number;
  sharpeRatio: number;
  maxDrawdown: number;
}

const AccountMetrics: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AccountMetricsData>({
    equity: 0,
    equityChange: 0,
    equityChangePercent: 0,
    todayPnl: 0,
    todayPnlPercent: 0,
    winRate: 0,
    totalTrades: 0,
    winTrades: 0,
    sharpeRatio: 0,
    maxDrawdown: 0,
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const [accountRes, perfRes] = await Promise.all([
        getAccount(),
        getStrategyPerformance('all')
      ]);

      const account = accountRes.data || {};
      const perf = perfRes.data || {};

      setData({
        equity: safeNumber(account.equity, 50000),
        equityChange: safeNumber(account.pnl, 0),
        equityChangePercent: safeNumber(account.pnl_percent, 0),
        todayPnl: safeNumber(account.today_pnl, 0),
        todayPnlPercent: safeNumber(account.today_pnl_percent, 0),
        winRate: safeNumber(perf.win_rate, 0),
        totalTrades: safeNumber(perf.total_trades, 0),
        winTrades: safeNumber(perf.win_trades, 0),
        sharpeRatio: safeNumber(perf.sharpe_ratio, 0),
        maxDrawdown: safeNumber(perf.max_drawdown, 0),
      });
    } catch (error) {
      console.error('Failed to fetch account metrics:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000); // 每5秒更新
    return () => clearInterval(interval);
  }, []);

  const getPercentColor = (value: number) => {
    if (value > 0) return '#52c41a';
    if (value < 0) return '#ff4d4f';
    return '#8c8c8c';
  };

  const getSharpeRating = (sharpe: number) => {
    if (sharpe >= 2) return { text: '优秀', color: 'success' };
    if (sharpe >= 1.5) return { text: '良好', color: 'success' };
    if (sharpe >= 1) return { text: '一般', color: 'warning' };
    return { text: '较差', color: 'error' };
  };

  const sharpeRating = getSharpeRating(data.sharpeRatio);

  return (
    <Card 
      title="账户概览" 
      loading={loading}
      extra={
        <Space>
          <Tag color="blue">实时更新</Tag>
        </Space>
      }
    >
      <Row gutter={[16, 16]}>
        {/* 账户权益 */}
        <Col xs={24} sm={12} md={6}>
          <Card bordered={false} style={{ background: '#f5f5f5' }}>
            <Statistic
              title="账户权益"
              value={data.equity}
              precision={2}
              prefix="¥"
              valueStyle={{ color: '#1890ff' }}
            />
            <div style={{ marginTop: 8 }}>
              <Space>
                {data.equityChangePercent >= 0 ? (
                  <ArrowUpOutlined style={{ color: '#52c41a' }} />
                ) : (
                  <ArrowDownOutlined style={{ color: '#ff4d4f' }} />
                )}
                <span style={{ color: getPercentColor(data.equityChangePercent) }}>
                  {data.equityChangePercent >= 0 ? '+' : ''}
                  {safeToFixed(data.equityChangePercent, 2)}%
                </span>
              </Space>
            </div>
          </Card>
        </Col>

        {/* 今日收益 */}
        <Col xs={24} sm={12} md={6}>
          <Card bordered={false} style={{ background: '#f5f5f5' }}>
            <Statistic
              title="今日收益"
              value={data.todayPnl}
              precision={2}
              prefix={data.todayPnl >= 0 ? '+¥' : '-¥'}
              valueStyle={{ color: getPercentColor(data.todayPnl) }}
            />
            <div style={{ marginTop: 8 }}>
              <Tag color={data.todayPnl >= 0 ? 'success' : 'error'}>
                {data.todayPnl >= 0 ? '🟢 盈利' : '🔴 亏损'}
              </Tag>
              <span style={{ color: getPercentColor(data.todayPnlPercent) }}>
                {data.todayPnlPercent >= 0 ? '+' : ''}
                {safeToFixed(data.todayPnlPercent, 2)}%
              </span>
            </div>
          </Card>
        </Col>

        {/* 胜率 */}
        <Col xs={24} sm={12} md={6}>
          <Card bordered={false} style={{ background: '#f5f5f5' }}>
            <Statistic
              title="胜率"
              value={data.winRate}
              precision={1}
              suffix="%"
              valueStyle={{ color: data.winRate >= 60 ? '#52c41a' : '#faad14' }}
              prefix={<TrophyOutlined />}
            />
            <div style={{ marginTop: 8 }}>
              <span style={{ color: '#8c8c8c' }}>
                {data.winTrades}/{data.totalTrades} 胜/总
              </span>
            </div>
            <Progress 
              percent={data.winRate} 
              size="small" 
              strokeColor={data.winRate >= 60 ? '#52c41a' : '#faad14'}
              showInfo={false}
              style={{ marginTop: 4 }}
            />
          </Card>
        </Col>

        {/* 夏普比率 */}
        <Col xs={24} sm={12} md={6}>
          <Card bordered={false} style={{ background: '#f5f5f5' }}>
            <Statistic
              title="夏普比率"
              value={data.sharpeRatio}
              precision={2}
              valueStyle={{ 
                color: data.sharpeRatio >= 1.5 ? '#52c41a' : data.sharpeRatio >= 1 ? '#faad14' : '#ff4d4f' 
              }}
              prefix={<RiseOutlined />}
            />
            <div style={{ marginTop: 8 }}>
              <Tag color={sharpeRating.color}>
                {sharpeRating.text}
              </Tag>
              {data.sharpeRatio >= 1.5 && <span>⭐️</span>}
            </div>
          </Card>
        </Col>
      </Row>

      {/* 最大回撤 */}
      <Row style={{ marginTop: 16 }}>
        <Col span={24}>
          <div style={{ padding: '12px', background: '#fafafa', borderRadius: '4px' }}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#595959' }}>最大回撤</span>
                <span style={{ 
                  color: Math.abs(data.maxDrawdown) <= 5 ? '#52c41a' : 
                        Math.abs(data.maxDrawdown) <= 10 ? '#faad14' : '#ff4d4f',
                  fontSize: '16px',
                  fontWeight: 'bold'
                }}>
                  {safeToFixed(data.maxDrawdown, 2)}%
                </span>
              </div>
              <Progress 
                percent={Math.min(Math.abs(data.maxDrawdown), 20) / 20 * 100}
                strokeColor={
                  Math.abs(data.maxDrawdown) <= 5 ? '#52c41a' : 
                  Math.abs(data.maxDrawdown) <= 10 ? '#faad14' : '#ff4d4f'
                }
                showInfo={false}
              />
              <div style={{ fontSize: '12px', color: '#8c8c8c' }}>
                {Math.abs(data.maxDrawdown) <= 5 ? '✅ 风险可控' : 
                 Math.abs(data.maxDrawdown) <= 10 ? '⚠️ 需要关注' : '🔴 风险较高'}
              </div>
            </Space>
          </div>
        </Col>
      </Row>
    </Card>
  );
};

export default AccountMetrics;
