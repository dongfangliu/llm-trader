/**
 * 实时价格面板 - 炒股软件风格
 * 大字号显示当前价格、涨跌幅、成交量等关键信息
 */

import React, { useEffect, useState, useRef } from 'react';
import { Card, Row, Col, Space, Tag, Alert } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined, DashboardOutlined, ClockCircleOutlined, WarningOutlined } from '@ant-design/icons';
import { getKline } from '../../api/trading';
import { safeToFixed, safeNumber } from '../../utils/format';
import './RealTimePricePanel.css';

interface PriceData {
  price: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  open: number;
  volume: number;
  timestamp: string;
}

// 交易时段检查
function checkTradingHours() {
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();
  const timeInMinutes = hour * 60 + minute;

  // 日盘: 9:00-10:15, 10:30-11:30, 13:30-15:00
  const daySession1 = [9 * 60, 10 * 60 + 15];
  const daySession2 = [10 * 60 + 30, 11 * 60 + 30];
  const daySession3 = [13 * 60 + 30, 15 * 60];

  if ((timeInMinutes >= daySession1[0] && timeInMinutes < daySession1[1]) ||
      (timeInMinutes >= daySession2[0] && timeInMinutes < daySession2[1]) ||
      (timeInMinutes >= daySession3[0] && timeInMinutes < daySession3[1])) {
    return { isTrading: true, sessionType: 'day', message: '日盘交易中' };
  }

  // 夜盘: 21:00-23:00
  const nightSession = [21 * 60, 23 * 60];
  if (timeInMinutes >= nightSession[0] && timeInMinutes < nightSession[1]) {
    return { isTrading: true, sessionType: 'night', message: '夜盘交易中' };
  }

  // 非交易时段
  let nextOpen = '';
  if (timeInMinutes < daySession1[0]) {
    nextOpen = '09:00 开盘';
  } else if (timeInMinutes >= daySession3[1] && timeInMinutes < nightSession[0]) {
    nextOpen = '21:00 开盘';
  } else {
    nextOpen = '次日 09:00 开盘';
  }

  return { isTrading: false, sessionType: 'closed', message: `休盘中（${nextOpen}）` };
}

function isDataStale(timestamp: string): boolean {
  if (!timestamp) return true;
  try {
    const dataTime = new Date(timestamp).getTime();
    const now = new Date().getTime();
    const diffMinutes = (now - dataTime) / 1000 / 60;
    return diffMinutes > 5; // 超过5分钟认为数据过期
  } catch {
    return true;
  }
}

interface RealTimePricePanelProps {
  // 新增：接收WebSocket推送的Tick数据
  latestTick?: {
    price: number;
    open: number;
    high: number;
    low: number;
    volume: number;
    timestamp: string;
    // 盘口数据（可选，如果TqSDK支持）
    bid_price1?: number;
    bid_volume1?: number;
    ask_price1?: number;
    ask_volume1?: number;
    bid_price2?: number;
    bid_volume2?: number;
    ask_price2?: number;
    ask_volume2?: number;
    bid_price3?: number;
    bid_volume3?: number;
    ask_price3?: number;
    ask_volume3?: number;
    bid_price4?: number;
    bid_volume4?: number;
    ask_price4?: number;
    ask_volume4?: number;
    bid_price5?: number;
    bid_volume5?: number;
    ask_price5?: number;
    ask_volume5?: number;
  };
}

const RealTimePricePanel: React.FC<RealTimePricePanelProps> = ({ latestTick }) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<PriceData>({
    price: 0,
    change: 0,
    changePercent: 0,
    high: 0,
    low: 0,
    open: 0,
    volume: 0,
    timestamp: ''
  });
  const [priceFlash, setPriceFlash] = useState<'up' | 'down' | null>(null);
  const [tradingStatus, setTradingStatus] = useState(checkTradingHours());
  const [dataStale, setDataStale] = useState(false);
  const prevPriceRef = useRef<number>(0);

  const fetchPrice = async () => {
    try {
      const response = await getKline('1m', 100);
      const klineData = response.data?.klines || [];

      if (klineData.length >= 2) {
        const latest = klineData[klineData.length - 1];
        const previous = klineData[klineData.length - 2];

        const latestClose = safeNumber(latest?.close, 0);
        const prevClose = safeNumber(previous?.close, 0);
        const change = latestClose - prevClose;
        const changePercent = prevClose !== 0 ? (change / prevClose) * 100 : 0;

        // 价格跳动效果
        if (prevPriceRef.current !== 0 && latestClose !== prevPriceRef.current) {
          setPriceFlash(latestClose > prevPriceRef.current ? 'up' : 'down');
          setTimeout(() => setPriceFlash(null), 600);
        }
        prevPriceRef.current = latestClose;

        setData({
          price: latestClose,
          change: change,
          changePercent: changePercent,
          high: safeNumber(latest?.high, 0),
          low: safeNumber(latest?.low, 0),
          open: safeNumber(latest?.open, 0),
          volume: safeNumber(latest?.volume, 0),
          timestamp: latest?.timestamp || ''
        });

        // 检查数据新鲜度
        setDataStale(isDataStale(latest?.timestamp || ''));
      }
      setLoading(false);
    } catch (error) {
      console.error('获取实时价格失败:', error);
      setLoading(false);
    }
  };

  // ✅ 新实现：仅初始化时加载一次（移除轮询）
  useEffect(() => {
    fetchPrice();  // 初始数据

    // 交易状态更新保留
    const statusInterval = setInterval(() => {
      setTradingStatus(checkTradingHours());
    }, 60000);

    return () => clearInterval(statusInterval);
  }, []);

  // 新增：监听WebSocket推送的Tick数据
  useEffect(() => {
    if (!latestTick) return;

    console.log('[WebSocket] 收到Tick更新:', latestTick.price);

    // 价格跳动动画
    if (prevPriceRef.current !== 0 && latestTick.price !== prevPriceRef.current) {
      setPriceFlash(latestTick.price > prevPriceRef.current ? 'up' : 'down');
      setTimeout(() => setPriceFlash(null), 600);
    }
    prevPriceRef.current = latestTick.price;

    // 更新价格数据
    const prevClose = data.price || latestTick.open;
    const change = latestTick.price - prevClose;
    const changePercent = prevClose !== 0 ? (change / prevClose) * 100 : 0;

    setData({
      price: latestTick.price,
      change: change,
      changePercent: changePercent,
      high: latestTick.high,
      low: latestTick.low,
      open: latestTick.open,
      volume: latestTick.volume,
      timestamp: latestTick.timestamp
    });

    // 检查数据新鲜度
    setDataStale(isDataStale(latestTick.timestamp));
  }, [latestTick]);

  const isRising = data.changePercent >= 0;
  const priceColor = isRising ? '#ef4444' : '#22c55e'; // 涨红跌绿（中国习惯）

  return (
    <Card
      title={
        <Space>
          <DashboardOutlined style={{ fontSize: '18px' }} />
          <span style={{ fontSize: '16px', fontWeight: 'bold' }}>SA601 纯碱期货</span>
          <Tag color={tradingStatus.isTrading ? 'success' : 'default'}>
            {tradingStatus.message}
          </Tag>
        </Space>
      }
      loading={loading}
      className="price-ticker-card"
      bodyStyle={{ padding: '16px' }}
    >
      {/* 数据警告提示 */}
      {!tradingStatus.isTrading && (
        <Alert
          message="当前休盘时段"
          description={`纯碱期货当前不在交易时间，显示的是最后交易时段的数据。${tradingStatus.message}`}
          type="warning"
          showIcon
          icon={<ClockCircleOutlined />}
          style={{ marginBottom: '16px' }}
        />
      )}
      {dataStale && tradingStatus.isTrading && (
        <Alert
          message="数据可能已过期"
          description="最新数据距今已超过5分钟，可能存在数据采集问题。"
          type="error"
          showIcon
          icon={<WarningOutlined />}
          style={{ marginBottom: '16px' }}
        />
      )}

      {/* 主价格显示区 */}
      <div
        className={`price-main-display ${priceFlash ? `price-flash-${priceFlash}` : ''}`}
        style={{
          background: `linear-gradient(135deg, ${isRising ? '#2a0e0e' : '#0a2a0e'} 0%, #0f1419 100%)`,
          borderLeft: `4px solid ${priceColor}`,
          borderRadius: '8px',
          padding: '20px',
          marginBottom: '16px'
        }}
      >
        <Row align="middle" gutter={24}>
          <Col flex="auto">
            <div className="price-label">最新价</div>
            <div
              className="price-value"
              style={{ color: priceColor }}
            >
              {safeToFixed(data.price, 2)}
            </div>
          </Col>
          <Col>
            <Space direction="vertical" size="small" align="end">
              <Space className="price-change" style={{ color: priceColor }}>
                {isRising ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
                <span style={{ fontSize: '20px', fontWeight: 'bold' }}>
                  {isRising ? '+' : ''}{safeToFixed(data.change, 2)}
                </span>
              </Space>
              <Tag
                color={isRising ? 'red' : 'green'}
                style={{
                  fontSize: '16px',
                  padding: '6px 16px',
                  fontWeight: 'bold',
                  border: 'none'
                }}
              >
                {isRising ? '+' : ''}{safeToFixed(data.changePercent, 2)}%
              </Tag>
            </Space>
          </Col>
        </Row>
      </div>

      {/* 分时数据网格 */}
      <Row gutter={[12, 12]} className="price-stats-grid">
        <Col span={12}>
          <div className="stat-item">
            <div className="stat-label">今开</div>
            <div className="stat-value">{safeToFixed(data.open, 2)}</div>
          </div>
        </Col>
        <Col span={12}>
          <div className="stat-item">
            <div className="stat-label">最高</div>
            <div className="stat-value" style={{ color: '#ef4444' }}>
              {safeToFixed(data.high, 2)}
            </div>
          </div>
        </Col>
        <Col span={12}>
          <div className="stat-item">
            <div className="stat-label">最低</div>
            <div className="stat-value" style={{ color: '#22c55e' }}>
              {safeToFixed(data.low, 2)}
            </div>
          </div>
        </Col>
        <Col span={12}>
          <div className="stat-item">
            <div className="stat-label">成交量</div>
            <div className="stat-value">{data.volume.toLocaleString()}</div>
          </div>
        </Col>
      </Row>

      {/* 五档盘口 */}
      {latestTick && (latestTick.ask_price1 || latestTick.bid_price1) && (
        <div className="orderbook-section" style={{ marginTop: '16px' }}>
          <div style={{
            fontSize: '14px',
            fontWeight: 'bold',
            marginBottom: '8px',
            color: '#888'
          }}>
            五档盘口
          </div>
          <div className="orderbook-grid">
            {/* 卖五到卖一（倒序显示） */}
            {[5, 4, 3, 2, 1].map((level) => {
              const askPrice = latestTick[`ask_price${level}` as keyof typeof latestTick] as number;
              const askVolume = latestTick[`ask_volume${level}` as keyof typeof latestTick] as number;
              if (!askPrice || askPrice === 0) return null;

              return (
                <div key={`ask-${level}`} className="orderbook-row ask-row">
                  <span className="level-label">卖{level}</span>
                  <span className="price-value" style={{ color: '#22c55e' }}>
                    {safeToFixed(askPrice, 2)}
                  </span>
                  <span className="volume-value">{askVolume || 0}</span>
                </div>
              );
            })}

            {/* 分隔线 */}
            <div style={{
              borderTop: '2px solid #333',
              margin: '4px 0'
            }} />

            {/* 买一到买五 */}
            {[1, 2, 3, 4, 5].map((level) => {
              const bidPrice = latestTick[`bid_price${level}` as keyof typeof latestTick] as number;
              const bidVolume = latestTick[`bid_volume${level}` as keyof typeof latestTick] as number;
              if (!bidPrice || bidPrice === 0) return null;

              return (
                <div key={`bid-${level}`} className="orderbook-row bid-row">
                  <span className="level-label">买{level}</span>
                  <span className="price-value" style={{ color: '#ef4444' }}>
                    {safeToFixed(bidPrice, 2)}
                  </span>
                  <span className="volume-value">{bidVolume || 0}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 更新时间 */}
      <div className="update-time">
        最后更新: {data.timestamp || '-'}
      </div>
    </Card>
  );
};

export default RealTimePricePanel;
