import { Card, Segmented } from 'antd'
import ReactECharts from 'echarts-for-react'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { getKline } from '../api/trading'
import type { KlineData } from '../api/trading'
import './KlineChart.css'

const KlineChart = () => {
  const [period, setPeriod] = useState<string>('1m')

  const { data, isLoading } = useQuery({
    queryKey: ['kline', period],
    queryFn: () => getKline(period, 500),
    refetchInterval: 3000,
  })

  const klineData: KlineData[] = data?.data?.klines || []

  // 转换为ECharts格式
  const chartData = klineData.map(item => ({
    timestamp: item.timestamp,
    values: [item.open, item.close, item.low, item.high],
    volume: item.volume
  }))

  const option = {
    backgroundColor: 'transparent',
    title: {
      text: '纯碱SA601 K线图',
      left: 'center',
      textStyle: {
        color: '#fff',
        fontSize: 16
      }
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'cross'
      },
      backgroundColor: 'rgba(0,0,0,0.8)',
      borderColor: '#333',
      textStyle: {
        color: '#fff'
      }
    },
    legend: {
      data: ['K线', '成交量'],
      top: 30,
      textStyle: {
        color: '#999'
      }
    },
    grid: [
      {
        left: '10%',
        right: '8%',
        height: '50%'
      },
      {
        left: '10%',
        right: '8%',
        top: '70%',
        height: '15%'
      }
    ],
    xAxis: [
      {
        type: 'category',
        data: chartData.map(item => item.timestamp),
        scale: true,
        boundaryGap: false,
        axisLine: { lineStyle: { color: '#333' } },
        splitLine: { show: false },
        axisLabel: {
          color: '#999',
          formatter: (value: string) => {
            return value.split(' ')[1] || value
          }
        }
      },
      {
        type: 'category',
        gridIndex: 1,
        data: chartData.map(item => item.timestamp),
        scale: true,
        boundaryGap: false,
        axisLine: { lineStyle: { color: '#333' } },
        splitLine: { show: false },
        axisLabel: { show: false }
      }
    ],
    yAxis: [
      {
        scale: true,
        splitArea: {
          show: true
        },
        axisLine: { lineStyle: { color: '#333' } },
        splitLine: { lineStyle: { color: '#222' } },
        axisLabel: { color: '#999' }
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
        start: 50,
        end: 100
      },
      {
        show: true,
        xAxisIndex: [0, 1],
        type: 'slider',
        bottom: 10,
        start: 50,
        end: 100,
        textStyle: {
          color: '#999'
        }
      }
    ],
    series: [
      {
        name: 'K线',
        type: 'candlestick',
        data: chartData.map(item => item.values),
        itemStyle: {
          color: '#ef5350',
          color0: '#26a69a',
          borderColor: '#ef5350',
          borderColor0: '#26a69a'
        }
      },
      {
        name: '成交量',
        type: 'bar',
        xAxisIndex: 1,
        yAxisIndex: 1,
        data: chartData.map(item => item.volume),
        itemStyle: {
          color: '#7cb5ec'
        }
      }
    ]
  }

  return (
    <Card
      bordered={false}
      className="kline-chart-card"
      title={
        <Segmented
          options={[
            { label: '1分钟', value: '1m' },
            { label: '5分钟', value: '5m' },
            { label: '15分钟', value: '15m' },
            { label: '1小时', value: '1h' },
            { label: '4小时', value: '4h' },
            { label: '日线', value: '1d' },
          ]}
          value={period}
          onChange={(value) => setPeriod(value as string)}
        />
      }
    >
      <ReactECharts
        option={option}
        style={{ height: '600px', width: '100%' }}
        notMerge={true}
        lazyUpdate={true}
        showLoading={isLoading}
        loadingOption={{
          text: '加载中...',
          color: '#1890ff',
          textColor: '#fff',
          maskColor: 'rgba(0, 0, 0, 0.8)'
        }}
      />
    </Card>
  )
}

export default KlineChart
