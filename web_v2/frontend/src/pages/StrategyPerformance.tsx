/**
 * 策略表现页面
 * 展示三大策略的详细表现、胜率、盈亏比等指标
 */

import React, { useEffect, useState, useRef } from 'react';
import { Card, Row, Col, Table, Space, Tag, Statistic, Select, Progress } from 'antd';
import { 
  TrophyOutlined, 
  RiseOutlined, 
  FallOutlined,
  LineChartOutlined
} from '@ant-design/icons';
import * as echarts from 'echarts';
import { 
  getStrategyPerformance, 
  getStrategyComparison,
  getStrategySignals 
} from '../api/strategy';

const { Option } = Select;

interface StrategyPerformance {
  strategy_name: string;
  total_trades: number;
  win_trades: number;
  lose_trades: number;
  win_rate: number;
  avg_profit: number;
  avg_loss: number;
  profit_loss_ratio: number;
  total_pnl: number;
  sharpe_ratio: number;
  max_drawdown: number;
  avg_holding_time: number;
}

interface SignalItem {
  timestamp: string;
  action: string;
  confidence: number;
  price: number;
  result: string;
  pnl: number;
}

const StrategyPerformance: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [selectedStrategy, setSelectedStrategy] = useState('trend_following');
  const [performance, setPerformance] = useState<StrategyPerformance | null>(null);
  const [comparison, setComparison] = useState<StrategyPerformance[]>([]);
  const [signals, setSignals] = useState<SignalItem[]>([]);
  
  const comparisonChartRef = useRef<HTMLDivElement>(null);
  const comparisonChart = useRef<echarts.ECharts | null>(null);
  const pnlChartRef = useRef<HTMLDivElement>(null);
  const pnlChart = useRef<echarts.ECharts | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [perfRes, compRes, signalsRes] = await Promise.all([
        getStrategyPerformance(selectedStrategy),
        getStrategyComparison(),
        getStrategySignals(selectedStrategy, 50)
      ]);

      setPerformance(perfRes as any);
      setComparison((compRes as any).strategies || []);
      setSignals((signalsRes as any).signals || []);
    } catch (error) {
      console.error('Failed to fetch strategy performance:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [selectedStrategy]);

  // 策略对比图表
  useEffect(() => {
    if (!comparisonChartRef.current || comparison.length === 0) return;

    if (!comparisonChart.current) {
      comparisonChart.current = echarts.init(comparisonChartRef.current);
    }

    const chart = comparisonChart.current;
    
    const strategyNames = comparison.map(s => s.strategy_name);
    const winRates = comparison.map(s => s.win_rate);
    const sharpeRatios = comparison.map(s => s.sharpe_ratio);
    const profitLossRatios = comparison.map(s => s.profit_loss_ratio);

    const option = {
      title: {
        text: '三大策略对比',
        left: 'center'
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'shadow'
        }
      },
      legend: {
        data: ['胜率 (%)', '夏普比率', '盈亏比'],
        bottom: 10
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '15%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: strategyNames
      },
      yAxis: {
        type: 'value'
      },
      series: [
        {
          name: '胜率 (%)',
          type: 'bar',
          data: winRates,
          itemStyle: { color: '#52c41a' }
        },
        {
          name: '夏普比率',
          type: 'bar',
          data: sharpeRatios,
          itemStyle: { color: '#1890ff' }
        },
        {
          name: '盈亏比',
          type: 'bar',
          data: profitLossRatios,
          itemStyle: { color: '#faad14' }
        }
      ]
    };

    chart.setOption(option);

    const handleResize = () => chart.resize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [comparison]);

  // 盈亏曲线图表
  useEffect(() => {
    if (!pnlChartRef.current || signals.length === 0) return;

    if (!pnlChart.current) {
      pnlChart.current = echarts.init(pnlChartRef.current);
    }

    const chart = pnlChart.current;
    
    let cumulativePnl = 0;
    const pnlData = signals.map((signal) => {
      cumulativePnl += signal.pnl || 0;
      return {
        timestamp: signal.timestamp,
        pnl: cumulativePnl
      };
    });

    const option = {
      title: {
        text: '累计盈亏曲线',
        left: 'center'
      },
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          const data = params[0];
          return `${data.name}<br/>累计盈亏: ¥${data.value.toFixed(2)}`;
        }
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '10%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: pnlData.map(d => d.timestamp),
        axisLabel: {
          rotate: 45,
          formatter: (value: string) => {
            const date = new Date(value);
            return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
          }
        }
      },
      yAxis: {
        type: 'value',
        name: '累计盈亏 (¥)'
      },
      series: [
        {
          name: '盈亏',
          type: 'line',
          data: pnlData.map(d => d.pnl),
          smooth: true,
          lineStyle: {
            width: 2
          },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(82, 196, 26, 0.3)' },
              { offset: 1, color: 'rgba(82, 196, 26, 0.1)' }
            ])
          },
          itemStyle: {
            color: '#52c41a'
          }
        }
      ]
    };

    chart.setOption(option);

    const handleResize = () => chart.resize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [signals]);

  useEffect(() => {
    return () => {
      if (comparisonChart.current) {
        comparisonChart.current.dispose();
        comparisonChart.current = null;
      }
      if (pnlChart.current) {
        pnlChart.current.dispose();
        pnlChart.current = null;
      }
    };
  }, []);

  const getStrategyName = (key: string) => {
    switch (key) {
      case 'trend_following': return '趋势跟踪';
      case 'mean_reversion': return '均值回归';
      case 'breakout': return '突破策略';
      default: return key;
    }
  };

  const signalColumns = [
    {
      title: '时间',
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 180
    },
    {
      title: '操作',
      dataIndex: 'action',
      key: 'action',
      width: 100,
      render: (action: string) => {
        const color = action.includes('long') ? 'success' : 
                     action.includes('short') ? 'error' : 'default';
        return <Tag color={color}>{action}</Tag>;
      }
    },
    {
      title: '置信度',
      dataIndex: 'confidence',
      key: 'confidence',
      width: 100,
      render: (conf: number) => (
        <span style={{ color: conf >= 80 ? '#52c41a' : conf >= 60 ? '#faad14' : '#ff4d4f' }}>
          {conf.toFixed(0)}%
        </span>
      )
    },
    {
      title: '价格',
      dataIndex: 'price',
      key: 'price',
      width: 100,
      render: (price: number) => `¥${price.toFixed(2)}`
    },
    {
      title: '结果',
      dataIndex: 'result',
      key: 'result',
      width: 80,
      render: (result: string) => {
        const color = result === 'win' ? 'success' : result === 'lose' ? 'error' : 'default';
        const text = result === 'win' ? '盈利' : result === 'lose' ? '亏损' : '进行中';
        return <Tag color={color}>{text}</Tag>;
      }
    },
    {
      title: '盈亏',
      dataIndex: 'pnl',
      key: 'pnl',
      width: 100,
      render: (pnl: number) => (
        <span style={{ 
          color: pnl > 0 ? '#52c41a' : pnl < 0 ? '#ff4d4f' : '#8c8c8c',
          fontWeight: 'bold'
        }}>
          {pnl >= 0 ? '+' : ''}¥{pnl.toFixed(2)}
        </span>
      )
    }
  ];

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      {/* 策略选择 */}
      <Card>
        <Space>
          <span>选择策略:</span>
          <Select
            value={selectedStrategy}
            onChange={setSelectedStrategy}
            style={{ width: 200 }}
          >
            <Option value="trend_following">趋势跟踪策略</Option>
            <Option value="mean_reversion">均值回归策略</Option>
            <Option value="breakout">突破策略</Option>
          </Select>
        </Space>
      </Card>

      {/* 核心指标 */}
      <Card title={`${getStrategyName(selectedStrategy)} - 核心指标`} loading={loading}>
        {performance && (
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12} md={6}>
              <Card bordered={false} style={{ background: '#f5f5f5' }}>
                <Statistic
                  title="总交易次数"
                  value={performance.total_trades}
                  suffix="次"
                  prefix={<LineChartOutlined />}
                />
              </Card>
            </Col>

            <Col xs={24} sm={12} md={6}>
              <Card bordered={false} style={{ background: '#f5f5f5' }}>
                <Statistic
                  title="胜率"
                  value={performance.win_rate}
                  precision={1}
                  suffix="%"
                  prefix={<TrophyOutlined />}
                  valueStyle={{ 
                    color: performance.win_rate >= 60 ? '#52c41a' : '#faad14'
                  }}
                />
                <div style={{ marginTop: '8px', fontSize: '12px', color: '#8c8c8c' }}>
                  {performance.win_trades}胜 / {performance.lose_trades}负
                </div>
              </Card>
            </Col>

            <Col xs={24} sm={12} md={6}>
              <Card bordered={false} style={{ background: '#f5f5f5' }}>
                <Statistic
                  title="盈亏比"
                  value={performance.profit_loss_ratio}
                  precision={2}
                  valueStyle={{ 
                    color: performance.profit_loss_ratio >= 2 ? '#52c41a' : '#faad14'
                  }}
                />
                <div style={{ marginTop: '8px', fontSize: '12px', color: '#8c8c8c' }}>
                  平均盈: ¥{performance.avg_profit.toFixed(2)}
                  <br />
                  平均亏: ¥{Math.abs(performance.avg_loss).toFixed(2)}
                </div>
              </Card>
            </Col>

            <Col xs={24} sm={12} md={6}>
              <Card bordered={false} style={{ background: '#f5f5f5' }}>
                <Statistic
                  title="总盈亏"
                  value={performance.total_pnl}
                  precision={2}
                  prefix={performance.total_pnl >= 0 ? <RiseOutlined /> : <FallOutlined />}
                  valueStyle={{ 
                    color: performance.total_pnl >= 0 ? '#52c41a' : '#ff4d4f'
                  }}
                />
              </Card>
            </Col>

            <Col xs={24} md={12}>
              <Card size="small" title="夏普比率">
                <Statistic
                  value={performance.sharpe_ratio}
                  precision={2}
                  valueStyle={{ 
                    color: performance.sharpe_ratio >= 1.5 ? '#52c41a' : 
                           performance.sharpe_ratio >= 1 ? '#faad14' : '#ff4d4f'
                  }}
                />
                <Progress
                  percent={Math.min(performance.sharpe_ratio / 2 * 100, 100)}
                  strokeColor={
                    performance.sharpe_ratio >= 1.5 ? '#52c41a' : 
                    performance.sharpe_ratio >= 1 ? '#faad14' : '#ff4d4f'
                  }
                  showInfo={false}
                  style={{ marginTop: '8px' }}
                />
                <div style={{ marginTop: '8px', fontSize: '12px', color: '#8c8c8c' }}>
                  {performance.sharpe_ratio >= 2 ? '优秀' : 
                   performance.sharpe_ratio >= 1.5 ? '良好' : 
                   performance.sharpe_ratio >= 1 ? '一般' : '较差'}
                </div>
              </Card>
            </Col>

            <Col xs={24} md={12}>
              <Card size="small" title="最大回撤">
                <Statistic
                  value={Math.abs(performance.max_drawdown)}
                  precision={2}
                  suffix="%"
                  valueStyle={{ 
                    color: Math.abs(performance.max_drawdown) <= 5 ? '#52c41a' : 
                           Math.abs(performance.max_drawdown) <= 10 ? '#faad14' : '#ff4d4f'
                  }}
                />
                <Progress
                  percent={Math.min(Math.abs(performance.max_drawdown) / 20 * 100, 100)}
                  strokeColor={
                    Math.abs(performance.max_drawdown) <= 5 ? '#52c41a' : 
                    Math.abs(performance.max_drawdown) <= 10 ? '#faad14' : '#ff4d4f'
                  }
                  showInfo={false}
                  style={{ marginTop: '8px' }}
                />
                <div style={{ marginTop: '8px', fontSize: '12px', color: '#8c8c8c' }}>
                  平均持仓: {performance.avg_holding_time.toFixed(0)} 分钟
                </div>
              </Card>
            </Col>
          </Row>
        )}
      </Card>

      {/* 策略对比 */}
      <Card title="三大策略对比" loading={loading}>
        <div 
          ref={comparisonChartRef} 
          style={{ width: '100%', height: '400px' }}
        />
      </Card>

      {/* 盈亏曲线 */}
      <Card title="累计盈亏曲线" loading={loading}>
        <div 
          ref={pnlChartRef} 
          style={{ width: '100%', height: '400px' }}
        />
      </Card>

      {/* 信号历史 */}
      <Card title="信号历史" loading={loading}>
        <Table
          columns={signalColumns}
          dataSource={signals}
          rowKey={(_, index) => `signal-${index}`}
          pagination={{ pageSize: 20 }}
          scroll={{ x: 800 }}
        />
      </Card>
    </Space>
  );
};

export default StrategyPerformance;
