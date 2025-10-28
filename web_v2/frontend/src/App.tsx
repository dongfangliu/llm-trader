import { useState, useCallback } from 'react'
import { Layout, Menu, message } from 'antd'
import {
  DashboardOutlined,
  LineChartOutlined,
  ShoppingOutlined,
  RobotOutlined,
  TrophyOutlined,
  ExperimentOutlined,
  SettingOutlined,
  BugOutlined,
  FileTextOutlined,
} from '@ant-design/icons'
import Header from './components/Header'
import Dashboard from './components/Dashboard'
import MarketRegime from './pages/MarketRegime'
import OrderFlow from './pages/OrderFlow'
import LLMExpert from './pages/LLMExpert'
import StrategyPerformance from './pages/StrategyPerformance'
import Backtest from './pages/Backtest'
import Settings from './pages/Settings'
import SystemDebug from './pages/SystemDebug'
import BackendLogs from './pages/BackendLogs'
import BackendStatus from './components/BackendStatus'
import ErrorBoundary from './components/ErrorBoundary'
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
  },
  {
    key: 'debug',
    icon: <BugOutlined />,
    label: '系统调试',
    component: SystemDebug
  },
  {
    key: 'logs',
    icon: <FileTextOutlined />,
    label: '后端日志',
    component: BackendLogs
  },
  {
    key: 'settings',
    icon: <SettingOutlined />,
    label: '系统配置',
    component: Settings
  }
]

function App() {
  const [wsConnected, setWsConnected] = useState(false)
  const [currentPage, setCurrentPage] = useState('dashboard')
  const [collapsed, setCollapsed] = useState(false)

  // 新增：WebSocket数据状态
  const [klineUpdates, setKlineUpdates] = useState<Map<string, any[]>>(new Map())
  const [latestTick, setLatestTick] = useState<any>(null)

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

  // 新增：K线更新回调
  const handleKlineUpdate = useCallback((period: string, data: any[]) => {
    console.log(`[App] 收到K线更新: period=${period}, count=${data.length}`)
    setKlineUpdates(prev => {
      const newMap = new Map(prev)
      newMap.set(period, data)
      return newMap
    })
  }, [])

  // 新增：Tick更新回调
  const handleTickUpdate = useCallback((data: any) => {
    console.log(`[App] 收到Tick更新: price=${data.price}`)
    setLatestTick(data)
  }, [])

  const { lastMessage: _lastMessage } = useWebSocket({
    url: getWebSocketUrl(),
    onOpen: handleOpen,
    onClose: handleClose,
    onError: handleError,
    onKlineUpdate: handleKlineUpdate,  // 新增
    onTickUpdate: handleTickUpdate,    // 新增
  })

  const currentMenuItem = menuItems.find(item => item.key === currentPage)
  const CurrentComponent = currentMenuItem?.component || Dashboard

  return (
    <ErrorBoundary>
      <BackendStatus>
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
            <Layout style={{ padding: 0 }}>
              <Content
                className="app-content"
                style={{
                  minHeight: 280
                }}
              >
                {/* 传递WebSocket数据给子组件 */}
                <CurrentComponent
                  klineUpdates={klineUpdates}
                  latestTick={latestTick}
                />
              </Content>
            </Layout>
          </Layout>
        </Layout>
      </BackendStatus>
    </ErrorBoundary>
  )
}

export default App
