/**
 * 市场状态面板
 * 展示当前市场regime和特征
 */

import React, { useEffect, useState } from 'react';
import { Card, Tag, Progress, Space, Statistic, Row, Col } from 'antd';
import { 
  ArrowUpOutlined, 
  ArrowDownOutlined, 
  LineChartOutlined,
  ThunderboltOutlined 
} from '@ant-design/icons';
import { getCurrentRegime, type MarketRegime } from '../../api/marketRegime';

const MarketRegimePanel: React.FC = () => {
  const [regime, setRegime] = useState<MarketRegime | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRegime();
    const interval = setInterval(loadRegime, 30000); // 每30秒刷新
    return () => clearInterval(interval);
  }, []);

  const loadRegime = async () => {
    try {
      const data = await getCurrentRegime();
      setRegime(data);
    } catch (error) {
      console.error('Failed to load market regime:', error);
    } finally {
      setLoading(false);
    }
  };

  const getRegimeInfo = (regimeType: string) => {
    const info = {
      trend: {
        color: 'green',
        icon: <ArrowUpOutlined />,
        text: '趋势市',
        description: '强趋势，适合趋势跟踪策略'
      },
      ranging: {
        color: 'blue',
        icon: <LineChartOutlined />,
        text: '震荡市',
        description: '横盘整理，适合均值回归策略'
      },
      breakout: {
        color: 'orange',
        icon: <ThunderboltOutlined />,
        text: '突破市',
        description: '价格突破关键位，适合突破策略'
      },
      abnormal: {
        color: 'red',
        icon: <ArrowDownOutlined />,
        text: '异常市',
        description: '波动异常，建议谨慎或观望'
      }
    };
    return info[regimeType as keyof typeof info] || info.abnormal;
  };

  if (!regime) {
    return <Card loading={loading}>加载中...</Card>;
  }

  const regimeInfo = getRegimeInfo(regime.regime);
  const confidencePercent = Math.round(regime.confidence * 100);

  return (
    <Card 
      title="当前市场状态" 
      loading={loading}
      extra={<Tag color={regimeInfo.color}>{regimeInfo.text}</Tag>}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        {/* 主状态显示 */}
        <div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' }}>
            {regimeInfo.icon} {regimeInfo.text}
          </div>
          <div style={{ color: '#666', marginBottom: '16px' }}>
            {regimeInfo.description}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>置信度:</span>
            <Progress 
              percent={confidencePercent} 
              strokeColor={regimeInfo.color}
              style={{ flex: 1 }}
            />
            <span style={{ fontWeight: 'bold' }}>{confidencePercent}%</span>
          </div>
        </div>

        {/* 市场特征 */}
        <Row gutter={16}>
          <Col span={8}>
            <Statistic 
              title="ADX (趋势强度)" 
              value={regime.features.adx.toFixed(1)}
              suffix={regime.features.adx > 25 ? '强' : '弱'}
            />
          </Col>
          <Col span={8}>
            <Statistic 
              title="ATR (波动率)" 
              value={regime.features.atr.toFixed(1)}
            />
          </Col>
          <Col span={8}>
            <Statistic 
              title="趋势一致性" 
              value={(regime.features.trend_alignment * 100).toFixed(0)}
              suffix="%"
            />
          </Col>
        </Row>

        {/* 激活策略 */}
        <div>
          <div style={{ color: '#666', marginBottom: '4px' }}>激活策略:</div>
          <Tag color="blue" style={{ fontSize: '14px', padding: '4px 12px' }}>
            {regime.active_strategy === 'trend_following' && '趋势跟踪'}
            {regime.active_strategy === 'mean_reversion' && '均值回归'}
            {regime.active_strategy === 'breakout' && '突破策略'}
            {regime.active_strategy === 'conservative' && '保守策略'}
          </Tag>
          <span style={{ color: '#999', marginLeft: '8px' }}>
            持续 {regime.duration_minutes} 分钟
          </span>
        </div>
      </Space>
    </Card>
  );
};

export default MarketRegimePanel;
