import { Card, Statistic, Row, Col, Progress } from 'antd'
import { ArrowUpOutlined, ArrowDownOutlined, DollarOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { getAccount } from '../api/trading'
import { useEffect } from 'react'
import './AccountCard.css'

interface AccountCardProps {
  wsMessage?: any
}

const AccountCard = ({ wsMessage }: AccountCardProps) => {
  const { data, refetch } = useQuery({
    queryKey: ['account'],
    queryFn: getAccount,
    refetchInterval: 5000,
  })

  useEffect(() => {
    if (wsMessage?.type === 'account_update' || wsMessage?.type === 'realtime_update') {
      refetch()
    }
  }, [wsMessage, refetch])

  const accountData = data?.data || {}
  const { balance = 0, equity = 0, pnl = 0, pnl_percent = 0, drawdown = 0, positions_count = 0 } = accountData

  return (
    <Card title="账户信息" bordered={false} className="account-card">
      <Row gutter={[16, 16]}>
        <Col span={12}>
          <Statistic
            title="账户余额"
            value={balance}
            precision={2}
            prefix="¥"
            valueStyle={{ color: '#fff', fontSize: 18 }}
          />
        </Col>
        <Col span={12}>
          <Statistic
            title="总权益"
            value={equity}
            precision={2}
            prefix="¥"
            valueStyle={{ color: '#1890ff', fontSize: 18 }}
          />
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col span={12}>
          <Statistic
            title="今日盈亏"
            value={pnl}
            precision={2}
            prefix={pnl >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
            suffix={`(${pnl_percent.toFixed(2)}%)`}
            valueStyle={{ color: pnl >= 0 ? '#52c41a' : '#ff4d4f', fontSize: 16 }}
          />
        </Col>
        <Col span={12}>
          <Statistic
            title="持仓数量"
            value={positions_count}
            suffix="个"
            prefix={<DollarOutlined />}
            valueStyle={{ color: '#faad14', fontSize: 16 }}
          />
        </Col>
      </Row>

      <div style={{ marginTop: 16 }}>
        <div style={{ marginBottom: 8, fontSize: 12, color: '#999' }}>
          最大回撤: {(drawdown * 100).toFixed(2)}%
        </div>
        <Progress
          percent={drawdown * 100}
          strokeColor={{ '0%': '#52c41a', '50%': '#faad14', '100%': '#ff4d4f' }}
          showInfo={false}
          size="small"
        />
      </div>
    </Card>
  )
}

export default AccountCard
