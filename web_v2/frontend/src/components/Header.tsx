import { useState, useEffect } from 'react'
import { Layout as AntLayout, Badge, Space, Typography, Tag } from 'antd'
import {
  WifiOutlined,
  DisconnectOutlined,
  ThunderboltOutlined,
  DatabaseOutlined,
  CloudServerOutlined
} from '@ant-design/icons'
import { getDataSource, DataSourceInfo } from '../api/config'
import './Header.css'

const { Header: AntHeader } = AntLayout
const { Text, Title } = Typography

interface HeaderProps {
  wsConnected: boolean
}

const Header = ({ wsConnected }: HeaderProps) => {
  const [dataSource, setDataSource] = useState<DataSourceInfo | null>(null)

  useEffect(() => {
    // 获取数据源信息
    const fetchDataSource = async () => {
      try {
        const response = await getDataSource()
        if (response.data) {
          setDataSource(response.data)
        }
      } catch (error) {
        console.error('获取数据源信息失败:', error)
      }
    }

    fetchDataSource()
    // 每30秒刷新一次
    const interval = setInterval(fetchDataSource, 30000)
    return () => clearInterval(interval)
  }, [])

  // 根据数据源类型选择颜色和图标
  const getDataSourceDisplay = () => {
    if (!dataSource) return null

    let color = 'default'
    let icon = <DatabaseOutlined />
    let text = dataSource.description

    if (dataSource.source === 'tqsdk_real') {
      color = 'success'
      icon = <CloudServerOutlined />
      text = '真实行情'
    } else if (dataSource.source === 'tqsdk_sim') {
      color = 'processing'
      icon = <CloudServerOutlined />
      text = '模拟账户'
    } else if (dataSource.source === 'database') {
      color = 'blue'
      icon = <DatabaseOutlined />
      text = '数据库'
    } else if (dataSource.source === 'mock') {
      color = 'warning'
      icon = <DatabaseOutlined />
      text = '模拟数据'
    }

    return (
      <Tag color={color} icon={icon}>
        {text}
      </Tag>
    )
  }

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
          {getDataSourceDisplay()}

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
