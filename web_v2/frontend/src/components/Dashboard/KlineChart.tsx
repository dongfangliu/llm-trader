/**
 * K线图表组件
 * 使用ECharts展示K线、均线、成交量和持仓标记
 */

import React, { useEffect, useState, useRef } from 'react';
import { Card, Select, Space, Tag, Spin } from 'antd';
import * as echarts from 'echarts';
import { getKline } from '../../api/trading';

const { Option } = Select;

interface KlineChartProps {
  symbol?: string;
  height?: number;
}

interface KlineDataPoint {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const KlineChart: React.FC<KlineChartProps> = ({ 
  symbol = 'SA601', 
  height = 500 
}) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  const [period, setPeriod] = useState('15m');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<KlineDataPoint[]>([]);
  const [currentPrice, setCurrentPrice] = useState<number>(0);
  const [priceChange, setPriceChange] = useState<number>(0);

  const fetchKlineData = async () => {
    try {
      setLoading(true);
      const response = await getKline(period, 200);
      const klineData = response.data.data || [];
      setData(klineData);

      if (klineData.length > 0) {
        const latest = klineData[klineData.length - 1];
        const previous = klineData[klineData.length - 2];
        setCurrentPrice(latest.close);
        if (previous) {
          const change = ((latest.close - previous.close) / previous.close) * 100;
          setPriceChange(change);
        }
      }
    } catch (error) {
      console.error('Failed to fetch kline data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKlineData();
    const interval = setInterval(fetchKlineData, 3000); // 每3秒更新
    return () => clearInterval(interval);
  }, [period]);

  useEffect(() => {
    if (!chartRef.current || data.length === 0) return;

    // 初始化图表
    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current);
    }

    const chart = chartInstance.current;

    // 准备数据
    const dates = data.map(d => d.timestamp);
    const ohlc = data.map(d => [d.open, d.close, d.low, d.high]);
    const volumes = data.map(d => d.volume);
    const closes = data.map(d => d.close);

    // 计算均线
    const calculateMA = (dayCount: number) => {
      const result = [];
      for (let i = 0; i < closes.length; i++) {
        if (i < dayCount - 1) {
          result.push('-');
        } else {
          let sum = 0;
          for (let j = 0; j < dayCount; j++) {
            sum += closes[i - j];
          }
          result.push((sum / dayCount).toFixed(2));
        }
      }
      return result;
    };

    const ma5 = calculateMA(5);
    const ma10 = calculateMA(10);
    const ma20 = calculateMA(20);
    const ma60 = calculateMA(60);

    // 图表配置
    const option = {
      backgroundColor: '#fff',
      animation: true,
      title: {
        text: `${symbol} K线图`,
        left: 'left',
        textStyle: {
          fontSize: 16,
          color: '#333'
        }
      },
      legend: {
        data: ['K线', 'MA5', 'MA10', 'MA20', 'MA60'],
        top: 30,
        left: 'center'
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'cross'
        },
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderColor: '#ddd',
        textStyle: {
          color: '#333'
        },
        formatter: function (params: any) {
          const dataIndex = params[0].dataIndex;
          const kline = data[dataIndex];
          const vol = volumes[dataIndex];
          
          let html = `<div style="padding: 8px;">`;
          html += `<div style="font-weight: bold; margin-bottom: 8px;">${dates[dataIndex]}</div>`;
          html += `<div>开: ${kline.open.toFixed(2)}</div>`;
          html += `<div>高: ${kline.high.toFixed(2)}</div>`;
          html += `<div>低: ${kline.low.toFixed(2)}</div>`;
          html += `<div>收: ${kline.close.toFixed(2)}</div>`;
          html += `<div>量: ${vol.toLocaleString()}</div>`;
          html += `<div style="margin-top: 8px; border-top: 1px solid #eee; padding-top: 8px;">`;
          html += `<div style="color: #FF6B6B;">MA5: ${ma5[dataIndex]}</div>`;
          html += `<div style="color: #4ECDC4;">MA10: ${ma10[dataIndex]}</div>`;
          html += `<div style="color: #45B7D1;">MA20: ${ma20[dataIndex]}</div>`;
          html += `<div style="color: #96CEB4;">MA60: ${ma60[dataIndex]}</div>`;
          html += `</div></div>`;
          return html;
        }
      },
      axisPointer: {
        link: [{ xAxisIndex: 'all' }],
        label: {
          backgroundColor: '#777'
        }
      },
      grid: [
        {
          left: '5%',
          right: '5%',
          top: 80,
          height: '55%'
        },
        {
          left: '5%',
          right: '5%',
          top: '72%',
          height: '18%'
        }
      ],
      xAxis: [
        {
          type: 'category',
          data: dates,
          boundaryGap: false,
          axisLine: { onZero: false },
          splitLine: { show: false },
          axisLabel: {
            formatter: (value: string) => {
              // 格式化时间显示
              const date = new Date(value);
              return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
            }
          },
          min: 'dataMin',
          max: 'dataMax'
        },
        {
          type: 'category',
          gridIndex: 1,
          data: dates,
          boundaryGap: false,
          axisLine: { onZero: false },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: { show: false },
          min: 'dataMin',
          max: 'dataMax'
        }
      ],
      yAxis: [
        {
          scale: true,
          splitArea: {
            show: true
          }
        },
        {
          scale: true,
          gridIndex: 1,
          splitNumber: 2,
          axisLabel: { show: false },
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { show: false }
        }
      ],
      dataZoom: [
        {
          type: 'inside',
          xAxisIndex: [0, 1],
          start: 70,
          end: 100
        },
        {
          show: true,
          xAxisIndex: [0, 1],
          type: 'slider',
          bottom: 10,
          start: 70,
          end: 100
        }
      ],
      series: [
        {
          name: 'K线',
          type: 'candlestick',
          data: ohlc,
          itemStyle: {
            color: '#ef5350',
            color0: '#26a69a',
            borderColor: '#ef5350',
            borderColor0: '#26a69a'
          },
          markPoint: {
            label: {
              formatter: (param: any) => {
                return param.value;
              }
            },
            data: [
              // 可以在这里添加标记点，例如入场价、止损价等
            ],
            tooltip: {
              formatter: (param: any) => {
                return param.name + '<br>' + (param.data.coord || '');
              }
            }
          },
          markLine: {
            symbol: ['none', 'none'],
            data: [
              // 可以在这里添加标记线，例如关键价位
            ]
          }
        },
        {
          name: 'MA5',
          type: 'line',
          data: ma5,
          smooth: true,
          lineStyle: {
            opacity: 0.8,
            width: 1,
            color: '#FF6B6B'
          },
          showSymbol: false
        },
        {
          name: 'MA10',
          type: 'line',
          data: ma10,
          smooth: true,
          lineStyle: {
            opacity: 0.8,
            width: 1,
            color: '#4ECDC4'
          },
          showSymbol: false
        },
        {
          name: 'MA20',
          type: 'line',
          data: ma20,
          smooth: true,
          lineStyle: {
            opacity: 0.8,
            width: 1,
            color: '#45B7D1'
          },
          showSymbol: false
        },
        {
          name: 'MA60',
          type: 'line',
          data: ma60,
          smooth: true,
          lineStyle: {
            opacity: 0.8,
            width: 1,
            color: '#96CEB4'
          },
          showSymbol: false
        },
        {
          name: '成交量',
          type: 'bar',
          xAxisIndex: 1,
          yAxisIndex: 1,
          data: volumes,
          itemStyle: {
            color: function (params: any) {
              const dataIndex = params.dataIndex;
              return data[dataIndex].close >= data[dataIndex].open ? '#ef5350' : '#26a69a';
            }
          }
        }
      ]
    };

    chart.setOption(option);

    // 窗口大小改变时调整图表
    const handleResize = () => {
      chart.resize();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [data, symbol]);

  // 组件卸载时销毁图表
  useEffect(() => {
    return () => {
      if (chartInstance.current) {
        chartInstance.current.dispose();
        chartInstance.current = null;
      }
    };
  }, []);

  return (
    <Card
      title={
        <Space>
          <span>K线图表</span>
          {!loading && (
            <>
              <Tag color={priceChange >= 0 ? 'success' : 'error'}>
                ¥{currentPrice.toFixed(2)}
              </Tag>
              <Tag color={priceChange >= 0 ? 'success' : 'error'}>
                {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%
                {priceChange >= 0 ? ' ↑' : ' ↓'}
              </Tag>
            </>
          )}
        </Space>
      }
      extra={
        <Select
          value={period}
          onChange={setPeriod}
          style={{ width: 100 }}
          disabled={loading}
        >
          <Option value="1m">1分钟</Option>
          <Option value="5m">5分钟</Option>
          <Option value="15m">15分钟</Option>
          <Option value="1h">1小时</Option>
          <Option value="4h">4小时</Option>
          <Option value="1d">1天</Option>
        </Select>
      }
    >
      <Spin spinning={loading}>
        <div 
          ref={chartRef} 
          style={{ width: '100%', height: `${height}px` }}
        />
      </Spin>
    </Card>
  );
};

export default KlineChart;
