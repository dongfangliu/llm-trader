/**
 * 快速交易面板 - 炒股软件风格
 * 仅提供一键平仓功能
 */

import React, { useState, useEffect } from 'react';
import { Card, Button, Space, message, Statistic, Row, Col, Alert, Empty } from 'antd';
import { CloseCircleOutlined, WarningOutlined } from '@ant-design/icons';
import { emergencyClose, getAccount, getPositions } from '../../api/trading';

interface AccountInfo {
  balance: number;
  available: number;
}

interface PositionInfo {
  symbol: string;
  direction: string;
  volume: number;
  entry_price: number;
  current_price: number;
  pnl: number;
}

const QuickTradePanel: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [account, setAccount] = useState<AccountInfo>({ balance: 0, available: 0 });
  const [positions, setPositions] = useState<PositionInfo[]>([]);
  const [hasPositions, setHasPositions] = useState(false);

  // 获取账户信息和持仓
  useEffect(() => {
    const fetchData = async () => {
      try {
        // 获取账户信息
        const accountResponse = await getAccount();
        setAccount({
          balance: accountResponse.data.balance || 0,
          available: accountResponse.data.available || accountResponse.data.balance || 0
        });

        // 获取持仓信息
        const positionsResponse = await getPositions();
        const positionsList = positionsResponse.data?.positions || [];
        setPositions(positionsList);
        setHasPositions(positionsList.length > 0);
      } catch (error) {
        console.error('获取数据失败:', error);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleEmergencyClose = async () => {
    if (!hasPositions) {
      message.warning('当前没有持仓');
      return;
    }

    setLoading(true);
    try {
      await emergencyClose();
      message.success('紧急平仓指令已发送！');
    } catch (error) {
      message.error('平仓失败: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card title="持仓管理" style={{ height: '100%' }}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* 账户余额 */}
        <Row gutter={16}>
          <Col span={12}>
            <Statistic
              title="账户余额"
              value={account.balance}
              precision={2}
              prefix="¥"
              valueStyle={{ fontSize: '16px', color: '#1890ff' }}
            />
          </Col>
          <Col span={12}>
            <Statistic
              title="可用资金"
              value={account.available}
              precision={2}
              prefix="¥"
              valueStyle={{ fontSize: '16px', color: '#52c41a' }}
            />
          </Col>
        </Row>

        {/* 持仓状态 */}
        {hasPositions ? (
          <Alert
            message={`当前持有 ${positions.length} 个持仓`}
            description={
              <div style={{ marginTop: '8px' }}>
                {positions.map((pos, idx) => (
                  <div key={idx} style={{ marginBottom: '4px' }}>
                    <span style={{ fontWeight: 'bold' }}>
                      {pos.direction === 'long' ? '多' : '空'} {pos.volume} 手
                    </span>
                    {' @ '}
                    <span>¥{pos.entry_price?.toFixed(2)}</span>
                    {' | '}
                    <span style={{ color: (pos.pnl ?? 0) >= 0 ? '#52c41a' : '#ff4d4f' }}>
                      {(pos.pnl ?? 0) >= 0 ? '+' : ''}¥{(pos.pnl ?? 0).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            }
            type="info"
            showIcon
          />
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="当前无持仓"
            style={{ padding: '20px 0' }}
          />
        )}

        {/* 一键平仓按钮 */}
        <Button
          danger
          size="large"
          block
          loading={loading}
          disabled={!hasPositions}
          onClick={handleEmergencyClose}
          icon={<CloseCircleOutlined />}
          style={{
            height: '60px',
            fontSize: '18px',
            fontWeight: 'bold'
          }}
        >
          紧急平仓（平所有持仓）
        </Button>

        {/* 提示信息 */}
        <Alert
          message="仅提供平仓功能"
          description="本系统为量化交易系统，开仓由策略自动执行。此处仅提供紧急平仓功能，用于风险控制。"
          type="warning"
          showIcon
          icon={<WarningOutlined />}
        />

        {/* 风险提示 */}
        <div style={{
          padding: '12px',
          background: '#fff7e6',
          border: '1px solid #ffd591',
          borderRadius: '4px',
          fontSize: '12px',
          color: '#ad6800'
        }}>
          ⚠️ 期货交易有风险，请谨慎操作。本系统当前使用模拟账户。
        </div>
      </Space>
    </Card>
  );
};

export default QuickTradePanel;
