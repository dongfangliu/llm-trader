/**
 * 订单流配置面板
 * 可配置VPIN、大单检测、订单簿等参数
 */

import React, { useState, useEffect } from 'react';
import { Card, Form, InputNumber, Button, Space, message, Divider, Tooltip, Select, Alert, Tabs } from 'antd';
import { InfoCircleOutlined, SaveOutlined, ReloadOutlined, ThunderboltOutlined, AppstoreOutlined, SettingOutlined } from '@ant-design/icons';
import PresetCards from './PresetCards';

interface OrderFlowConfig {
  vpin: {
    bucket_size: number;
  };
  large_order: {
    lookback: number;
    threshold_multiplier: number;
  };
  orderbook: {
    max_history: number;
  };
}

interface ConfigPanelProps {
  onConfigChange?: (config: OrderFlowConfig) => void;
}

// 预设配置方案
const PRESET_CONFIGS = {
  default: {
    name: '默认配置',
    description: '平衡的参数设置，适合大多数场景',
    config: {
      bucket_size: 50,
      lookback: 100,
      threshold_multiplier: 2.5,
      max_history: 1000
    }
  },
  scalping: {
    name: '短线交易',
    description: '高敏感度，快速响应市场变化',
    config: {
      bucket_size: 30,
      lookback: 50,
      threshold_multiplier: 2.0,
      max_history: 800
    }
  },
  trend: {
    name: '趋势跟随',
    description: '稳定信号，过滤噪音，关注主力资金',
    config: {
      bucket_size: 80,
      lookback: 150,
      threshold_multiplier: 3.5,
      max_history: 1500
    }
  },
  largeOrder: {
    name: '大单监控',
    description: '专注超大单，严格筛选，减少误报',
    config: {
      bucket_size: 50,
      lookback: 100,
      threshold_multiplier: 4.0,
      max_history: 1000
    }
  },
  highFreq: {
    name: '高频交易',
    description: '极高敏感度，适合高频策略',
    config: {
      bucket_size: 20,
      lookback: 30,
      threshold_multiplier: 1.8,
      max_history: 500
    }
  },
  conservative: {
    name: '保守策略',
    description: '低敏感度，稳定可靠',
    config: {
      bucket_size: 100,
      lookback: 200,
      threshold_multiplier: 5.0,
      max_history: 2000
    }
  }
};

const ConfigPanel: React.FC<ConfigPanelProps> = ({ onConfigChange }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [initialConfig, setInitialConfig] = useState<OrderFlowConfig | null>(null);

  // 加载当前配置
  const loadConfig = async () => {
    try {
      const response = await fetch('/api/v1/order-flow/config');
      const data = await response.json();
      // 兼容 code=0 和 code=200 两种成功响应
      if (data.code === 0 || data.code === 200) {
        const config = data.data;
        setInitialConfig(config);
        form.setFieldsValue({
          bucket_size: config.vpin.bucket_size,
          lookback: config.large_order.lookback,
          threshold_multiplier: config.large_order.threshold_multiplier,
          max_history: config.orderbook.max_history
        });
      }
    } catch (error) {
      console.error('加载配置失败:', error);
      message.error('加载配置失败');
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  // 保存配置
  const handleSave = async () => {
    try {
      setLoading(true);
      const values = await form.validateFields();
      
      const config: OrderFlowConfig = {
        vpin: {
          bucket_size: values.bucket_size
        },
        large_order: {
          lookback: values.lookback,
          threshold_multiplier: values.threshold_multiplier
        },
        orderbook: {
          max_history: values.max_history
        }
      };

      console.log('发送配置:', config);

      const response = await fetch('/api/v1/order-flow/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(config)
      });

      console.log('响应状态:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('响应错误:', errorText);
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      console.log('响应数据:', data);

      // 兼容 code=0 和 code=200 两种成功响应
      if (data.code === 0 || data.code === 200) {
        message.success('配置已保存并生效');
        setInitialConfig(config);
        onConfigChange?.(config);
      } else {
        message.error(`保存失败: ${data.message || '未知错误'}`);
      }
    } catch (error: any) {
      console.error('保存配置失败:', error);
      message.error(`保存配置失败: ${error.message || '网络错误'}`);
    } finally {
      setLoading(false);
    }
  };

  // 重置为默认值
  const handleReset = () => {
    form.setFieldsValue({
      bucket_size: 50,
      lookback: 100,
      threshold_multiplier: 2.5,
      max_history: 1000
    });
  };

  // 恢复初始值
  const handleRestore = () => {
    if (initialConfig) {
      form.setFieldsValue({
        bucket_size: initialConfig.vpin.bucket_size,
        lookback: initialConfig.large_order.lookback,
        threshold_multiplier: initialConfig.large_order.threshold_multiplier,
        max_history: initialConfig.orderbook.max_history
      });
    }
  };

  // 应用预设配置
  const handleApplyPreset = (presetKey: string) => {
    const preset = PRESET_CONFIGS[presetKey as keyof typeof PRESET_CONFIGS];
    if (preset) {
      form.setFieldsValue(preset.config);
      message.info(`已应用"${preset.name}"配置，点击保存生效`);
    }
  };

  // 应用预设配置（从卡片）
  const handleApplyPresetFromCard = (config: any) => {
    form.setFieldsValue(config);
    message.success('已应用预设配置，点击保存生效');
  };

  return (
    <Card 
      title="订单流参数配置" 
      size="small"
      extra={
        <Space>
          <Button 
            icon={<ReloadOutlined />} 
            size="small" 
            onClick={loadConfig}
          >
            刷新
          </Button>
        </Space>
      }
    >
      <Tabs
        defaultActiveKey="presets"
        items={[
          {
            key: 'presets',
            label: (
              <span>
                <AppstoreOutlined />
                预设方案
              </span>
            ),
            children: (
              <div>
                <Alert
                  message="快速选择预设配置"
                  description="点击卡片即可应用对应的配置方案"
                  type="info"
                  showIcon
                  style={{ marginBottom: 16 }}
                  closable
                />
                <PresetCards onSelect={handleApplyPresetFromCard} />
              </div>
            )
          },
          {
            key: 'custom',
            label: (
              <span>
                <SettingOutlined />
                自定义
              </span>
            ),
            children: (
              <Form
                form={form}
                layout="vertical"
                size="small"
              >
                {/* 快速预设选择 */}
                <Form.Item
                  label={
                    <Space>
                      <ThunderboltOutlined />
                      <span>快速配置</span>
                    </Space>
                  }
                >
                  <Select
                    placeholder="选择预设方案后微调"
                    onChange={handleApplyPreset}
                    value={null}
                    allowClear
                  >
                    {Object.entries(PRESET_CONFIGS).map(([key, preset]) => (
                      <Select.Option key={key} value={key}>
                        <div>
                          <strong>{preset.name}</strong>
                          <div style={{ fontSize: 12, color: '#999' }}>{preset.description}</div>
                        </div>
                      </Select.Option>
                    ))}
                  </Select>
                </Form.Item>

        {/* VPIN配置 */}
        <Divider orientation="left" plain style={{ margin: '8px 0' }}>
          VPIN（订单流毒性）
        </Divider>
        
        <Form.Item
          label={
            <Space>
              <span>成交桶大小（手）</span>
              <Tooltip title="每个桶累积多少手成交量后计算一次失衡度。越小越敏感，但噪音越大。">
                <InfoCircleOutlined style={{ color: '#999' }} />
              </Tooltip>
            </Space>
          }
          name="bucket_size"
          rules={[
            { required: true, message: '请输入成交桶大小' },
            { type: 'number', min: 10, max: 500, message: '范围：10-500' }
          ]}
        >
          <InputNumber 
            style={{ width: '100%' }}
            placeholder="默认: 50"
            addonAfter="手"
          />
        </Form.Item>

        {/* 大单检测配置 */}
        <Divider orientation="left" plain style={{ margin: '8px 0' }}>
          大单检测
        </Divider>

        <Form.Item
          label={
            <Space>
              <span>回看窗口（笔）</span>
              <Tooltip title="用最近多少笔成交计算平均成交量。越大越稳定，但反应越慢。">
                <InfoCircleOutlined style={{ color: '#999' }} />
              </Tooltip>
            </Space>
          }
          name="lookback"
          rules={[
            { required: true, message: '请输入回看窗口' },
            { type: 'number', min: 10, max: 500, message: '范围：10-500' }
          ]}
        >
          <InputNumber 
            style={{ width: '100%' }}
            placeholder="默认: 100"
            addonAfter="笔"
          />
        </Form.Item>

        <Form.Item
          label={
            <Space>
              <span>大单阈值倍数</span>
              <Tooltip title="成交量超过平均值的多少倍算大单。越大越严格。">
                <InfoCircleOutlined style={{ color: '#999' }} />
              </Tooltip>
            </Space>
          }
          name="threshold_multiplier"
          rules={[
            { required: true, message: '请输入大单阈值倍数' },
            { type: 'number', min: 1.5, max: 10, message: '范围：1.5-10' }
          ]}
        >
          <InputNumber 
            style={{ width: '100%' }}
            step={0.1}
            precision={1}
            placeholder="默认: 2.5"
            addonAfter="倍"
          />
        </Form.Item>

        {/* 订单簿配置 */}
        <Divider orientation="left" plain style={{ margin: '8px 0' }}>
          订单簿深度
        </Divider>

        <Form.Item
          label={
            <Space>
              <span>历史记录数</span>
              <Tooltip title="保留多少次深度更新用于计算变化率。越多占用内存越大。">
                <InfoCircleOutlined style={{ color: '#999' }} />
              </Tooltip>
            </Space>
          }
          name="max_history"
          rules={[
            { required: true, message: '请输入历史记录数' },
            { type: 'number', min: 100, max: 5000, message: '范围：100-5000' }
          ]}
        >
          <InputNumber 
            style={{ width: '100%' }}
            placeholder="默认: 1000"
            addonAfter="次"
          />
        </Form.Item>

                {/* 操作按钮 */}
                <Form.Item style={{ marginBottom: 0, marginTop: 16 }}>
                  <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                    <Space>
                      <Button 
                        type="primary" 
                        icon={<SaveOutlined />}
                        onClick={handleSave}
                        loading={loading}
                      >
                        保存配置
                      </Button>
                      <Button onClick={handleRestore}>
                        恢复
                      </Button>
                    </Space>
                    <Button onClick={handleReset} type="dashed">
                      重置默认
                    </Button>
                  </Space>
                </Form.Item>
              </Form>
            )
          }
        ]}
      />

      <Divider style={{ margin: '12px 0' }} />

      {/* 统一的保存按钮 */}
      <Space style={{ width: '100%', justifyContent: 'center' }}>
        <Button 
          type="primary" 
          size="large"
          icon={<SaveOutlined />}
          onClick={handleSave}
          loading={loading}
        >
          保存配置
        </Button>
        <Button size="large" onClick={handleRestore}>
          恢复初始
        </Button>
        <Button size="large" onClick={handleReset} type="dashed">
          重置默认
        </Button>
      </Space>

      <div style={{ marginTop: 16, padding: 8, background: '#f5f5f5', borderRadius: 4, fontSize: 12, color: '#666' }}>
        <strong>提示：</strong>
        <ul style={{ margin: '4px 0', paddingLeft: 20 }}>
          <li>配置立即生效，无需重启</li>
          <li>建议在市场清淡时调整参数以观察效果</li>
          <li>参数过于敏感可能产生大量噪音信号</li>
        </ul>
      </div>
    </Card>
  );
};

export default ConfigPanel;
