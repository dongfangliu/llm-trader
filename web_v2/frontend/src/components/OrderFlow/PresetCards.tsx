/**
 * 预设配置卡片
 * 展示所有预设方案供用户快速选择
 */

import React from 'react';
import { Card, Row, Col, Tag, Descriptions, Button } from 'antd';
import { ThunderboltOutlined, RocketOutlined, DashboardOutlined, FireOutlined, LineChartOutlined, SafetyOutlined } from '@ant-design/icons';

interface PresetConfig {
  name: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  config: {
    bucket_size: number;
    lookback: number;
    threshold_multiplier: number;
    max_history: number;
  };
  features: string[];
}

interface PresetCardsProps {
  onSelect: (config: any) => void;
}

const PRESETS: Record<string, PresetConfig> = {
  default: {
    name: '默认配置',
    description: '平衡的参数设置，适合大多数场景',
    icon: <DashboardOutlined />,
    color: 'blue',
    config: {
      bucket_size: 50,
      lookback: 100,
      threshold_multiplier: 2.5,
      max_history: 1000
    },
    features: ['适用性广', '稳定可靠', '推荐新手']
  },
  scalping: {
    name: '短线交易',
    description: '高敏感度，快速响应市场变化',
    icon: <ThunderboltOutlined />,
    color: 'orange',
    config: {
      bucket_size: 30,
      lookback: 50,
      threshold_multiplier: 2.0,
      max_history: 800
    },
    features: ['高敏感度', '快速响应', '捕捉小波动']
  },
  trend: {
    name: '趋势跟随',
    description: '稳定信号，过滤噪音，关注主力资金',
    icon: <LineChartOutlined />,
    color: 'green',
    config: {
      bucket_size: 80,
      lookback: 150,
      threshold_multiplier: 3.5,
      max_history: 1500
    },
    features: ['稳定信号', '过滤噪音', '中长期']
  },
  largeOrder: {
    name: '大单监控',
    description: '专注超大单，严格筛选，减少误报',
    icon: <FireOutlined />,
    color: 'red',
    config: {
      bucket_size: 50,
      lookback: 100,
      threshold_multiplier: 4.0,
      max_history: 1000
    },
    features: ['超大单', '严格筛选', '低误报']
  },
  highFreq: {
    name: '高频交易',
    description: '极高敏感度，适合高频策略',
    icon: <RocketOutlined />,
    color: 'purple',
    config: {
      bucket_size: 20,
      lookback: 30,
      threshold_multiplier: 1.8,
      max_history: 500
    },
    features: ['极高敏感', '毫秒级', '专业用户']
  },
  conservative: {
    name: '保守策略',
    description: '低敏感度，稳定可靠',
    icon: <SafetyOutlined />,
    color: 'cyan',
    config: {
      bucket_size: 100,
      lookback: 200,
      threshold_multiplier: 5.0,
      max_history: 2000
    },
    features: ['低敏感度', '稳定可靠', '长周期']
  }
};

const PresetCards: React.FC<PresetCardsProps> = ({ onSelect }) => {
  return (
    <Row gutter={[12, 12]}>
      {Object.entries(PRESETS).map(([key, preset]) => (
        <Col xs={24} sm={12} lg={8} key={key}>
          <Card
            size="small"
            hoverable
            style={{ height: '100%' }}
            onClick={() => onSelect(preset.config)}
          >
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 24, marginRight: 8 }}>{preset.icon}</span>
                <div>
                  <div style={{ fontWeight: 'bold', fontSize: 16 }}>{preset.name}</div>
                  <Tag color={preset.color} style={{ marginTop: 4 }}>
                    {preset.description}
                  </Tag>
                </div>
              </div>
            </div>

            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="成交桶">{preset.config.bucket_size}手</Descriptions.Item>
              <Descriptions.Item label="回看窗口">{preset.config.lookback}笔</Descriptions.Item>
              <Descriptions.Item label="大单阈值">{preset.config.threshold_multiplier}倍</Descriptions.Item>
              <Descriptions.Item label="历史记录">{preset.config.max_history}次</Descriptions.Item>
            </Descriptions>

            <div style={{ marginTop: 12 }}>
              {preset.features.map((feature, index) => (
                <Tag key={index} style={{ marginBottom: 4 }}>
                  {feature}
                </Tag>
              ))}
            </div>

            <Button 
              type="primary" 
              size="small" 
              block 
              style={{ marginTop: 12 }}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(preset.config);
              }}
            >
              应用此配置
            </Button>
          </Card>
        </Col>
      ))}
    </Row>
  );
};

export default PresetCards;
