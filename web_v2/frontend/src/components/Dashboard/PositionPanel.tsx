/**
 * 持仓面板 - 炒股软件风格
 * 清晰显示当前持仓、盈亏、持仓成本等
 */

import React, { useEffect, useState } from 'react';
import { Card, Table, Tag, Space, Button, Statistic, Empty } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { getPositions } from '../../api/trading';
import { safeToFixed, safeNumber } from '../../utils/format';
import type { ColumnsType } from 'antd/es/table';

interface Position {
  symbol: string;
  direction: string;
  volume: number;
  entry_price: number;
  current_price: number;
  pnl: number;
  pnl_percent: number;
}

const PositionPanel: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [positions, setPositions] = useState<Position[]>([]);

  const fetchPositions = async () => {
    try {
      const response = await getPositions();
      setPositions(response.data?.positions || []);
      setLoading(false);
    } catch (error) {
      console.error('获取持仓失败:', error);
      setPositions([]);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPositions();
    const interval = setInterval(fetchPositions, 3000);
    return () => clearInterval(interval);
  }, []);

  // 计算汇总数据
  const totalPnl = positions.reduce((sum, pos) => sum + pos.pnl, 0);
  const totalValue = positions.reduce(
    (sum, pos) => sum + pos.current_price * pos.volume * 5, // 5吨/手
    0
  );

  const columns: ColumnsType<Position> = [
    {
      title: '合约',
      dataIndex: 'symbol',
      key: 'symbol',
      width: 100,
      render: (text) => <Tag color="blue">{text}</Tag>
    },
    {
      title: '方向',
      dataIndex: 'direction',
      key: 'direction',
      width: 80,
      render: (direction) => (
        <Tag color={direction === 'long' ? 'red' : 'green'}>
          {direction === 'long' ? '做多' : '做空'}
        </Tag>
      )
    },
    {
      title: '持仓量',
      dataIndex: 'volume',
      key: 'volume',
      width: 100,
      render: (volume) => <span style={{ fontWeight: 'bold' }}>{volume} 手</span>
    },
    {
      title: '开仓价',
      dataIndex: 'entry_price',
      key: 'entry_price',
      width: 120,
      render: (price) => (
        <span style={{ fontFamily: 'monospace' }}>{safeToFixed(price, 2)}</span>
      )
    },
    {
      title: '现价',
      dataIndex: 'current_price',
      key: 'current_price',
      width: 120,
      render: (price, record) => {
        const isProfit = safeNumber(record.pnl, 0) >= 0;
        return (
          <span
            style={{
              fontFamily: 'monospace',
              color: isProfit ? '#f5222d' : '#52c41a',
              fontWeight: 'bold'
            }}
          >
            {safeToFixed(price, 2)}
          </span>
        );
      }
    },
    {
      title: '盈亏',
      dataIndex: 'pnl',
      key: 'pnl',
      width: 150,
      render: (pnl, record) => {
        const safePnl = safeNumber(pnl, 0);
        const isProfit = safePnl >= 0;
        return (
          <Space>
            {isProfit ? <ArrowUpOutlined style={{ color: '#f5222d' }} /> : <ArrowDownOutlined style={{ color: '#52c41a' }} />}
            <span
              style={{
                color: isProfit ? '#f5222d' : '#52c41a',
                fontWeight: 'bold',
                fontSize: '16px',
                fontFamily: 'monospace'
              }}
            >
              {isProfit ? '+' : ''}{safeToFixed(safePnl, 2)}
            </span>
            <Tag color={isProfit ? 'red' : 'green'}>
              {isProfit ? '+' : ''}{safeToFixed(record.pnl_percent, 2)}%
            </Tag>
          </Space>
        );
      }
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: () => (
        <Button
          type="primary"
          danger
          size="small"
          icon={<CloseCircleOutlined />}
        >
          平仓
        </Button>
      )
    }
  ];

  return (
    <Card
      title="持仓明细"
      extra={
        <Space size="large">
          <Statistic
            title="持仓盈亏"
            value={totalPnl}
            precision={2}
            prefix={totalPnl >= 0 ? '+¥' : '-¥'}
            valueStyle={{
              color: totalPnl >= 0 ? '#f5222d' : '#52c41a',
              fontSize: '20px'
            }}
          />
          <Statistic
            title="持仓市值"
            value={totalValue}
            precision={2}
            prefix="¥"
            valueStyle={{ fontSize: '16px' }}
          />
        </Space>
      }
      loading={loading}
    >
      {positions.length === 0 ? (
        <Empty
          description="暂无持仓"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      ) : (
        <Table
          columns={columns}
          dataSource={positions}
          rowKey="symbol"
          pagination={false}
          size="small"
          bordered
        />
      )}
    </Card>
  );
};

export default PositionPanel;
