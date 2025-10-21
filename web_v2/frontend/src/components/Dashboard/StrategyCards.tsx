/**
 * 三大策略状态卡片
 * 展示趋势跟踪、均值回归、突破策略的实时表现
 */

import React, { useEffect, useState } from 'react';
import { Card, Row, Col, Statistic, Tag, Space, Button } from 'antd';
import { 
  CheckCircleOutlined, 
  PauseCircleOutlined, 
  RiseOutlined,
  FallOutlined 
} from '@ant-design/icons';
import { getStrategySummary, type StrategySummary } from '../../api/strategy';

const StrategyCards: React.FC = () => {
  const [summary, setSummary] = useState<StrategySummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSummary();
    const interval = setInterval(loadSummary, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadSummary = async () => {
    try {
      const data = await getStrategySummary();
      setSummary(data);
    } catch (error) {
      console.error('Failed to load strategy summary:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!summary) {
    return (
      <Row gutter={16}>
        {[1, 2, 3].map(i => (
          <Col span={8} key={i}>
            <Card loading={loading}>加载中...</Card>
          </Col>
        ))}
      </Row>
    );
  }

  const strategies = [
    {
      key: 'trend_following',
      name: '趋势跟踪策略',
      description: '多周期趋势一致性跟踪',
      icon: <RiseOutlined style={{ fontSize: '32px', color: '#1890ff' }} />
    },
    {
      key: 'mean_reversion',
      name: '均值回归策略',
      description: '布林带+RSI超买超卖',
      icon: <FallOutlined style={{ fontSize: '32px', color: '#52c41a' }} />
    },
    {
      key: 'breakout',
      name: '突破策略',
      description: '成交量确认的价格突破',
      icon: <RiseOutlined style={{ fontSize: '32px', color: '#faad14' }} />
    }
  ];

  return (
    <Row gutter={16}>
      {strategies.map(strategy => {
        const data = summary.strategies[strategy.key];
        const isActive = data.status === 'active';

        return (
          <Col span={8} key={strategy.key}>
            <Card
              title={
                <Space>
                  {strategy.icon}
                  <span>{strategy.name}</span>
                </Space>
              }
              extra={
                isActive ? (
                  <Tag color="green" icon={<CheckCircleOutlined />}>激活</Tag>
                ) : (
                  <Tag color="default" icon={<PauseCircleOutlined />}>待命</Tag>
                )
              }
              style={{
                borderLeft: isActive ? '4px solid #52c41a' : 'none'
              }}
            >
              <Space direction="vertical" style={{ width: '100%' }} size="middle">
                {/* 描述 */}
                <div style={{ color: '#666', fontSize: '13px' }}>
                  {strategy.description}
                </div>

                {/* 今日统计 */}
                <Row gutter={12}>
                  <Col span={12}>
                    <Statistic 
                      title="今日信号" 
                      value={data.today_signals}
                      suffix="次"
                      valueStyle={{ fontSize: '18px' }}
                    />
                  </Col>
                  <Col span={12}>
                    <Statistic 
                      title="已执行" 
                      value={data.executed_signals}
                      suffix="次"
                      valueStyle={{ fontSize: '18px' }}
                    />
                  </Col>
                </Row>

                {/* 表现指标 */}
                <Row gutter={12}>
                  <Col span={12}>
                    <div style={{ fontSize: '12px', color: '#999' }}>胜率</div>
                    <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
                      {(data.win_rate * 100).toFixed(0)}%
                    </div>
                  </Col>
                  <Col span={12}>
                    <div style={{ fontSize: '12px', color: '#999' }}>盈亏比</div>
                    <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
                      {data.profit_loss_ratio.toFixed(1)}:1
                    </div>
                  </Col>
                </Row>

                <Row gutter={12}>
                  <Col span={12}>
                    <div style={{ fontSize: '12px', color: '#999' }}>平均置信</div>
                    <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
                      {(data.avg_confidence * 100).toFixed(0)}%
                    </div>
                  </Col>
                  <Col span={12}>
                    <div style={{ fontSize: '12px', color: '#999' }}>今日盈亏</div>
                    <div 
                      style={{ 
                        fontSize: '18px', 
                        fontWeight: 'bold',
                        color: data.total_pnl >= 0 ? '#52c41a' : '#ff4d4f'
                      }}
                    >
                      {data.total_pnl >= 0 ? '+' : ''}{data.total_pnl.toFixed(0)}
                    </div>
                  </Col>
                </Row>

                {/* 操作按钮 */}
                <Button 
                  type="link" 
                  size="small"
                  style={{ padding: 0 }}
                  onClick={() => {
                    // TODO: 跳转到详情页
                    console.log('View details:', strategy.key);
                  }}
                >
                  查看详情 →
                </Button>
              </Space>
            </Card>
          </Col>
        );
      })}
    </Row>
  );
};

export default StrategyCards;
