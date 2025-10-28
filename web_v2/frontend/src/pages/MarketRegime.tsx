/**
 * 市场态势与策略页面
 * 深入展示市场状态识别、多周期分析和策略表现
 */

import React, { useEffect, useState } from 'react';
import { Card, Row, Col, Table, Timeline, Space, Tag, Progress, Statistic } from 'antd';
import { 
  LineChartOutlined, 
  RocketOutlined,
  AlertOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined
} from '@ant-design/icons';
import { 
  getCurrentRegime,
  getRegimeHistory,
  getTrendAlignment,
  type MarketRegime as RegimeData,
  type RegimeHistoryItem,
  type MultiTimeframeTrend
} from '../api/marketRegime';

interface MarketRegimeProps {
  wsMessage?: any;
}

const MarketRegime: React.FC<MarketRegimeProps> = () => {
  const [loading, setLoading] = useState(true);
  const [currentRegime, setCurrentRegime] = useState<RegimeData | null>(null);
  const [regimeHistory, setRegimeHistory] = useState<RegimeHistoryItem[]>([]);
  const [multiTimeframe, setMultiTimeframe] = useState<MultiTimeframeTrend[]>([]);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // 并行获取所有数据
      const [currentRes, historyRes, alignmentRes] = await Promise.all([
        getCurrentRegime(),
        getRegimeHistory(24),
        getTrendAlignment()
      ]);

      setCurrentRegime(currentRes as any);
      setRegimeHistory(historyRes.history || []);
      setMultiTimeframe(alignmentRes.timeframes || []);
    } catch (error) {
      console.error('Failed to fetch market regime data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000); // 每10秒更新
    return () => clearInterval(interval);
  }, []);

  const getRegimeIcon = (regime: string) => {
    switch (regime) {
      case 'trend':
        return <LineChartOutlined style={{ color: '#52c41a' }} />;
      case 'ranging':
        return <LineChartOutlined style={{ color: '#1890ff' }} />;
      case 'breakout':
        return <RocketOutlined style={{ color: '#faad14' }} />;
      case 'abnormal':
        return <AlertOutlined style={{ color: '#ff4d4f' }} />;
      default:
        return <ClockCircleOutlined />;
    }
  };

  const getRegimeColor = (regime: string) => {
    switch (regime) {
      case 'trend': return 'success';
      case 'ranging': return 'processing';
      case 'breakout': return 'warning';
      case 'abnormal': return 'error';
      default: return 'default';
    }
  };

  const getRegimeName = (regime: string) => {
    switch (regime) {
      case 'trend': return '趋势市';
      case 'ranging': return '震荡市';
      case 'breakout': return '突破市';
      case 'abnormal': return '异常市';
      default: return regime;
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up': return '🟢 上涨';
      case 'down': return '🔴 下跌';
      case 'sideways': return '⚪ 震荡';
      default: return trend;
    }
  };

  const getTrendStrength = (adx: number) => {
    if (adx >= 30) return { text: '强趋势', color: '#52c41a' };
    if (adx >= 25) return { text: '中趋势', color: '#1890ff' };
    if (adx >= 20) return { text: '弱趋势', color: '#faad14' };
    return { text: '无趋势', color: '#8c8c8c' };
  };

  const multiTimeframeColumns = [
    {
      title: '周期',
      dataIndex: 'period',
      key: 'period',
      render: (period: string) => <strong>{period}</strong>
    },
    {
      title: '趋势',
      dataIndex: 'trend',
      key: 'trend',
      render: (trend: string) => getTrendIcon(trend)
    },
    {
      title: 'ADX',
      dataIndex: 'adx',
      key: 'adx',
      render: (adx: number) => {
        const strength = getTrendStrength(adx);
        return (
          <Space>
            <span style={{ fontWeight: 'bold' }}>{adx.toFixed(1)}</span>
            <Tag color={strength.color}>{strength.text}</Tag>
          </Space>
        );
      }
    },
    {
      title: 'MA偏离',
      dataIndex: 'ma_deviation',
      key: 'ma_deviation',
      render: (deviation: number) => (
        <span style={{ color: Math.abs(deviation) > 5 ? '#ff4d4f' : '#52c41a' }}>
          {deviation >= 0 ? '+' : ''}{deviation.toFixed(2)}%
        </span>
      )
    }
  ];

  const consistency = multiTimeframe.length > 0 
    ? (multiTimeframe.filter(t => t.trend === multiTimeframe[0].trend).length / multiTimeframe.length) * 100 
    : 0;

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      {/* 当前市场状态 */}
      <Card 
        title="当前市场状态" 
        loading={loading}
        extra={<Tag color="blue">实时更新</Tag>}
      >
        {currentRegime && (
          <Row gutter={[16, 16]}>
            <Col span={24}>
              <Space size="large" style={{ width: '100%', justifyContent: 'space-around' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '48px', marginBottom: '8px' }}>
                    {getRegimeIcon(currentRegime.regime)}
                  </div>
                  <Tag 
                    color={getRegimeColor(currentRegime.regime)} 
                    style={{ fontSize: '16px', padding: '4px 16px' }}
                  >
                    {getRegimeName(currentRegime.regime)}
                  </Tag>
                </div>

                <Statistic
                  title="置信度"
                  value={currentRegime.confidence * 100}
                  precision={1}
                  suffix="%"
                  valueStyle={{ color: currentRegime.confidence * 100 >= 80 ? '#52c41a' : '#faad14' }}
                />

                <Statistic
                  title="持续时间"
                  value={currentRegime.duration_minutes}
                  suffix="分钟"
                />

                <Statistic
                  title="ADX"
                  value={currentRegime.features.adx}
                  precision={1}
                  valueStyle={{ 
                    color: currentRegime.features.adx >= 25 ? '#52c41a' : '#8c8c8c' 
                  }}
                />

                <Statistic
                  title="波动率"
                  value={currentRegime.features.volatility * 100}
                  precision={2}
                  suffix="%"
                />
              </Space>
            </Col>

            <Col span={24}>
              <div style={{ marginTop: '16px' }}>
                <div style={{ marginBottom: '8px', color: '#595959' }}>
                  置信度
                </div>
                <Progress 
                  percent={currentRegime.confidence * 100} 
                  strokeColor={{
                    '0%': '#108ee9',
                    '100%': '#87d068',
                  }}
                />
              </div>
            </Col>

            <Col span={24}>
              <Card 
                size="small" 
                title="激活策略" 
                style={{ background: 'rgba(255, 255, 255, 0.08)' }}
              >
                <Space>
                  <CheckCircleOutlined style={{ color: '#52c41a', fontSize: '20px' }} />
                  <span style={{ fontSize: '16px', fontWeight: 'bold' }}>
                    {currentRegime.active_strategy}
                  </span>
                </Space>
              </Card>
            </Col>
          </Row>
        )}
      </Card>

      {/* 多周期趋势一致性 */}
      <Card title="多周期趋势一致性矩阵" loading={loading}>
        <Row gutter={16}>
          <Col span={24}>
            <div style={{ marginBottom: '16px' }}>
              <Space>
                <span style={{ color: '#595959' }}>一致性:</span>
                <Tag color={consistency === 100 ? 'success' : consistency >= 75 ? 'processing' : 'warning'}>
                  {consistency === 100 ? '✅' : consistency >= 75 ? '⚠️' : '❌'} {consistency.toFixed(0)}%
                </Tag>
              </Space>
              <Progress 
                percent={consistency} 
                strokeColor={consistency === 100 ? '#52c41a' : consistency >= 75 ? '#1890ff' : '#faad14'}
                style={{ marginTop: '8px' }}
              />
            </div>
          </Col>
          <Col span={24}>
            <Table
              columns={multiTimeframeColumns}
              dataSource={multiTimeframe}
              rowKey="period"
              pagination={false}
              size="small"
            />
          </Col>
        </Row>
      </Card>

      {/* 状态切换历史 */}
      <Card title="市场状态切换历史" loading={loading}>
        <Timeline>
          {regimeHistory.map((item, index) => (
            <Timeline.Item
              key={index}
              color={getRegimeColor(item.regime)}
              dot={getRegimeIcon(item.regime)}
            >
              <Space direction="vertical" size="small">
                <Space>
                  <strong>{item.timestamp}</strong>
                  <Tag color={getRegimeColor(item.regime)}>
                    {getRegimeName(item.regime)}
                  </Tag>
                  <span style={{ color: '#8c8c8c' }}>
                    持续 {item.duration_minutes} 分钟
                  </span>
                </Space>
                <div style={{ color: '#595959', fontSize: '12px' }}>
                  切换原因: {item.switch_reason}
                </div>
              </Space>
            </Timeline.Item>
          ))}
        </Timeline>
      </Card>

      {/* 策略切换逻辑 */}
      <Card title="策略切换逻辑图">
        <div style={{ padding: '24px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '8px' }}>
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ 
                padding: '12px 24px', 
                background: '#1890ff', 
                color: 'white', 
                borderRadius: '4px',
                fontWeight: 'bold'
              }}>
                市场状态识别
              </div>
              <span style={{ fontSize: '20px' }}>→</span>
              <div style={{ flex: 1 }}>
                <Space direction="vertical" style={{ width: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Tag color="success">ADX &gt; 25</Tag>
                    <span>→</span>
                    <span style={{ fontWeight: 'bold' }}>趋势跟踪策略</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Tag color="processing">ADX &lt; 20 + BB窄</Tag>
                    <span>→</span>
                    <span style={{ fontWeight: 'bold' }}>均值回归策略</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Tag color="warning">接近关键位 + 放量</Tag>
                    <span>→</span>
                    <span style={{ fontWeight: 'bold' }}>突破策略</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Tag color="error">波动率暴增/流动性枯竭</Tag>
                    <span>→</span>
                    <span style={{ fontWeight: 'bold' }}>防守模式 + LLM专家</span>
                  </div>
                </Space>
              </div>
            </div>
          </Space>
        </div>
      </Card>
    </Space>
  );
};

export default MarketRegime;
