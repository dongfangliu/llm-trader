import { Card, Button, Space, Switch, Divider, Popconfirm, message } from 'antd'
import { StopOutlined, PauseCircleOutlined, PlayCircleOutlined } from '@ant-design/icons'
import { useState } from 'react'
import { emergencyClose, pauseTrading, toggleStrategy } from '../api/trading'
import './ControlPanel.css'

const ControlPanel = () => {
  const [loading, setLoading] = useState(false)
  const [paused, setPaused] = useState(false)
  const [strategies, setStrategies] = useState({
    trend_following: true,
    mean_reversion: true,
    breakout: true,
  })

  const handleEmergencyClose = async () => {
    setLoading(true)
    try {
      const result: any = await emergencyClose()
      message.success(result.message || '平仓成功')
    } catch (error) {
      message.error('平仓失败')
    } finally {
      setLoading(false)
    }
  }

  const handlePauseToggle = async () => {
    setLoading(true)
    try {
      const result: any = await pauseTrading(!paused)
      setPaused(!paused)
      message.success(result.message || '操作成功')
    } catch (error) {
      message.error('操作失败')
    } finally {
      setLoading(false)
    }
  }

  const handleStrategyToggle = async (strategy: string, enabled: boolean) => {
    try {
      await toggleStrategy(strategy, enabled)
      setStrategies({ ...strategies, [strategy]: enabled })
      message.success(`策略已${enabled ? '启用' : '禁用'}`)
    } catch (error) {
      message.error('操作失败')
    }
  }

  return (
    <Card title="控制面板" bordered={false} className="control-panel">
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <Popconfirm
          title="确认紧急平仓？"
          description="此操作将立即平掉所有持仓"
          onConfirm={handleEmergencyClose}
          okText="确认"
          cancelText="取消"
        >
          <Button
            danger
            block
            icon={<StopOutlined />}
            loading={loading}
            size="large"
          >
            紧急平仓
          </Button>
        </Popconfirm>

        <Button
          block
          icon={paused ? <PlayCircleOutlined /> : <PauseCircleOutlined />}
          onClick={handlePauseToggle}
          loading={loading}
          type={paused ? 'primary' : 'default'}
        >
          {paused ? '恢复交易' : '暂停交易'}
        </Button>

        <Divider style={{ margin: '8px 0' }}>策略开关</Divider>

        <div className="strategy-item">
          <span>趋势跟踪</span>
          <Switch
            checked={strategies.trend_following}
            onChange={(checked) => handleStrategyToggle('trend_following', checked)}
          />
        </div>

        <div className="strategy-item">
          <span>均值回归</span>
          <Switch
            checked={strategies.mean_reversion}
            onChange={(checked) => handleStrategyToggle('mean_reversion', checked)}
          />
        </div>

        <div className="strategy-item">
          <span>突破策略</span>
          <Switch
            checked={strategies.breakout}
            onChange={(checked) => handleStrategyToggle('breakout', checked)}
          />
        </div>
      </Space>
    </Card>
  )
}

export default ControlPanel
