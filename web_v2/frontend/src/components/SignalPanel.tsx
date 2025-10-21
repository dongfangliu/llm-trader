import { Card, Empty } from 'antd'
import './SignalPanel.css'

const SignalPanel = () => {
  return (
    <Card title="交易信号" bordered={false} className="signal-panel">
      <Empty description="暂无信号" image={Empty.PRESENTED_IMAGE_SIMPLE} />
    </Card>
  )
}

export default SignalPanel
