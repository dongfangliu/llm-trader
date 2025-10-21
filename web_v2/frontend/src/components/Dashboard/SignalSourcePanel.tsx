/**
 * 信号来源分布面板
 * 展示量化vs LLM信号分布，验证80/20原则
 */

import React, { useEffect, useState } from 'react';
import { Card, Progress, Space, Statistic, Row, Col, Alert } from 'antd';
import { CheckCircleOutlined, WarningOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { getSignalSourceDistribution, type SignalSourceDistribution } from '../../api/strategy';

const SignalSourcePanel: React.FC = () => {
  const [data, setData] = useState<SignalSourceDistribution | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 60000); // 每分钟刷新
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      const result = await getSignalSourceDistribution(30);
      setData(result);
    } catch (error) {
      console.error('Failed to load signal source distribution:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!data) {
    return <Card loading={loading}>加载中...</Card>;
  }

  // 饼图配置
  const pieOption = {
    tooltip: {
      trigger: 'item',
      formatter: '{b}: {c} ({d}%)'
    },
    legend: {
      orient: 'vertical',
      left: 'right'
    },
    series: [
      {
        name: '信号来源',
        type: 'pie',
        radius: '70%',
        data: [
          { value: data.total.quant, name: '量化信号' },
          { value: data.total.llm, name: 'LLM主导' },
          { value: data.total.quant_llm, name: '量化+LLM' }
        ],
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowOffsetX: 0,
            shadowColor: 'rgba(0, 0, 0, 0.5)'
          }
        },
        label: {
          formatter: '{b}\n{d}%'
        }
      }
    ],
    color: ['#1890ff', '#52c41a', '#faad14']
  };

  // 趋势图配置
  const trendOption = {
    tooltip: {
      trigger: 'axis'
    },
    legend: {
      data: ['量化信号', 'LLM复核', '量化+LLM']
    },
    xAxis: {
      type: 'category',
      data: data.daily.map(d => d.date.substring(5)) // 只显示月-日
    },
    yAxis: {
      type: 'value',
      name: '信号数量'
    },
    series: [
      {
        name: '量化信号',
        type: 'bar',
        stack: 'total',
        data: data.daily.map(d => d.quant),
        itemStyle: { color: '#1890ff' }
      },
      {
        name: 'LLM复核',
        type: 'bar',
        stack: 'total',
        data: data.daily.map(d => d.llm),
        itemStyle: { color: '#52c41a' }
      },
      {
        name: '量化+LLM',
        type: 'bar',
        stack: 'total',
        data: data.daily.map(d => d.quant_llm),
        itemStyle: { color: '#faad14' }
      }
    ]
  };

  return (
    <Card 
      title="信号来源分布 (80/20原则验证)" 
      loading={loading}
      extra={
        data.meets_80_20 ? (
          <CheckCircleOutlined style={{ color: '#52c41a', fontSize: '18px' }} />
        ) : (
          <WarningOutlined style={{ color: '#faad14', fontSize: '18px' }} />
        )
      }
    >
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        {/* 状态提示 */}
        {data.meets_80_20 ? (
          <Alert 
            message="✓ 符合V4架构设计目标" 
            description="量化信号占比超过75%，系统运行在最优成本效率状态" 
            type="success" 
            showIcon 
          />
        ) : (
          <Alert 
            message="⚠ 未达到设计目标" 
            description="LLM使用频率偏高，建议优化量化策略置信度" 
            type="warning" 
            showIcon 
          />
        )}

        {/* 统计指标 */}
        <Row gutter={16}>
          <Col span={8}>
            <Statistic 
              title="量化信号占比" 
              value={data.ratio.quant_percent}
              suffix="%"
              valueStyle={{ color: data.meets_80_20 ? '#52c41a' : '#faad14' }}
            />
          </Col>
          <Col span={8}>
            <Statistic 
              title="LLM占比" 
              value={data.ratio.llm_percent}
              suffix="%"
            />
          </Col>
          <Col span={8}>
            <Statistic 
              title="总信号数" 
              value={data.total.quant + data.total.llm + data.total.quant_llm}
            />
          </Col>
        </Row>

        {/* 可视化图表 */}
        <Row gutter={16}>
          <Col span={12}>
            <div style={{ textAlign: 'center', marginBottom: '8px', fontWeight: 'bold' }}>
              信号来源分布
            </div>
            <ReactECharts option={pieOption} style={{ height: '250px' }} />
          </Col>
          <Col span={12}>
            <div style={{ textAlign: 'center', marginBottom: '8px', fontWeight: 'bold' }}>
              30天趋势
            </div>
            <ReactECharts option={trendOption} style={{ height: '250px' }} />
          </Col>
        </Row>

        {/* 详细数据 */}
        <div>
          <div style={{ color: '#666', marginBottom: '8px' }}>今日统计</div>
          <div>
            <Progress 
              percent={100} 
              success={{ percent: data.ratio.quant_percent }}
              format={() => `量化 ${data.ratio.quant_percent}% | LLM ${data.ratio.llm_percent}%`}
            />
          </div>
        </div>
      </Space>
    </Card>
  );
};

export default SignalSourcePanel;
