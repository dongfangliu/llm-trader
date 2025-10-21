import { Row, Col } from 'antd'
import { useEffect } from 'react'
import AccountCard from './AccountCard'
import KlineChart from './KlineChart'
import SignalPanel from './SignalPanel'
import ControlPanel from './ControlPanel'
import './Dashboard.css'

interface DashboardProps {
  wsMessage: any
}

const Dashboard = ({ wsMessage }: DashboardProps) => {
  useEffect(() => {
    if (wsMessage) {
      console.log('收到WebSocket消息:', wsMessage)
    }
  }, [wsMessage])

  return (
    <div className="dashboard">
      <Row gutter={[16, 16]}>
        {/* 左侧：图表 */}
        <Col xs={24} lg={18}>
          <KlineChart />
        </Col>

        {/* 右侧：信息面板 */}
        <Col xs={24} lg={6}>
          <Row gutter={[0, 16]}>
            <Col span={24}>
              <AccountCard wsMessage={wsMessage} />
            </Col>
            <Col span={24}>
              <ControlPanel />
            </Col>
            <Col span={24}>
              <SignalPanel />
            </Col>
          </Row>
        </Col>
      </Row>
    </div>
  )
}

export default Dashboard
