/**
 * 订单流分析页面
 * VPIN毒性监控、订单簿热力图、大单追踪
 */

import React, { useEffect, useState, useRef } from 'react';
import { Card, Row, Col, Table, Timeline, Space, Tag, Progress, Statistic, Alert, Drawer, Button } from 'antd';
import { 
  ThunderboltOutlined, 
  FireOutlined, 
  WarningOutlined,
  CheckCircleOutlined,
  SettingOutlined
} from '@ant-design/icons';
import * as echarts from 'echarts';
import { getVPIN, getOrderBook, getLargeOrders } from '../api/orderFlow';
import ConfigPanel from '../components/OrderFlow/ConfigPanel';

interface VPINData {
  vpin: number;
  toxicity_level: string;
  buy_volume: number;
  sell_volume: number;
  imbalance: number;
}

interface OrderBookLevel {
  price: number;
  bid_volume: number;
  ask_volume: number;
  total_volume: number;
}

interface LargeOrder {
  timestamp: string;
  direction: string;
  price: number;
  volume: number;
  market_impact: number;
}

const OrderFlow: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [vpinData, setVpinData] = useState<VPINData | null>(null);
  const [orderBook, setOrderBook] = useState<OrderBookLevel[]>([]);
  const [largeOrders, setLargeOrders] = useState<LargeOrder[]>([]);
  const [configDrawerVisible, setConfigDrawerVisible] = useState(false);
  
  const orderBookChartRef = useRef<HTMLDivElement>(null);
  const orderBookChart = useRef<echarts.ECharts | null>(null);

  // 初始加载数据
  const fetchInitialData = async () => {
    try {
      setLoading(true);
      const [vpinRes, orderBookRes, largeOrdersRes] = await Promise.all([
        getVPIN(),
        getOrderBook(),
        getLargeOrders(20)
      ]);

      setVpinData(vpinRes as any);
      
      // 构建订单簿层级数据
      const bookData = orderBookRes as any;
      if (bookData.bids && bookData.asks) {
        const levels: OrderBookLevel[] = [];
        const bids = bookData.bids || [];
        const asks = bookData.asks || [];
        
        // 先添加卖盘
        asks.forEach((ask: any) => {
          if (ask.price && ask.price > 0) {
            levels.push({
              price: ask.price,
              bid_volume: 0,
              ask_volume: ask.volume || 0,
              total_volume: ask.volume || 0
            });
          }
        });
        
        // 再添加买盘
        bids.forEach((bid: any) => {
          if (bid.price && bid.price > 0) {
            levels.push({
              price: bid.price,
              bid_volume: bid.volume || 0,
              ask_volume: 0,
              total_volume: bid.volume || 0
            });
          }
        });
        
        // 按价格排序
        levels.sort((a, b) => b.price - a.price);
        
        setOrderBook(levels);
      }
      
      setLargeOrders((largeOrdersRes as any).orders || []);
    } catch (error) {
      console.error('Failed to fetch order flow data:', error);
    } finally {
      setLoading(false);
    }
  };

  // WebSocket实时更新
  useEffect(() => {
    fetchInitialData();

    // WebSocket连接
    const wsUrl = `ws://${window.location.hostname}:8000/ws`;
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        
        if (message.type === 'order_flow') {
          const data = message.data;
          
          // 更新VPIN
          if (data.vpin) {
            setVpinData({
              vpin: data.vpin.vpin,
              toxicity_level: data.vpin.level,
              buy_volume: data.vpin.buy_volume,
              sell_volume: data.vpin.sell_volume,
              imbalance: data.vpin.imbalance
            });
          }
          
          // 更新订单簿
          if (data.orderbook) {
            const ob = data.orderbook;
            const levels: OrderBookLevel[] = [];
            
            // 合并买卖盘数据，确保有有效价格
            const bids = ob.bids || [];
            const asks = ob.asks || [];
            
            // 先添加卖盘（价格从低到高）
            asks.forEach((ask: any) => {
              if (ask.price && ask.price > 0) {
                levels.push({
                  price: ask.price,
                  bid_volume: 0,
                  ask_volume: ask.volume || 0,
                  total_volume: ask.volume || 0
                });
              }
            });
            
            // 再添加买盘（价格从高到低）
            bids.forEach((bid: any) => {
              if (bid.price && bid.price > 0) {
                levels.push({
                  price: bid.price,
                  bid_volume: bid.volume || 0,
                  ask_volume: 0,
                  total_volume: bid.volume || 0
                });
              }
            });
            
            // 按价格排序
            levels.sort((a, b) => b.price - a.price);
            
            setOrderBook(levels);
          }
          
          // 更新大单
          if (data.large_order) {
            setLargeOrders(prev => [{
              timestamp: data.large_order.timestamp,
              direction: data.large_order.direction,
              price: data.large_order.price,
              volume: data.large_order.volume,
              market_impact: ((data.large_order.volume - data.large_order.avg_volume) / data.large_order.avg_volume * 100)
            }, ...prev.slice(0, 19)]);
          }
        }
      } catch (error) {
        console.error('WebSocket message parse error:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('WebSocket closed, reconnecting...');
      // 可以添加重连逻辑
    };

    return () => {
      ws.close();
    };
  }, []);

  // 渲染订单簿热力图
  useEffect(() => {
    if (!orderBookChartRef.current || orderBook.length === 0) return;

    if (!orderBookChart.current) {
      orderBookChart.current = echarts.init(orderBookChartRef.current);
    }

    const chart = orderBookChart.current;
    
    // 过滤掉无效数据并格式化
    const validOrderBook = orderBook.filter(l => l.price && typeof l.price === 'number');
    if (validOrderBook.length === 0) return;
    
    const prices = validOrderBook.map(l => (l.price ?? 0).toFixed(2));
    const bidVolumes = validOrderBook.map(l => -(l.bid_volume || 0)); // 负数表示买单
    const askVolumes = validOrderBook.map(l => l.ask_volume || 0);

    const option = {
      title: {
        text: '订单簿深度',
        left: 'center'
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'shadow'
        },
        formatter: (params: any) => {
          const price = params[0].axisValue;
          const bid = Math.abs(params[0].value);
          const ask = params[1].value;
          return `价格: ${price}<br/>买单: ${bid}<br/>卖单: ${ask}`;
        }
      },
      legend: {
        data: ['买单', '卖单'],
        bottom: 10
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '15%',
        containLabel: true
      },
      xAxis: {
        type: 'value',
        splitLine: { show: false }
      },
      yAxis: {
        type: 'category',
        data: prices,
        axisLabel: {
          fontSize: 10
        }
      },
      series: [
        {
          name: '买单',
          type: 'bar',
          stack: 'total',
          data: bidVolumes,
          itemStyle: {
            color: '#26a69a'
          }
        },
        {
          name: '卖单',
          type: 'bar',
          stack: 'total',
          data: askVolumes,
          itemStyle: {
            color: '#ef5350'
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
  }, [orderBook]);

  useEffect(() => {
    return () => {
      if (orderBookChart.current) {
        orderBookChart.current.dispose();
        orderBookChart.current = null;
      }
    };
  }, []);

  const getToxicityColor = (level: string) => {
    switch (level) {
      case 'low': return '#52c41a';
      case 'medium': return '#faad14';
      case 'high': return '#ff4d4f';
      default: return '#8c8c8c';
    }
  };

  const getToxicityIcon = (level: string) => {
    switch (level) {
      case 'low': return <CheckCircleOutlined />;
      case 'medium': return <WarningOutlined />;
      case 'high': return <FireOutlined />;
      default: return <ThunderboltOutlined />;
    }
  };

  const getToxicityText = (level: string) => {
    switch (level) {
      case 'low': return '低毒性';
      case 'medium': return '中毒性';
      case 'high': return '高毒性';
      default: return level;
    }
  };

  const orderBookColumns = [
    {
      title: '价格',
      dataIndex: 'price',
      key: 'price',
      render: (price: number) => <strong>{(price !== undefined && price !== null) ? price.toFixed(2) : '-'}</strong>,
      align: 'center' as const
    },
    {
      title: '买量',
      dataIndex: 'bid_volume',
      key: 'bid_volume',
      render: (vol: number) => {
        const volume = vol || 0;
        return (
          <div style={{ 
            background: volume > 0 ? `linear-gradient(to right, #26a69a ${Math.min(volume / 100, 100)}%, transparent 0%)` : 'transparent',
            padding: '4px 8px',
            textAlign: 'right'
          }}>
            {volume > 0 ? volume.toLocaleString() : '-'}
          </div>
        );
      }
    },
    {
      title: '卖量',
      dataIndex: 'ask_volume',
      key: 'ask_volume',
      render: (vol: number) => {
        const volume = vol || 0;
        return (
          <div style={{ 
            background: volume > 0 ? `linear-gradient(to left, #ef5350 ${Math.min(volume / 100, 100)}%, transparent 0%)` : 'transparent',
            padding: '4px 8px',
            textAlign: 'left'
          }}>
            {volume > 0 ? volume.toLocaleString() : '-'}
          </div>
        );
      }
    }
  ];

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      {/* VPIN毒性监控 */}
      <Card 
        title="VPIN毒性监控" 
        loading={loading}
        extra={
          <Space>
            <Tag color="blue">实时更新</Tag>
            <Button 
              icon={<SettingOutlined />} 
              size="small"
              onClick={() => setConfigDrawerVisible(true)}
            >
              参数配置
            </Button>
          </Space>
        }
      >
        {vpinData && (
          <>
            {vpinData.toxicity_level === 'high' && (
              <Alert
                message="高毒性警告"
                description="当前订单流毒性较高，建议谨慎交易或暂停开仓"
                type="error"
                showIcon
                style={{ marginBottom: '16px' }}
              />
            )}
            
            <Row gutter={[16, 16]}>
              <Col span={24}>
                <Space size="large" style={{ width: '100%', justifyContent: 'space-around' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ 
                      fontSize: '48px', 
                      marginBottom: '8px',
                      color: getToxicityColor(vpinData.toxicity_level)
                    }}>
                      {getToxicityIcon(vpinData.toxicity_level)}
                    </div>
                    <Tag 
                      color={getToxicityColor(vpinData.toxicity_level)} 
                      style={{ fontSize: '16px', padding: '4px 16px' }}
                    >
                      {getToxicityText(vpinData.toxicity_level)}
                    </Tag>
                  </div>

                  <Statistic
                    title="VPIN值"
                    value={vpinData.vpin || 0}
                    precision={3}
                    valueStyle={{ 
                      color: getToxicityColor(vpinData.toxicity_level)
                    }}
                  />

                  <Statistic
                    title="买入成交量"
                    value={vpinData.buy_volume || 0}
                    valueStyle={{ color: '#26a69a' }}
                  />

                  <Statistic
                    title="卖出成交量"
                    value={vpinData.sell_volume || 0}
                    valueStyle={{ color: '#ef5350' }}
                  />

                  <Statistic
                    title="买卖不平衡"
                    value={vpinData.imbalance || 0}
                    precision={1}
                    suffix="%"
                    valueStyle={{ 
                      color: Math.abs(vpinData.imbalance || 0) > 30 ? '#ff4d4f' : '#52c41a'
                    }}
                  />
                </Space>
              </Col>

              <Col span={24}>
                <div style={{ marginTop: '16px' }}>
                  <div style={{ marginBottom: '8px', color: '#595959' }}>
                    毒性水平 (VPIN越高，信息不对称越严重)
                  </div>
                  <Progress 
                    percent={Math.min((vpinData.vpin || 0) * 100, 100)} 
                    strokeColor={getToxicityColor(vpinData.toxicity_level)}
                    status={vpinData.toxicity_level === 'high' ? 'exception' : 'normal'}
                  />
                </div>
              </Col>
            </Row>
          </>
        )}
      </Card>

      {/* 订单簿深度可视化 */}
      <Row gutter={16}>
        <Col xs={24} lg={12}>
          <Card title="订单簿热力图" loading={loading}>
            <div 
              ref={orderBookChartRef} 
              style={{ width: '100%', height: '400px' }}
            />
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card title="订单簿明细" loading={loading}>
            <Table
              columns={orderBookColumns}
              dataSource={orderBook}
              rowKey="price"
              pagination={false}
              size="small"
              scroll={{ y: 350 }}
            />
          </Card>
        </Col>
      </Row>

      {/* 大单追踪 */}
      <Card title="大单追踪时间轴" loading={loading}>
        <Timeline>
          {largeOrders.map((order, index) => (
            <Timeline.Item
              key={index}
              color={order.direction === 'buy' ? 'green' : 'red'}
              dot={
                order.direction === 'buy' 
                  ? <ThunderboltOutlined style={{ color: '#52c41a' }} />
                  : <ThunderboltOutlined style={{ color: '#ff4d4f' }} />
              }
            >
              <Space direction="vertical" size="small">
                <Space>
                  <strong>{order.timestamp}</strong>
                  <Tag color={order.direction === 'buy' ? 'success' : 'error'}>
                    {order.direction === 'buy' ? '大买单' : '大卖单'}
                  </Tag>
                  <span>价格: <strong>{(order.price ?? 0).toFixed(2)}</strong></span>
                  <span>量: <strong>{order.volume ?? 0}</strong></span>
                </Space>
                <div style={{ color: '#595959', fontSize: '12px' }}>
                  市场冲击: 
                  <Tag 
                    color={Math.abs(order.market_impact ?? 0) > 0.5 ? 'error' : 'success'}
                    style={{ marginLeft: '8px' }}
                  >
                    {(order.market_impact ?? 0) >= 0 ? '+' : ''}
                    {(order.market_impact ?? 0).toFixed(2)}%
                  </Tag>
                </div>
              </Space>
            </Timeline.Item>
          ))}
        </Timeline>

        {largeOrders.length === 0 && (
          <div style={{ textAlign: 'center', padding: '24px', color: '#8c8c8c' }}>
            暂无大单交易
          </div>
        )}
      </Card>

      {/* 配置抽屉 */}
      <Drawer
        title="订单流参数配置"
        placement="right"
        width={400}
        open={configDrawerVisible}
        onClose={() => setConfigDrawerVisible(false)}
        destroyOnClose
      >
        <ConfigPanel onConfigChange={() => {
          // 配置更新后可以选择性重新加载数据
          console.log('订单流配置已更新');
        }} />
      </Drawer>
    </Space>
  );
};

export default OrderFlow;
