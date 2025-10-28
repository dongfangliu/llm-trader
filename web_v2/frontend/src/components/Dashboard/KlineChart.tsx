/**
 * K线图表组件 - 增强版
 * 使用ECharts展示K线、均线、MACD、RSI、布林带、成交量
 * 支持增量更新，避免图表重置
 */

import React, { useEffect, useState, useRef, useMemo } from 'react';
import { Card, Select, Space, Tag, Spin, Switch, Empty, Alert } from 'antd';
import * as echarts from 'echarts';
import { getKline } from '../../api/trading';
import { getTimeshare } from '../../api/trading';

const { Option } = Select;

interface KlineChartProps {
  symbol?: string;
  height?: number;
  // 新增：接收WebSocket推送的K线数据
  klineUpdates?: Map<string, KlineDataPoint[]>;
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
  height = 600,  // 降低默认高度以适应新布局
  klineUpdates   // 新增：接收WebSocket推送
}) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  const [period, setPeriod] = useState('15m');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<KlineDataPoint[]>([]);
  const [currentPrice, setCurrentPrice] = useState<number>(0);
  const [priceChange, setPriceChange] = useState<number>(0);

  // 指标显示控制
  const [showMACD, setShowMACD] = useState(true);
  const [showRSI, setShowRSI] = useState(true);
  const [showBoll, setShowBoll] = useState(true);

  // 判断是否为分时图模式
  const isTimeshareMode = period === 'timeshare';

  const fetchKlineData = async () => {
    try {
      setLoading(true);

      // 如果是分时图模式，获取1m数据
      if (isTimeshareMode) {
        // 获取足够多的1m数据（480根 = 8小时交易时间）
        const response = await getKline('1m', 480);
        const timeshareData = response.data?.klines || [];

        console.log(`[分时数据] 拉取${timeshareData.length}根1m数据`);
        setData(timeshareData);

        if (timeshareData.length > 0) {
          const latest = timeshareData[timeshareData.length - 1];
          const first = timeshareData[0];
          setCurrentPrice(latest.close);
          if (first && first.open) {
            const change = ((latest.close - first.open) / first.open) * 100;
            setPriceChange(change);
          }
        }
      } else {
        // 普通K线模式
        const response = await getKline(period, 200);
        const klineData = response.data?.klines || [];
        console.log(`[K线数据] period=${period}, count=${klineData.length}`, klineData.slice(0, 3));
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
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  // ✅ 新实现：仅初始化时加载，周期变化时重新加载（移除轮询）
  useEffect(() => {
    fetchKlineData();  // 初始加载
  }, [period, isTimeshareMode]);  // 周期切换或模式切换时触发

  // 新增：监听WebSocket推送的K线更新
  useEffect(() => {
    if (!klineUpdates) return;

    // 分时图使用1m数据，其他周期使用对应周期数据
    const sourceKey = isTimeshareMode ? '1m' : period;
    const newKlines = klineUpdates.get(sourceKey);
    if (!newKlines || newKlines.length === 0) return;

    console.log(`[WebSocket] 收到 ${sourceKey} K线更新: ${newKlines.length}根 (显示模式: ${period})`);

    setData(prevData => {
      // 增量合并：替换或追加新K线
      const merged = [...prevData];

      newKlines.forEach(newK => {
        const idx = merged.findIndex(k => k.timestamp === newK.timestamp);
        if (idx >= 0) {
          // 更新已有K线（当前正在形成的K线）
          merged[idx] = newK;
        } else {
          // 追加新K线
          merged.push(newK);
        }
      });

      // 分时图保留最近480根（8小时），普通K线保留最近200根
      const maxLength = isTimeshareMode ? 480 : 200;
      return merged.slice(-maxLength);
    });

    // 更新当前价格
    if (newKlines.length > 0) {
      const latest = newKlines[newKlines.length - 1];
      setCurrentPrice(latest.close);

      if (data.length > 0) {
        // 分时图用第一根K线的开盘价作为基准，K线图用前一根的收盘价
        const previous = isTimeshareMode && data.length > 0 ? data[0] : data[data.length - 1];
        const basePrice = isTimeshareMode ? (previous.open || previous.close) : previous.close;
        const change = ((latest.close - basePrice) / basePrice) * 100;
        setPriceChange(change);
      }
    }
  }, [klineUpdates, period, isTimeshareMode]);

  // 技术指标计算函数
  const calculateIndicators = useMemo(() => {
    if (data.length === 0) return null;

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
          result.push(+(sum / dayCount).toFixed(2));
        }
      }
      return result;
    };

    // 计算EMA (指数移动平均)
    const calculateEMA = (dayCount: number) => {
      const k = 2 / (dayCount + 1);
      const result = [];
      let ema = closes[0];
      result.push(ema);
      for (let i = 1; i < closes.length; i++) {
        ema = closes[i] * k + ema * (1 - k);
        result.push(+ema.toFixed(2));
      }
      return result;
    };

    // 计算MACD
    const calculateMACD = () => {
      const ema12 = calculateEMA(12);
      const ema26 = calculateEMA(26);
      const dif = ema12.map((v, i) => +(v - ema26[i]).toFixed(2));

      // 计算DEA (DIF的9日EMA)
      const k = 2 / 10;
      let dea = dif[0];
      const deaArr = [dea];
      for (let i = 1; i < dif.length; i++) {
        dea = dif[i] * k + dea * (1 - k);
        deaArr.push(+dea.toFixed(2));
      }

      const macd = dif.map((v, i) => +(2 * (v - deaArr[i])).toFixed(2));
      return { dif, dea: deaArr, macd };
    };

    // 计算RSI
    const calculateRSI = (period: number = 14) => {
      const result = [];
      for (let i = 0; i < closes.length; i++) {
        if (i < period) {
          result.push('-');
          continue;
        }
        let gains = 0;
        let losses = 0;
        for (let j = i - period + 1; j <= i; j++) {
          const change = closes[j] - closes[j - 1];
          if (change > 0) gains += change;
          else losses -= change;
        }
        const avgGain = gains / period;
        const avgLoss = losses / period;
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        const rsi = 100 - (100 / (1 + rs));
        result.push(+rsi.toFixed(2));
      }
      return result;
    };

    // 计算布林带
    const calculateBollinger = (period: number = 20, multiplier: number = 2) => {
      const ma = calculateMA(period);
      const upper: (string | number)[] = [];
      const lower: (string | number)[] = [];

      for (let i = 0; i < closes.length; i++) {
        if (i < period - 1 || ma[i] === '-') {
          upper.push('-');
          lower.push('-');
        } else {
          let sum = 0;
          const mean = ma[i] as number;
          for (let j = 0; j < period; j++) {
            sum += Math.pow(closes[i - j] - mean, 2);
          }
          const std = Math.sqrt(sum / period);
          upper.push(+(mean + multiplier * std).toFixed(2));
          lower.push(+(mean - multiplier * std).toFixed(2));
        }
      }
      return { middle: ma, upper, lower };
    };

    return {
      ma5: calculateMA(5),
      ma10: calculateMA(10),
      ma20: calculateMA(20),
      ma60: calculateMA(60),
      macd: calculateMACD(),
      rsi: calculateRSI(14),
      boll: calculateBollinger(20, 2)
    };
  }, [data]);

  // 渲染分时图
  const renderTimeshareChart = (chart: echarts.ECharts) => {
    // 提取分时数据
    const times = data.map(d => {
      const date = new Date(d.timestamp);
      return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    });
    const prices = data.map(d => d.close);
    const volumes = data.map(d => d.volume);

    // 计算均价线
    let totalAmount = 0;
    let totalVolume = 0;
    const avgPrices = data.map(d => {
      totalAmount += d.close * d.volume;
      totalVolume += d.volume;
      return totalVolume > 0 ? totalAmount / totalVolume : d.close;
    });

    // 计算涨跌
    const openPrice = data.length > 0 ? data[0].open : 0;
    const currentPrice = prices[prices.length - 1] || 0;
    const change = currentPrice - openPrice;
    const isRising = change >= 0;

    const option: echarts.EChartsOption = {
      backgroundColor: '#0f1419',
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
          left: '5%',
          right: '5%',
          top: '10%',
          height: '65%'
        },
        {
          left: '5%',
          right: '5%',
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
            interval: Math.floor(times.length / 6),
            fontSize: 11,
            color: '#8392A5'
          },
          axisLine: { lineStyle: { color: '#8392A5' } }
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
            formatter: (value: number) => value.toFixed(2),
            color: '#8392A5'
          },
          axisLine: { lineStyle: { color: '#8392A5' } }
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
            width: 1.5,
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
  };

  useEffect(() => {
    if (!chartRef.current || data.length === 0) return;

    // 初始化图表
    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current);
    }

    const chart = chartInstance.current;

    // 如果是分时图模式，使用分时图渲染逻辑
    if (isTimeshareMode) {
      renderTimeshareChart(chart);
      return;
    }

    // K线图模式 - 需要计算指标
    if (!calculateIndicators) return;

    // 准备数据
    const dates = data.map(d => d.timestamp);
    const ohlc = data.map(d => [d.open, d.close, d.low, d.high]);
    const volumes = data.map(d => d.volume);

    const { ma5, ma10, ma20, ma60, macd, rsi, boll } = calculateIndicators;

    // 动态计算grid布局
    const mainHeight = showMACD || showRSI ? 45 : 60;
    const indicatorHeight = 12;
    let currentTop = mainHeight + 8;

    const grids: any[] = [
      {
        left: '5%',
        right: '5%',
        top: '8%',
        height: `${mainHeight}%`
      }
    ];

    if (showMACD) {
      grids.push({
        left: '5%',
        right: '5%',
        top: `${currentTop}%`,
        height: `${indicatorHeight}%`
      });
      currentTop += indicatorHeight + 3;
    }

    if (showRSI) {
      grids.push({
        left: '5%',
        right: '5%',
        top: `${currentTop}%`,
        height: `${indicatorHeight}%`
      });
      currentTop += indicatorHeight + 3;
    }

    grids.push({
      left: '5%',
      right: '5%',
      top: `${currentTop}%`,
      height: '15%'
    });

    // 图表配置
    const option = {
      backgroundColor: '#0f1419',  // 深色背景以匹配专业交易界面
      animation: false, // 关闭动画以提升性能
      title: {
        text: `${symbol} K线图 (实时更新)`,
        left: 'left',
        textStyle: {
          fontSize: 16,
          color: '#333'
        }
      },
      legend: {
        data: showBoll
          ? ['K线', 'MA5', 'MA10', 'MA20', 'MA60', 'BOLL-上', 'BOLL-中', 'BOLL-下']
          : ['K线', 'MA5', 'MA10', 'MA20', 'MA60'],
        top: 30,
        left: 'center'
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'cross',
          link: [{ xAxisIndex: 'all' }]
        },
        backgroundColor: 'rgba(255, 255, 255, 0.96)',
        borderColor: '#ddd',
        borderWidth: 1,
        textStyle: {
          color: '#333',
          fontSize: 12
        },
        formatter: function (params: any) {
          const dataIndex = params[0].dataIndex;
          const kline = data[dataIndex];
          const vol = volumes[dataIndex];

          let html = `<div style="padding: 10px; min-width: 200px;">`;
          html += `<div style="font-weight: bold; margin-bottom: 10px; border-bottom: 1px solid #eee; padding-bottom: 5px;">${dates[dataIndex]}</div>`;

          // K线数据
          html += `<div style="margin-bottom: 8px;">`;
          html += `<div>开: <span style="color: ${kline.close >= kline.open ? '#ef5350' : '#26a69a'};">${kline.open.toFixed(2)}</span></div>`;
          html += `<div>高: <span style="color: #ef5350;">${kline.high.toFixed(2)}</span></div>`;
          html += `<div>低: <span style="color: #26a69a;">${kline.low.toFixed(2)}</span></div>`;
          html += `<div>收: <span style="font-weight: bold; color: ${kline.close >= kline.open ? '#ef5350' : '#26a69a'};">${kline.close.toFixed(2)}</span></div>`;
          html += `<div>量: ${vol.toLocaleString()}</div>`;
          html += `</div>`;

          // 均线数据
          html += `<div style="border-top: 1px solid #eee; padding-top: 8px; margin-bottom: 8px;">`;
          html += `<div style="color: #FF6B6B;">MA5: ${ma5[dataIndex]}</div>`;
          html += `<div style="color: #4ECDC4;">MA10: ${ma10[dataIndex]}</div>`;
          html += `<div style="color: #45B7D1;">MA20: ${ma20[dataIndex]}</div>`;
          html += `<div style="color: #96CEB4;">MA60: ${ma60[dataIndex]}</div>`;
          html += `</div>`;

          // 布林带
          if (showBoll && boll.upper[dataIndex] !== '-') {
            html += `<div style="border-top: 1px solid #eee; padding-top: 8px; margin-bottom: 8px;">`;
            html += `<div style="color: #FF6B6B;">BOLL上: ${boll.upper[dataIndex]}</div>`;
            html += `<div style="color: #4ECDC4;">BOLL中: ${boll.middle[dataIndex]}</div>`;
            html += `<div style="color: #26a69a;">BOLL下: ${boll.lower[dataIndex]}</div>`;
            html += `</div>`;
          }

          // MACD
          if (showMACD) {
            html += `<div style="border-top: 1px solid #eee; padding-top: 8px; margin-bottom: 8px;">`;
            html += `<div style="color: #FF6B6B;">DIF: ${macd.dif[dataIndex]}</div>`;
            html += `<div style="color: #4ECDC4;">DEA: ${macd.dea[dataIndex]}</div>`;
            html += `<div style="color: ${macd.macd[dataIndex] >= 0 ? '#ef5350' : '#26a69a'};">MACD: ${macd.macd[dataIndex]}</div>`;
            html += `</div>`;
          }

          // RSI
          if (showRSI && rsi[dataIndex] !== '-') {
            const rsiValue = typeof rsi[dataIndex] === 'number' ? rsi[dataIndex] as number : 0;
            html += `<div style="border-top: 1px solid #eee; padding-top: 8px;">`;
            html += `<div style="color: ${rsiValue > 70 ? '#ef5350' : rsiValue < 30 ? '#26a69a' : '#666'};">RSI: ${rsi[dataIndex]}</div>`;
            html += `</div>`;
          }

          html += `</div>`;
          return html;
        }
      },
      axisPointer: {
        link: [{ xAxisIndex: 'all' }],
        label: {
          backgroundColor: '#777'
        }
      },
      grid: grids,
      xAxis: grids.map((_, index) => ({
        type: 'category',
        data: dates,
        gridIndex: index,
        boundaryGap: false,
        axisLine: {
          onZero: false,
          lineStyle: { color: '#8392A5' }
        },
        splitLine: { show: false },
        axisLabel: {
          show: index === grids.length - 1, // 只在最后一个图显示x轴标签
          color: '#8392A5',
          formatter: (value: string) => {
            // 智能格式化时间显示
            const date = new Date(value);
            const now = new Date();
            const isToday = date.toDateString() === now.toDateString();

            if (period === '1m' || period === '5m' || period === '15m') {
              // 分钟级别：只显示时间
              return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
            } else if (period === '1h' || period === '4h') {
              // 小时级别：月日 时分
              return isToday
                ? `${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`
                : `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:00`;
            } else {
              // 日线：只显示日期
              return `${date.getMonth() + 1}/${date.getDate()}`;
            }
          }
        },
        axisTick: { show: false },
        min: 'dataMin',
        max: 'dataMax'
      })),
      yAxis: (() => {
        const yAxes: any[] = [
          {
            scale: true,
            gridIndex: 0,
            splitArea: { show: true },
            axisLine: { lineStyle: { color: '#8392A5' } },
            splitLine: { lineStyle: { color: '#eee' } },
            axisLabel: {
              color: '#8392A5',
              formatter: (value: number) => value.toFixed(0)
            }
          }
        ];

        let currentGridIndex = 1;

        if (showMACD) {
          yAxes.push({
            scale: true,
            gridIndex: currentGridIndex,
            splitNumber: 3,
            axisLine: { lineStyle: { color: '#8392A5' } },
            splitLine: { lineStyle: { color: '#eee' } },
            axisLabel: {
              color: '#8392A5',
              fontSize: 10
            }
          });
          currentGridIndex++;
        }

        if (showRSI) {
          yAxes.push({
            scale: true,
            gridIndex: currentGridIndex,
            min: 0,
            max: 100,
            splitNumber: 4,
            axisLine: { lineStyle: { color: '#8392A5' } },
            splitLine: { lineStyle: { color: '#eee' } },
            axisLabel: {
              color: '#8392A5',
              fontSize: 10
            }
          });
          currentGridIndex++;
        }

        yAxes.push({
          scale: true,
          gridIndex: currentGridIndex,
          splitNumber: 2,
          axisLabel: { show: false },
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { show: false }
        });

        return yAxes;
      })(),
      dataZoom: [
        {
          type: 'inside',
          xAxisIndex: grids.map((_, i) => i),
          start: 70,
          end: 100,
          minValueSpan: 20 // 最小显示20个数据点
        },
        {
          show: true,
          xAxisIndex: grids.map((_, i) => i),
          type: 'slider',
          bottom: 5,
          start: 70,
          end: 100,
          height: 20
        }
      ],
      series: (() => {
        const series: any[] = [
          {
            name: 'K线',
            type: 'candlestick',
            data: ohlc,
            xAxisIndex: 0,
            yAxisIndex: 0,
            itemStyle: {
              color: '#ef5350',
              color0: '#26a69a',
              borderColor: '#ef5350',
              borderColor0: '#26a69a'
            }
          },
          {
            name: 'MA5',
            type: 'line',
            data: ma5,
            xAxisIndex: 0,
            yAxisIndex: 0,
            smooth: true,
            lineStyle: {
              opacity: 0.8,
              width: 1.5,
              color: '#FF6B6B'
            },
            showSymbol: false
          },
          {
            name: 'MA10',
            type: 'line',
            data: ma10,
            xAxisIndex: 0,
            yAxisIndex: 0,
            smooth: true,
            lineStyle: {
              opacity: 0.8,
              width: 1.5,
              color: '#4ECDC4'
            },
            showSymbol: false
          },
          {
            name: 'MA20',
            type: 'line',
            data: ma20,
            xAxisIndex: 0,
            yAxisIndex: 0,
            smooth: true,
            lineStyle: {
              opacity: 0.8,
              width: 1.5,
              color: '#45B7D1'
            },
            showSymbol: false
          },
          {
            name: 'MA60',
            type: 'line',
            data: ma60,
            xAxisIndex: 0,
            yAxisIndex: 0,
            smooth: true,
            lineStyle: {
              opacity: 0.8,
              width: 1.5,
              color: '#96CEB4'
            },
            showSymbol: false
          }
        ];

        // 布林带
        if (showBoll) {
          series.push(
            {
              name: 'BOLL-上',
              type: 'line',
              data: boll.upper,
              xAxisIndex: 0,
              yAxisIndex: 0,
              lineStyle: {
                opacity: 0.5,
                width: 1,
                color: '#FF6B6B',
                type: 'dashed'
              },
              showSymbol: false
            },
            {
              name: 'BOLL-中',
              type: 'line',
              data: boll.middle,
              xAxisIndex: 0,
              yAxisIndex: 0,
              lineStyle: {
                opacity: 0.5,
                width: 1,
                color: '#4ECDC4',
                type: 'dashed'
              },
              showSymbol: false
            },
            {
              name: 'BOLL-下',
              type: 'line',
              data: boll.lower,
              xAxisIndex: 0,
              yAxisIndex: 0,
              lineStyle: {
                opacity: 0.5,
                width: 1,
                color: '#26a69a',
                type: 'dashed'
              },
              showSymbol: false
            }
          );
        }

        let currentSeriesIndex = 1;
        let currentYAxisIndex = 1;

        // MACD
        if (showMACD) {
          series.push(
            {
              name: 'MACD',
              type: 'bar',
              xAxisIndex: currentSeriesIndex,
              yAxisIndex: currentYAxisIndex,
              data: macd.macd,
              itemStyle: {
                color: (params: any) => {
                  return params.data >= 0 ? '#ef5350' : '#26a69a';
                }
              }
            },
            {
              name: 'DIF',
              type: 'line',
              xAxisIndex: currentSeriesIndex,
              yAxisIndex: currentYAxisIndex,
              data: macd.dif,
              lineStyle: {
                width: 1.5,
                color: '#FF6B6B'
              },
              showSymbol: false
            },
            {
              name: 'DEA',
              type: 'line',
              xAxisIndex: currentSeriesIndex,
              yAxisIndex: currentYAxisIndex,
              data: macd.dea,
              lineStyle: {
                width: 1.5,
                color: '#4ECDC4'
              },
              showSymbol: false
            }
          );
          currentSeriesIndex++;
          currentYAxisIndex++;
        }

        // RSI
        if (showRSI) {
          series.push(
            {
              name: 'RSI',
              type: 'line',
              xAxisIndex: currentSeriesIndex,
              yAxisIndex: currentYAxisIndex,
              data: rsi,
              lineStyle: {
                width: 1.5,
                color: '#9C27B0'
              },
              areaStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                  { offset: 0, color: 'rgba(156, 39, 176, 0.3)' },
                  { offset: 1, color: 'rgba(156, 39, 176, 0.05)' }
                ])
              },
              showSymbol: false,
              markLine: {
                silent: true,
                symbol: 'none',
                lineStyle: {
                  color: '#999',
                  type: 'dashed'
                },
                data: [
                  { yAxis: 70, label: { formatter: '70' } },
                  { yAxis: 30, label: { formatter: '30' } }
                ]
              }
            }
          );
          currentSeriesIndex++;
          currentYAxisIndex++;
        }

        // 成交量
        series.push({
          name: '成交量',
          type: 'bar',
          xAxisIndex: currentSeriesIndex,
          yAxisIndex: currentYAxisIndex,
          data: volumes,
          itemStyle: {
            color: function (params: any) {
              const dataIndex = params.dataIndex;
              return data[dataIndex].close >= data[dataIndex].open ? '#ef5350' : '#26a69a';
            }
          }
        });

        return series;
      })()
    };

    // 使用notMerge: false来实现增量更新，避免图表重置
    chart.setOption(option, {
      notMerge: false,  // 关键：使用增量更新，保持缩放状态
      lazyUpdate: true,  // 延迟更新以提升性能
      silent: false
    });

    // 窗口大小改变时调整图表
    const handleResize = () => {
      chart.resize();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [data, symbol, showMACD, showRSI, showBoll, period, isTimeshareMode]);

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
          <span>{isTimeshareMode ? '分时图 - 实时行情' : 'K线图表 - 专业版'}</span>
          {!loading && data.length > 0 && (
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
        <Space>
          {!isTimeshareMode && (
            <>
              <Space size="small">
                <span style={{ fontSize: 12 }}>布林带</span>
                <Switch
                  size="small"
                  checked={showBoll}
                  onChange={setShowBoll}
                  disabled={data.length === 0}
                />
              </Space>
              <Space size="small">
                <span style={{ fontSize: 12 }}>MACD</span>
                <Switch
                  size="small"
                  checked={showMACD}
                  onChange={setShowMACD}
                  disabled={data.length === 0}
                />
              </Space>
              <Space size="small">
                <span style={{ fontSize: 12 }}>RSI</span>
                <Switch
                  size="small"
                  checked={showRSI}
                  onChange={setShowRSI}
                  disabled={data.length === 0}
                />
              </Space>
            </>
          )}
          <Select
            value={period}
            onChange={setPeriod}
            style={{ width: 100 }}
            disabled={loading}
          >
            <Option value="timeshare">分时</Option>
            <Option value="1m">1分钟</Option>
            <Option value="5m">5分钟</Option>
            <Option value="15m">15分钟</Option>
            <Option value="1h">1小时</Option>
            <Option value="4h">4小时</Option>
            <Option value="1d">1天</Option>
          </Select>
        </Space>
      }
    >
      <Spin spinning={loading}>
        {data.length === 0 && !loading ? (
          <div style={{ padding: '40px' }}>
            <Alert
              message="正在获取实时行情数据..."
              description="系统正在从TqSDK拉取真实K线数据。请稍候，数据应在30秒内显示。"
              type="info"
              showIcon
              style={{ marginBottom: '20px' }}
            />
            <Empty
              description="暂无数据"
              style={{ marginTop: '40px' }}
            />
            <p style={{ marginTop: '20px', color: '#999', fontSize: '12px' }}>
              💡 提示：如果数据长时间不显示，请检查：<br/>
              1. TqSDK 凭证是否在 config/api_keys.yaml 中正确配置<br/>
              2. 网络连接是否正常<br/>
              3. 当前时间是否为交易时间（9:00-23:00）
            </p>
          </div>
        ) : (
          <div
            ref={chartRef}
            style={{ width: '100%', height: `${height}px` }}
          />
        )}
      </Spin>
    </Card>
  );
};

export default KlineChart;
