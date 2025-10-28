import { useState, useEffect } from 'react'
import { Form, Input, InputNumber, Select, Tabs, Button, Card, message, Spin, Space, Divider, Switch } from 'antd'
import { SaveOutlined, ReloadOutlined, UndoOutlined } from '@ant-design/icons'
import {
  getConfig,
  updateConfig,
  reloadConfig,
  ConfigData
} from '../api/config'

const { TabPane } = Tabs
const { Option } = Select
const { Password } = Input

export default function Settings() {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [reloading, setReloading] = useState(false)
  const [initialConfig, setInitialConfig] = useState<ConfigData | null>(null)

  // 加载配置
  const loadConfig = async () => {
    setLoading(true)
    try {
      const response: any = await getConfig()
      const config = response.data || response

      setInitialConfig(config)

      // 设置表单初始值
      const formValues: any = {}

      // Trading Params
      if (config.trading_params) {
        Object.keys(config.trading_params).forEach(section => {
          Object.keys(config.trading_params[section] || {}).forEach(key => {
            formValues[`${section}_${key}`] = config.trading_params[section][key]
          })
        })
      }

      // API Keys
      if (config.api_keys) {
        formValues['api_provider'] = config.api_keys.provider

        // TqSDK
        if (config.api_keys.tqsdk) {
          formValues['tqsdk_username'] = config.api_keys.tqsdk.username
          formValues['tqsdk_password'] = config.api_keys.tqsdk.password
          formValues['tqsdk_use_sim'] = config.api_keys.tqsdk.use_sim
        }

        // Providers
        if (config.api_keys.providers) {
          Object.keys(config.api_keys.providers).forEach(provider => {
            const providerConfig = config.api_keys.providers![provider]
            formValues[`provider_${provider}_api_key`] = providerConfig.api_key
            formValues[`provider_${provider}_base_url`] = providerConfig.base_url
          })
        }
      }

      form.setFieldsValue(formValues)
      message.success('配置加载成功')
    } catch (error: any) {
      message.error('加载配置失败: ' + (error.message || '未知错误'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadConfig()
  }, [])

  // 保存配置
  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)

      // 构建更新请求
      const updateRequest: any = {
        trading_params: {
          trading: {},
          risk: {},
          decision: {},
          llm: {},
          data: {},
          system: {},
          backtest: {}
        },
        api_keys: {
          provider: values.api_provider,
          providers: {},
          tqsdk: {}
        }
      }

      // 解析trading_params
      Object.keys(values).forEach(key => {
        const match = key.match(/^(trading|risk|decision|llm|data|system|backtest)_(.+)$/)
        if (match) {
          const [, section, field] = match
          updateRequest.trading_params[section][field] = values[key]
        }
      })

      // 解析api_keys - providers
      const providers = ['claude', 'openai', 'deepseek', 'custom']
      providers.forEach(provider => {
        const apiKey = values[`provider_${provider}_api_key`]
        const baseUrl = values[`provider_${provider}_base_url`]

        if (apiKey !== undefined || baseUrl !== undefined) {
          updateRequest.api_keys.providers[provider] = {}
          if (apiKey !== undefined) updateRequest.api_keys.providers[provider].api_key = apiKey
          if (baseUrl !== undefined) updateRequest.api_keys.providers[provider].base_url = baseUrl
        }
      })

      // 解析api_keys - tqsdk
      if (values.tqsdk_username !== undefined) updateRequest.api_keys.tqsdk.username = values.tqsdk_username
      if (values.tqsdk_password !== undefined) updateRequest.api_keys.tqsdk.password = values.tqsdk_password
      if (values.tqsdk_use_sim !== undefined) updateRequest.api_keys.tqsdk.use_sim = values.tqsdk_use_sim

      // 发送更新请求
      await updateConfig(updateRequest)
      message.success('配置保存成功')

      // 重新加载配置
      await loadConfig()
    } catch (error: any) {
      if (error.errorFields) {
        message.error('请检查表单输入')
      } else {
        message.error('保存配置失败: ' + (error.response?.data?.detail || error.message || '未知错误'))
      }
    } finally {
      setSaving(false)
    }
  }

  // 重载配置
  const handleReload = async () => {
    setReloading(true)
    try {
      await reloadConfig()
      message.success('配置重载请求已提交，部分配置需要重启系统才能生效')
    } catch (error: any) {
      message.error('重载配置失败: ' + (error.message || '未知错误'))
    } finally {
      setReloading(false)
    }
  }

  // 重置表单
  const handleReset = () => {
    if (initialConfig) {
      form.resetFields()
      message.info('表单已重置')
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <Spin size="large" tip="加载配置中..." />
      </div>
    )
  }

  return (
    <div style={{ padding: '0 24px' }}>
      <Card
        title="系统配置管理"
        extra={
          <Space>
            <Button icon={<UndoOutlined />} onClick={handleReset}>
              重置
            </Button>
            <Button
              icon={<ReloadOutlined />}
              onClick={handleReload}
              loading={reloading}
            >
              重载配置
            </Button>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              onClick={handleSave}
              loading={saving}
            >
              保存配置
            </Button>
          </Space>
        }
      >
        <Form
          form={form}
          layout="vertical"
          autoComplete="off"
        >
          <Tabs defaultActiveKey="trading">
            {/* Trading配置 */}
            <TabPane tab="交易配置" key="trading">
              <Form.Item
                name="trading_initial_capital"
                label="初始资金"
                rules={[{ required: true, message: '请输入初始资金' }]}
                tooltip="账户初始资金（元）"
              >
                <InputNumber
                  min={1000}
                  max={10000000}
                  style={{ width: '100%' }}
                  addonAfter="元"
                />
              </Form.Item>

              <Form.Item
                name="trading_max_position"
                label="最大持仓"
                rules={[{ required: true, message: '请输入最大持仓' }]}
                tooltip="最大持仓手数"
              >
                <InputNumber
                  min={1}
                  max={100}
                  style={{ width: '100%' }}
                  addonAfter="手"
                />
              </Form.Item>

              <Form.Item
                name="trading_single_trade"
                label="单次交易量"
                rules={[{ required: true, message: '请输入单次交易量' }]}
                tooltip="单次交易手数"
              >
                <InputNumber
                  min={1}
                  max={10}
                  style={{ width: '100%' }}
                  addonAfter="手"
                />
              </Form.Item>

              <Form.Item
                name="trading_symbol"
                label="交易品种"
                tooltip="交易合约代码（简称）"
              >
                <Input placeholder="例如: SA0" />
              </Form.Item>

              <Form.Item
                name="trading_tqsdk_symbol"
                label="TqSDK合约代码"
                tooltip="天勤SDK合约代码，如 KQ.m@CZCE.SA（主力合约）"
              >
                <Input placeholder="例如: KQ.m@CZCE.SA" />
              </Form.Item>
            </TabPane>

            {/* Risk配置 */}
            <TabPane tab="风控配置" key="risk">
              <Form.Item
                name="risk_stop_loss"
                label="止损金额"
                rules={[{ required: true, message: '请输入止损金额' }]}
                tooltip="单笔交易最大亏损（负数，元）"
              >
                <InputNumber
                  min={-10000}
                  max={-10}
                  style={{ width: '100%' }}
                  addonAfter="元"
                />
              </Form.Item>

              <Form.Item
                name="risk_daily_max_loss"
                label="日最大亏损"
                rules={[{ required: true, message: '请输入日最大亏损' }]}
                tooltip="单日最大亏损限制（负数，元）"
              >
                <InputNumber
                  min={-50000}
                  max={-100}
                  style={{ width: '100%' }}
                  addonAfter="元"
                />
              </Form.Item>

              <Form.Item
                name="risk_max_drawdown"
                label="最大回撤"
                rules={[{ required: true, message: '请输入最大回撤' }]}
                tooltip="允许的最大回撤比例（0-1）"
              >
                <InputNumber
                  min={0.01}
                  max={0.5}
                  step={0.01}
                  style={{ width: '100%' }}
                />
              </Form.Item>

              <Form.Item
                name="risk_max_hold_hours"
                label="最大持仓时长"
                tooltip="单笔持仓最长时间（小时）"
              >
                <InputNumber
                  min={1}
                  max={168}
                  style={{ width: '100%' }}
                  addonAfter="小时"
                />
              </Form.Item>

              <Form.Item
                name="risk_volatility_threshold"
                label="波动率阈值"
                tooltip="市场异常波动阈值"
              >
                <InputNumber
                  min={0.01}
                  max={0.5}
                  step={0.01}
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </TabPane>

            {/* Decision配置 */}
            <TabPane tab="决策配置" key="decision">
              <Form.Item
                name="decision_confidence_threshold"
                label="置信度阈值"
                tooltip="信号置信度阈值，低于此值触发LLM复核（%）"
              >
                <InputNumber
                  min={0}
                  max={100}
                  style={{ width: '100%' }}
                  addonAfter="%"
                />
              </Form.Item>

              <Form.Item
                name="decision_max_daily_trades"
                label="日最大交易次数"
                tooltip="每日最多开仓次数"
              >
                <InputNumber
                  min={1}
                  max={50}
                  style={{ width: '100%' }}
                />
              </Form.Item>

              <Form.Item
                name="decision_min_trade_gap"
                label="最小交易间隔"
                tooltip="两次交易之间的最小间隔（分钟）"
              >
                <InputNumber
                  min={1}
                  max={120}
                  style={{ width: '100%' }}
                  addonAfter="分钟"
                />
              </Form.Item>

              <Form.Item
                name="decision_tactical_interval"
                label="战术决策间隔"
                tooltip="量化策略决策周期（分钟）"
              >
                <InputNumber
                  min={1}
                  max={60}
                  style={{ width: '100%' }}
                  addonAfter="分钟"
                />
              </Form.Item>

              <Form.Item
                name="decision_strategic_interval"
                label="战略评估间隔"
                tooltip="战略层面评估周期（分钟）"
              >
                <InputNumber
                  min={60}
                  max={1440}
                  style={{ width: '100%' }}
                  addonAfter="分钟"
                />
              </Form.Item>
            </TabPane>

            {/* LLM配置 */}
            <TabPane tab="LLM配置" key="llm">
              <Form.Item
                name="llm_model"
                label="LLM模型"
                tooltip="LLM模型名称"
              >
                <Input placeholder="例如: claude-3-5-sonnet-20241022" />
              </Form.Item>

              <Form.Item
                name="llm_temperature"
                label="温度参数"
                tooltip="控制输出随机性，0=确定性，2=高随机性"
              >
                <InputNumber
                  min={0}
                  max={2}
                  step={0.1}
                  style={{ width: '100%' }}
                />
              </Form.Item>

              <Form.Item
                name="llm_max_tokens"
                label="最大Token数"
                tooltip="LLM响应的最大token数"
              >
                <InputNumber
                  min={100}
                  max={8000}
                  style={{ width: '100%' }}
                />
              </Form.Item>

              <Form.Item
                name="llm_timeout"
                label="超时时间"
                tooltip="API调用超时时间（秒）"
              >
                <InputNumber
                  min={5}
                  max={120}
                  style={{ width: '100%' }}
                  addonAfter="秒"
                />
              </Form.Item>
            </TabPane>

            {/* Data配置 */}
            <TabPane tab="数据配置" key="data">
              <Form.Item
                name="data_fetch_interval"
                label="数据获取间隔"
                tooltip="行情数据获取周期（秒）"
              >
                <InputNumber
                  min={1}
                  max={60}
                  style={{ width: '100%' }}
                  addonAfter="秒"
                />
              </Form.Item>

              <Form.Item
                name="data_history_days"
                label="历史数据天数"
                tooltip="初始化时加载的历史数据天数"
              >
                <InputNumber
                  min={1}
                  max={365}
                  style={{ width: '100%' }}
                  addonAfter="天"
                />
              </Form.Item>

              <Form.Item
                name="data_kline_period"
                label="K线周期"
                tooltip="主K线周期，如 15（15分钟）"
              >
                <Input placeholder="例如: 15" />
              </Form.Item>
            </TabPane>

            {/* System配置 */}
            <TabPane tab="系统配置" key="system">
              <Form.Item
                name="system_log_level"
                label="日志级别"
                tooltip="系统日志级别"
              >
                <Select>
                  <Option value="DEBUG">DEBUG</Option>
                  <Option value="INFO">INFO</Option>
                  <Option value="WARNING">WARNING</Option>
                  <Option value="ERROR">ERROR</Option>
                </Select>
              </Form.Item>

              <Form.Item
                name="system_review_time"
                label="复盘时间"
                tooltip="每日复盘时间，格式 HH:MM"
              >
                <Input placeholder="例如: 21:00" />
              </Form.Item>

              <Form.Item
                name="system_timezone"
                label="时区"
                tooltip="系统时区"
              >
                <Input placeholder="例如: Asia/Shanghai" />
              </Form.Item>
            </TabPane>

            {/* Backtest配置 */}
            <TabPane tab="回测配置" key="backtest">
              <Form.Item
                name="backtest_commission_rate"
                label="手续费率"
                tooltip="回测手续费率"
              >
                <InputNumber
                  min={0}
                  max={0.01}
                  step={0.00001}
                  style={{ width: '100%' }}
                />
              </Form.Item>

              <Form.Item
                name="backtest_slippage_ticks"
                label="滑点"
                tooltip="回测滑点（跳数）"
              >
                <InputNumber
                  min={0}
                  max={10}
                  style={{ width: '100%' }}
                  addonAfter="ticks"
                />
              </Form.Item>
            </TabPane>

            {/* API Keys配置 */}
            <TabPane tab="API密钥" key="api_keys">
              <Divider>LLM提供商</Divider>

              <Form.Item
                name="api_provider"
                label="当前提供商"
                tooltip="当前使用的LLM提供商"
              >
                <Select>
                  <Option value="claude">Claude (Anthropic)</Option>
                  <Option value="openai">OpenAI</Option>
                  <Option value="deepseek">DeepSeek</Option>
                  <Option value="custom">Custom</Option>
                </Select>
              </Form.Item>

              <Divider>Claude (Anthropic)</Divider>
              <Form.Item
                name="provider_claude_api_key"
                label="API Key"
                tooltip="Claude API密钥（掩码显示，留空表示不修改）"
              >
                <Password placeholder="sk-ant-..." />
              </Form.Item>

              <Divider>OpenAI</Divider>
              <Form.Item
                name="provider_openai_api_key"
                label="API Key"
                tooltip="OpenAI API密钥（掩码显示，留空表示不修改）"
              >
                <Password placeholder="sk-..." />
              </Form.Item>
              <Form.Item
                name="provider_openai_base_url"
                label="Base URL"
              >
                <Input placeholder="https://api.openai.com/v1" />
              </Form.Item>

              <Divider>DeepSeek</Divider>
              <Form.Item
                name="provider_deepseek_api_key"
                label="API Key"
                tooltip="DeepSeek API密钥（掩码显示，留空表示不修改）"
              >
                <Password placeholder="sk-..." />
              </Form.Item>
              <Form.Item
                name="provider_deepseek_base_url"
                label="Base URL"
              >
                <Input placeholder="https://api.deepseek.com" />
              </Form.Item>

              <Divider>Custom</Divider>
              <Form.Item
                name="provider_custom_api_key"
                label="API Key"
                tooltip="自定义API密钥（掩码显示，留空表示不修改）"
              >
                <Password placeholder="..." />
              </Form.Item>
              <Form.Item
                name="provider_custom_base_url"
                label="Base URL"
              >
                <Input placeholder="https://your-api-endpoint.com/v1" />
              </Form.Item>

              <Divider>TqSDK（天勤）</Divider>
              <Form.Item
                name="tqsdk_username"
                label="用户名"
                tooltip="天勤账户用户名"
              >
                <Input placeholder="天勤账户用户名" />
              </Form.Item>
              <Form.Item
                name="tqsdk_password"
                label="密码"
                tooltip="天勤账户密码（掩码显示，留空表示不修改）"
              >
                <Password placeholder="天勤账户密码" />
              </Form.Item>
              <Form.Item
                name="tqsdk_use_sim"
                label="使用模拟账户"
                tooltip="是否使用模拟账户"
                valuePropName="checked"
              >
                <Select>
                  <Option value={true}>是（模拟）</Option>
                  <Option value={false}>否（实盘）</Option>
                </Select>
              </Form.Item>
            </TabPane>
          </Tabs>
        </Form>
      </Card>
    </div>
  )
}
