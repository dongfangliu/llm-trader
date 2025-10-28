/**
 * 分时图组件
 * 显示当日价格走势（1分钟级别）
 */

import React, { useEffect, useState, useRef } from 'react';
import { Card, Spin, Empty, Alert } from 'antd';
import { LineChartOutlined } from '@ant-design/icons';
import * as echarts from 'echarts';
import { getTimeshare } from '../../api/trading';

interface TimeshareDataPoint {
  timestamp: string;
  price: number;  // tick价格（替代close）
  volume: number;
  bid_price1?: number;  // 买一价
  ask_price1?: number;  // 卖一价
}

interface TimeshareChartProps {
  height?: number;
}

const TimeshareChart: React.FC<TimeshareChartProps> = ({ height = 300 }) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<TimeshareDataPoint[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fetchTimeshareData = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await getTimeshare();
      const timeshareData = response.data?.timeshare || [];

      console.log(`[分时图] 获取到 ${timeshareData.length} 条数据`);
      setData(timeshareData);
    } catch (error) {
      console.error('获取分时图数据失败:', error);
      setError('获取分时图数据失败');
    } finally {
      setLoading(false);
    }
  };

  // 初始化加载数据
  useEffect(() => {
    fetchTimeshareData();

    // 每30秒刷新一次
    const interval = setInterval(fetchTimeshareData, 30000);
    return () => clearInterval(interval);
  }, []);

  // 渲染图表
  useEffect(() => {
    if (!chartRef.current || data.length === 0) return;

    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current);
    }

    const chart = chartInstance.current;

    // 提取数据
    const times = data.map(d => {
      const date = new Date(d.timestamp);
      return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`;
    });
    const prices = data.map(d => d.price);
    const volumes = data.map(d => d.volume);

    // 计算均价线（当日成交均价）
    let totalAmount = 0;
    let totalVolume = 0;
    const avgPrices = data.map(d => {
      totalAmount += d.price * d.volume;
      totalVolume += d.volume;
      return totalVolume > 0 ? totalAmount / totalVolume : d.price;
    });

    // 计算涨跌（相对于开盘价，使用第一个tick的价格作为开盘价）
    const openPrice = data.length > 0 ? data[0].price : 0;
    const currentPrice = prices[prices.length - 1] || 0;
    const change = currentPrice - openPrice;
    const isRising = change >= 0;

    const option: echarts.EChartsOption = {
      title: {
        text: '分时图',
        left: 10,
        top: 5,
        textStyle: {
          fontSize: 14,
          fontWeight: 'bold'
        }
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'cross'
        },
        formatter: (params: any) => {
          const time = params[0].axisValue;
          const price = params[0].data;
          const avgPrice = params[1]?.data || 0;
          const volume = volumes[params[0].dataIndex] || 0;

          return `
            <div style="padding: 5px;">
              <div style="font-weight: bold; margin-bottom: 5px;">${time}</div>
              <div>价格: <span style="color: ${isRising ? '#ef4444' : '#22c55e'}; font-weight: bold;">¥${price?.toFixed(2)}</span></div>
              <div>均价: <span style="color: #faad14; font-weight: bold;">¥${avgPrice.toFixed(2)}</span></div>
              <div>成交量: ${volume.toLocaleString()}</div>
            </div>
          `;
        }
      },
      grid: [
        {
          left: '8%',
          right: '8%',
          top: '15%',
          height: '60%'
        },
        {
          left: '8%',
          right: '8%',
          top: '80%',
          height: '15%'
        }
      ],
      xAxis: [
        {
          type: 'category',
          data: times,
          gridIndex: 0,
          axisLabel: {
            rotate: 0,
            interval: Math.floor(times.length / 8),  // tick数据多，减少标签数量
            fontSize: 10,
            formatter: (value: string) => {
              // 只显示时:分，省略秒
              return value.substring(0, 5);
            }
          }
        },
        {
          type: 'category',
          data: times,
          gridIndex: 1,
          axisLabel: {
            show: false
          }
        }
      ],
      yAxis: [
        {
          type: 'value',
          gridIndex: 0,
          scale: true,
          splitLine: {
            lineStyle: {
              color: '#333'
            }
          },
          axisLabel: {
            formatter: (value: number) => value.toFixed(2)
          }
        },
        {
          type: 'value',
          gridIndex: 1,
          splitLine: {
            show: false
          },
          axisLabel: {
            show: false
          }
        }
      ],
      series: [
        {
          name: '价格',
          type: 'line',
          data: prices,
          xAxisIndex: 0,
          yAxisIndex: 0,
          smooth: true,
          showSymbol: false,
          lineStyle: {
            width: 2,
            color: isRising ? '#ef4444' : '#22c55e'
          },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              {
                offset: 0,
                color: isRising ? 'rgba(239, 68, 68, 0.3)' : 'rgba(34, 197, 94, 0.3)'
              },
              {
                offset: 1,
                color: isRising ? 'rgba(239, 68, 68, 0.05)' : 'rgba(34, 197, 94, 0.05)'
              }
            ])
          }
        },
        {
          name: '均价',
          type: 'line',
          data: avgPrices,
          xAxisIndex: 0,
          yAxisIndex: 0,
          smooth: true,
          showSymbol: false,
          lineStyle: {
            width: 1,
            color: '#faad14',
            type: 'dashed'
          }
        },
        {
          name: '成交量',
          type: 'bar',
          data: volumes,
          xAxisIndex: 1,
          yAxisIndex: 1,
          itemStyle: {
            color: (params: any) => {
              const idx = params.dataIndex;
              if (idx === 0) return '#999';
              return prices[idx] >= prices[idx - 1] ? '#ef4444' : '#22c55e';
            }
          }
        }
      ]
    };

    chart.setOption(option, { notMerge: false, lazyUpdate: true });

    const handleResize = () => chart.resize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [data]);

  // 组件卸载时销毁图表
  useEffect(() => {
    return () => {
      if (chartInstance.current) {
        chartInstance.current.dispose();
        chartInstance.current = null;
      }
    };
  }, []);

  if (error) {
    return (
      <Card
        title={
          <span>
            <LineChartOutlined style={{ marginRight: 8 }} />
            分时图
          </span>
        }
        style={{ height }}
      >
        <Alert
          message="加载失败"
          description={error}
          type="error"
          showIcon
        />
      </Card>
    );
  }

  if (loading) {
    return (
      <Card
        title={
          <span>
            <LineChartOutlined style={{ marginRight: 8 }} />
            分时图
          </span>
        }
        style={{ height }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: height - 100 }}>
          <Spin size="large" tip="加载中..." />
        </div>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card
        title={
          <span>
            <LineChartOutlined style={{ marginRight: 8 }} />
            分时图
          </span>
        }
        style={{ height }}
      >
        <Empty description="暂无分时数据" />
      </Card>
    );
  }

  return (
    <Card
      title={
        <span>
          <LineChartOutlined style={{ marginRight: 8 }} />
          分时图
        </span>
      }
      style={{ height }}
      bodyStyle={{ padding: '12px' }}
    >
      <div ref={chartRef} style={{ width: '100%', height: height - 60 }} />
    </Card>
  );
};

export default TimeshareChart;
