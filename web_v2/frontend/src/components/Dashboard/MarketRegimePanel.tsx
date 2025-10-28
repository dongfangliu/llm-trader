/**
 * 市场状态面板
 * 展示当前市场regime和特征
 * ✅ V2重构：配置面板 + 重算按钮 + WebSocket实时推送
 */

import React, { useEffect, useState } from 'react';
import { Card, Tag, Progress, Space, Statistic, Row, Col, Button, Modal, Form, InputNumber, message, Tooltip } from 'antd';
import {
  ArrowUpOutlined,
  ArrowDownOutlined,
  LineChartOutlined,
  ThunderboltOutlined,
  ReloadOutlined,
  SettingOutlined
} from '@ant-design/icons';
import { 
  getCurrentRegime, 
  recalculateRegime, 
  getRegimeConfig, 
  updateRegimeConfig,
  type MarketRegime, 
  type RegimeConfig 
} from '../../api/marketRegime';
import { safeToFixed, safeNumber } from '../../utils/format';

const MarketRegimePanel: React.FC = () => {
  const [regime, setRegime] = useState<MarketRegime | null>(null);
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);
  const [configModalVisible, setConfigModalVisible] = useState(false);
  const [config, setConfig] = useState<RegimeConfig | null>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    loadRegime();
    loadConfig();
    // WebSocket推送会自动更新，不需要轮询
    // 可选：保留一个较长的轮询间隔作为fallback
    const interval = setInterval(loadRegime, 60000); // 每60秒检查一次
    return () => clearInterval(interval);
  }, []);

  const loadRegime = async () => {
    try {
      const data = await getCurrentRegime();
      setRegime(data);
    } catch (error) {
      console.error('Failed to load market regime:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadConfig = async () => {
    try {
      const data = await getRegimeConfig();
      setConfig(data);
      form.setFieldsValue(data);
    } catch (error) {
      console.error('Failed to load config:', error);
    }
  };

  const handleRecalculate = async (force: boolean = false) => {
    setRecalculating(true);
    try {
      const data = await recalculateRegime(force);
      setRegime(data);
      message.success('市场态势已刷新');
    } catch (error: any) {
      message.error(error.message || '刷新失败');
    } finally {
      setRecalculating(false);
    }
  };

  const handleConfigSubmit = async (values: any) => {
    try {
      const newConfig = await updateRegimeConfig(values);
      setConfig(newConfig);
      setConfigModalVisible(false);
      message.success('配置已更新');
    } catch (error: any) {
      message.error(error.message || '更新配置失败');
    }
  };

  const getRegimeInfo = (regimeType: string) => {
    const info = {
      trend: {
        color: 'green',
        icon: <ArrowUpOutlined />,
        text: '趋势市',
        description: '强趋势，适合趋势跟踪策略'
      },
      ranging: {
        color: 'blue',
        icon: <LineChartOutlined />,
        text: '震荡市',
        description: '横盘整理，适合均值回归策略'
      },
      breakout: {
        color: 'orange',
        icon: <ThunderboltOutlined />,
        text: '突破市',
        description: '价格突破关键位，适合突破策略'
      },
      abnormal: {
        color: 'red',
        icon: <ArrowDownOutlined />,
        text: '异常市',
        description: '波动异常，建议谨慎或观望'
      },
      unknown: {
        color: 'gray',
        icon: <LineChartOutlined />,
        text: '未知',
        description: '数据不足，正在计算中...'
      }
    };
    return info[regimeType as keyof typeof info] || info.unknown;
  };

  if (!regime) {
    return <Card loading={loading}>加载中...</Card>;
  }

  const regimeInfo = getRegimeInfo(regime.regime);
  const confidencePercent = Math.round(regime.confidence * 100);

  return (
    <Card 
      title="当前市场状态" 
      loading={loading}
      extra={
        <Space>
          <Tag color={regimeInfo.color}>{regimeInfo.text}</Tag>
          <Tooltip title="立即重新计算">
            <Button 
              icon={<ReloadOutlined />} 
              size="small"
              loading={recalculating}
              onClick={() => handleRecalculate(false)}
            />
          </Tooltip>
          <Tooltip title="强制重新计算（忽略冷却期）">
            <Button 
              icon={<ReloadOutlined />} 
              size="small"
              type="primary"
              loading={recalculating}
              onClick={() => handleRecalculate(true)}
            />
          </Tooltip>
          <Tooltip title="配置参数">
            <Button 
              icon={<SettingOutlined />} 
              size="small"
              onClick={() => setConfigModalVisible(true)}
            />
          </Tooltip>
        </Space>
      }
    >
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        {/* 主状态显示 */}
        <div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' }}>
            {regimeInfo.icon} {regimeInfo.text}
          </div>
          <div style={{ color: '#666', marginBottom: '16px' }}>
            {regimeInfo.description}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>置信度:</span>
            <Progress 
              percent={confidencePercent} 
              strokeColor={regimeInfo.color}
              style={{ flex: 1 }}
            />
            <span style={{ fontWeight: 'bold' }}>{confidencePercent}%</span>
          </div>
          {regime.trigger_reason && (
            <div style={{ marginTop: '8px', color: '#999', fontSize: '12px' }}>
              触发原因: {regime.trigger_reason}
            </div>
          )}
        </div>

        {/* 市场特征 */}
        <Row gutter={16}>
          <Col span={8}>
            <Statistic
              title="ADX (趋势强度)"
              value={safeToFixed(regime.features?.adx, 1)}
              suffix={safeNumber(regime.features?.adx, 0) > 25 ? '强' : '弱'}
            />
          </Col>
          <Col span={8}>
            <Statistic
              title="ATR (波动率)"
              value={safeToFixed(regime.features?.atr, 1)}
            />
          </Col>
          <Col span={8}>
            <Statistic
              title="趋势一致性"
              value={safeToFixed(safeNumber(regime.features?.trend_alignment, 0) * 100, 0)}
              suffix="%"
            />
          </Col>
        </Row>

        {/* 激活策略 */}
        <div>
          <div style={{ color: '#666', marginBottom: '4px' }}>激活策略:</div>
          <Tag color="blue" style={{ fontSize: '14px', padding: '4px 12px' }}>
            {regime.active_strategy === 'trend_following' && '趋势跟踪'}
            {regime.active_strategy === 'mean_reversion' && '均值回归'}
            {regime.active_strategy === 'breakout' && '突破策略'}
            {regime.active_strategy === 'conservative' && '保守策略'}
            {regime.active_strategy === 'none' && '无策略'}
            {regime.active_strategy === 'unknown' && '未知'}
          </Tag>
          <span style={{ color: '#999', marginLeft: '8px' }}>
            持续 {regime.duration_minutes} 分钟
          </span>
        </div>
      </Space>

      {/* 配置模态框 */}
      <Modal
        title="市场态势计算配置"
        open={configModalVisible}
        onCancel={() => setConfigModalVisible(false)}
        onOk={() => form.submit()}
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleConfigSubmit}
        >
          <Form.Item
            label="定时触发间隔（秒）"
            name="periodic_interval"
            tooltip="定时自动计算市场状态的间隔"
          >
            <InputNumber min={60} max={3600} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item label="事件触发阈值">
            <Form.Item
              label="价格变动阈值"
              name={['triggers', 'price_change_threshold']}
              tooltip="价格变动超过此比例时触发重算（例如：0.005 = 0.5%）"
            >
              <InputNumber min={0.001} max={0.1} step={0.001} style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item
              label="成交量突增阈值"
              name={['triggers', 'volume_spike_threshold']}
              tooltip="成交量超过平均值的倍数（例如：2.0 = 2倍）"
            >
              <InputNumber min={1.0} max={10.0} step={0.1} style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item
              label="ADX变化阈值"
              name={['triggers', 'adx_change_threshold']}
              tooltip="ADX变化超过此值时触发重算"
            >
              <InputNumber min={1} max={20} step={1} style={{ width: '100%' }} />
            </Form.Item>
          </Form.Item>

          <Form.Item
            label="状态切换冷却期（秒）"
            name="regime_switch_cooldown"
            tooltip="防止频繁切换状态，在此时间内不会再次切换"
          >
            <InputNumber min={60} max={600} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default MarketRegimePanel;
