import { Layout as AntLayout, Badge, Space, Typography } from 'antd'
import { WifiOutlined, DisconnectOutlined, ThunderboltOutlined } from '@ant-design/icons'
import './Header.css'

const { Header: AntHeader } = AntLayout
const { Text, Title } = Typography

interface HeaderProps {
  wsConnected: boolean
}

const Header = ({ wsConnected }: HeaderProps) => {
  return (
    <AntHeader className="header">
      <div className="header-left">
        <ThunderboltOutlined style={{ fontSize: 24, color: '#1890ff' }} />
        <Title level={4} style={{ margin: '0 0 0 12px', color: '#fff' }}>
          量化交易系统 V2
        </Title>
      </div>

      <div className="header-right">
        <Space size="large">
          <Badge
            status={wsConnected ? 'success' : 'error'}
            text={
              <Space>
                {wsConnected ? <WifiOutlined /> : <DisconnectOutlined />}
                <Text style={{ color: '#fff' }}>
                  {wsConnected ? '实时连接' : '连接断开'}
                </Text>
              </Space>
            }
          />

          <Text type="secondary" style={{ fontFamily: 'monospace' }}>
            {new Date().toLocaleString('zh-CN')}
          </Text>
        </Space>
      </div>
    </AntHeader>
  )
}

export default Header
