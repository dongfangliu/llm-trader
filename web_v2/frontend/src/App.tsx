import { useState, useCallback } from 'react'
import { Layout, Menu, message } from 'antd'
import { 
  DashboardOutlined, 
  LineChartOutlined, 
  ShoppingOutlined,
  RobotOutlined,
  TrophyOutlined,
  ExperimentOutlined
} from '@ant-design/icons'
import Header from './components/Header'
import Dashboard from './components/Dashboard'
import MarketRegime from './pages/MarketRegime'
import OrderFlow from './pages/OrderFlow'
import LLMExpert from './pages/LLMExpert'
import StrategyPerformance from './pages/StrategyPerformance'
import Backtest from './pages/Backtest'
import { useWebSocket } from './hooks/useWebSocket'
import { getWebSocketUrl } from './config/api'
import './App.css'

const { Content, Sider } = Layout

type MenuItem = {
  key: string
  icon: React.ReactNode
  label: string
  component: React.ComponentType<any>
}

const menuItems: MenuItem[] = [
  {
    key: 'dashboard',
    icon: <DashboardOutlined />,
    label: '总览',
    component: Dashboard
  },
  {
    key: 'market-regime',
    icon: <LineChartOutlined />,
    label: '市场态势',
    component: MarketRegime
  },
  {
    key: 'order-flow',
    icon: <ShoppingOutlined />,
    label: '订单流',
    component: OrderFlow
  },
  {
    key: 'llm-expert',
    icon: <RobotOutlined />,
    label: 'LLM专家',
    component: LLMExpert
  },
  {
    key: 'strategy',
    icon: <TrophyOutlined />,
    label: '策略表现',
    component: StrategyPerformance
  },
  {
    key: 'backtest',
    icon: <ExperimentOutlined />,
    label: '回测',
    component: Backtest
  }
]

function App() {
  const [wsConnected, setWsConnected] = useState(false)
  const [currentPage, setCurrentPage] = useState('dashboard')
  const [collapsed, setCollapsed] = useState(false)

  // 使用useCallback缓存回调函数，避免每次渲染都重新创建
  const handleOpen = useCallback(() => {
    setWsConnected(true)
    message.success('实时连接已建立')
  }, [])

  const handleClose = useCallback(() => {
    setWsConnected(false)
    // 不显示警告信息，因为会自动重连
  }, [])

  const handleError = useCallback((error: Event) => {
    console.error('WebSocket错误:', error)
  }, [])

  const { lastMessage } = useWebSocket({
    url: getWebSocketUrl(),
    onOpen: handleOpen,
    onClose: handleClose,
    onError: handleError,
  })

  const currentMenuItem = menuItems.find(item => item.key === currentPage)
  const CurrentComponent = currentMenuItem?.component || Dashboard

  return (
    <Layout className="app-layout" style={{ minHeight: '100vh' }}>
      <Header wsConnected={wsConnected} />
      <Layout>
        <Sider 
          collapsible 
          collapsed={collapsed} 
          onCollapse={setCollapsed}
          style={{ background: '#fff' }}
          width={200}
        >
          <Menu
            mode="inline"
            selectedKeys={[currentPage]}
            style={{ height: '100%', borderRight: 0 }}
            onClick={({ key }) => setCurrentPage(key)}
            items={menuItems.map(item => ({
              key: item.key,
              icon: item.icon,
              label: item.label
            }))}
          />
        </Sider>
        <Layout style={{ padding: '24px' }}>
          <Content 
            className="app-content"
            style={{
              background: '#f0f2f5',
              minHeight: 280
            }}
          >
            <CurrentComponent wsMessage={lastMessage} />
          </Content>
        </Layout>
      </Layout>
    </Layout>
  )
}

export default App
