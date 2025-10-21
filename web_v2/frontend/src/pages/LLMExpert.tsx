/**
 * LLM专家系统页面
 * 展示LLM触发历史、成本统计、分析详情
 */

import React, { useEffect, useState } from 'react';
import { 
  Card, 
  Row, 
  Col, 
  Table, 
  Space, 
  Tag, 
  Statistic,
  Modal,
  Descriptions,
  Progress
} from 'antd';
import { 
  RobotOutlined, 
  DollarOutlined, 
  ThunderboltOutlined
} from '@ant-design/icons';
import { 
  getTriggerHistory, 
  getCostStats, 
  getTriggerAnalysis 
} from '../api/llm';

interface TriggerHistoryItem {
  id: number;
  timestamp: string;
  trigger_type: string;
  context: string;
  result: string;
  action: string;
  tokens_used: number;
  cost_usd: number;
  response_time_ms: number;
}

interface CostStats {
  today_calls: number;
  today_cost: number;
  month_calls: number;
  month_cost: number;
  avg_tokens_per_call: number;
  avg_cost_per_call: number;
}

interface TriggerAnalysis {
  total_triggers: number;
  by_type: {
    expert_review: number;
    abnormal_analysis: number;
    signal_conflict: number;
    manual_request: number;
  };
  success_rate: number;
  avg_response_time: number;
}

const LLMExpert: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [triggerHistory, setTriggerHistory] = useState<TriggerHistoryItem[]>([]);
  const [costStats, setCostStats] = useState<CostStats | null>(null);
  const [triggerAnalysis, setTriggerAnalysis] = useState<TriggerAnalysis | null>(null);
  const [selectedTrigger, setSelectedTrigger] = useState<TriggerHistoryItem | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [historyRes, costRes, analysisRes] = await Promise.all([
        getTriggerHistory(20),
        getCostStats(),
        getTriggerAnalysis()
      ]);

      setTriggerHistory(historyRes.items || historyRes || []);
      setCostStats(costRes as any);
      setTriggerAnalysis(analysisRes as any);
    } catch (error) {
      console.error('Failed to fetch LLM expert data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000); // 每15秒更新
    return () => clearInterval(interval);
  }, []);

  const getTriggerTypeColor = (type: string) => {
    switch (type) {
      case 'expert_review': return 'processing';
      case 'abnormal_analysis': return 'warning';
      case 'signal_conflict': return 'error';
      case 'manual_request': return 'success';
      default: return 'default';
    }
  };

  const getTriggerTypeName = (type: string) => {
    switch (type) {
      case 'expert_review': return '专家复核';
      case 'abnormal_analysis': return '异常分析';
      case 'signal_conflict': return '信号冲突';
      case 'manual_request': return '手动请求';
      default: return type;
    }
  };

  const getActionColor = (action: string) => {
    if (action.includes('approve') || action.includes('确认')) return 'success';
    if (action.includes('reject') || action.includes('拒绝')) return 'error';
    if (action.includes('adjust') || action.includes('调整')) return 'warning';
    return 'default';
  };

  const showTriggerDetail = (trigger: TriggerHistoryItem) => {
    setSelectedTrigger(trigger);
    setModalVisible(true);
  };

  const triggerColumns = [
    {
      title: '时间',
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 180,
      render: (time: string) => <span style={{ fontFamily: 'monospace' }}>{time}</span>
    },
    {
      title: '触发类型',
      dataIndex: 'trigger_type',
      key: 'trigger_type',
      width: 120,
      render: (type: string) => (
        <Tag color={getTriggerTypeColor(type)}>
          {getTriggerTypeName(type)}
        </Tag>
      )
    },
    {
      title: 'LLM决策',
      dataIndex: 'action',
      key: 'action',
      width: 150,
      render: (action: string) => (
        <Tag color={getActionColor(action)}>
          {action}
        </Tag>
      )
    },
    {
      title: 'Token',
      dataIndex: 'tokens_used',
      key: 'tokens_used',
      width: 100,
      render: (tokens: number) => tokens.toLocaleString()
    },
    {
      title: '成本',
      dataIndex: 'cost_usd',
      key: 'cost_usd',
      width: 100,
      render: (cost: number) => `$${cost.toFixed(4)}`
    },
    {
      title: '响应时间',
      dataIndex: 'response_time_ms',
      key: 'response_time_ms',
      width: 100,
      render: (time: number) => `${time}ms`
    },
    {
      title: '操作',
      key: 'action_btn',
      width: 80,
      render: (_: any, record: TriggerHistoryItem) => (
        <a onClick={() => showTriggerDetail(record)}>详情</a>
      )
    }
  ];

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      {/* 成本统计 */}
      <Card 
        title="LLM成本统计" 
        loading={loading}
        extra={<Tag color="blue">实时监控</Tag>}
      >
        {costStats && (
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12} md={6}>
              <Card bordered={false} style={{ background: '#f5f5f5' }}>
                <Statistic
                  title="今日调用"
                  value={costStats.today_calls}
                  suffix="次"
                  prefix={<RobotOutlined />}
                  valueStyle={{ color: '#1890ff' }}
                />
              </Card>
            </Col>

            <Col xs={24} sm={12} md={6}>
              <Card bordered={false} style={{ background: '#f5f5f5' }}>
                <Statistic
                  title="今日成本"
                  value={costStats.today_cost}
                  precision={4}
                  prefix="$"
                  valueStyle={{ color: '#52c41a' }}
                />
              </Card>
            </Col>

            <Col xs={24} sm={12} md={6}>
              <Card bordered={false} style={{ background: '#f5f5f5' }}>
                <Statistic
                  title="本月调用"
                  value={costStats.month_calls}
                  suffix="次"
                  prefix={<ThunderboltOutlined />}
                  valueStyle={{ color: '#722ed1' }}
                />
              </Card>
            </Col>

            <Col xs={24} sm={12} md={6}>
              <Card bordered={false} style={{ background: '#f5f5f5' }}>
                <Statistic
                  title="本月成本"
                  value={costStats.month_cost}
                  precision={2}
                  prefix={<DollarOutlined />}
                  suffix=" USD"
                  valueStyle={{ 
                    color: costStats.month_cost > 5 ? '#ff4d4f' : '#52c41a'
                  }}
                />
              </Card>
            </Col>

            <Col span={24}>
              <Card size="small" style={{ background: '#e6f7ff' }}>
                <Space size="large">
                  <div>
                    <span style={{ color: '#595959' }}>平均每次Token: </span>
                    <strong>{costStats.avg_tokens_per_call.toFixed(0)}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#595959' }}>平均每次成本: </span>
                    <strong>${costStats.avg_cost_per_call.toFixed(4)}</strong>
                  </div>
                  <div>
                    {costStats.month_cost <= 5 ? (
                      <Tag color="success">✅ 成本可控 (&lt;$5/月)</Tag>
                    ) : (
                      <Tag color="warning">⚠️ 成本偏高 (&gt;$5/月)</Tag>
                    )}
                  </div>
                </Space>
              </Card>
            </Col>
          </Row>
        )}
      </Card>

      {/* 触发统计 */}
      <Card title="触发类型分析" loading={loading}>
        {triggerAnalysis && (
          <Row gutter={16}>
            <Col xs={24} md={8}>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Statistic
                  title="总触发次数"
                  value={triggerAnalysis.total_triggers}
                  suffix="次"
                />
                <Statistic
                  title="成功率"
                  value={triggerAnalysis.success_rate}
                  precision={1}
                  suffix="%"
                  valueStyle={{ 
                    color: triggerAnalysis.success_rate >= 90 ? '#52c41a' : '#faad14'
                  }}
                />
                <Statistic
                  title="平均响应时间"
                  value={triggerAnalysis.avg_response_time}
                  suffix="ms"
                  precision={0}
                />
              </Space>
            </Col>

            <Col xs={24} md={16}>
              <div style={{ padding: '16px' }}>
                <Space direction="vertical" style={{ width: '100%' }} size="middle">
                  <div>
                    <div style={{ marginBottom: '8px' }}>
                      <Space>
                        <Tag color="processing">专家复核</Tag>
                        <span>{triggerAnalysis.by_type.expert_review} 次</span>
                      </Space>
                    </div>
                    <Progress 
                      percent={(triggerAnalysis.by_type.expert_review / triggerAnalysis.total_triggers) * 100} 
                      strokeColor="#1890ff"
                      showInfo={false}
                    />
                  </div>

                  <div>
                    <div style={{ marginBottom: '8px' }}>
                      <Space>
                        <Tag color="warning">异常分析</Tag>
                        <span>{triggerAnalysis.by_type.abnormal_analysis} 次</span>
                      </Space>
                    </div>
                    <Progress 
                      percent={(triggerAnalysis.by_type.abnormal_analysis / triggerAnalysis.total_triggers) * 100} 
                      strokeColor="#faad14"
                      showInfo={false}
                    />
                  </div>

                  <div>
                    <div style={{ marginBottom: '8px' }}>
                      <Space>
                        <Tag color="error">信号冲突</Tag>
                        <span>{triggerAnalysis.by_type.signal_conflict} 次</span>
                      </Space>
                    </div>
                    <Progress 
                      percent={(triggerAnalysis.by_type.signal_conflict / triggerAnalysis.total_triggers) * 100} 
                      strokeColor="#ff4d4f"
                      showInfo={false}
                    />
                  </div>

                  <div>
                    <div style={{ marginBottom: '8px' }}>
                      <Space>
                        <Tag color="success">手动请求</Tag>
                        <span>{triggerAnalysis.by_type.manual_request} 次</span>
                      </Space>
                    </div>
                    <Progress 
                      percent={(triggerAnalysis.by_type.manual_request / triggerAnalysis.total_triggers) * 100} 
                      strokeColor="#52c41a"
                      showInfo={false}
                    />
                  </div>
                </Space>
              </div>
            </Col>
          </Row>
        )}
      </Card>

      {/* 触发历史 */}
      <Card title="LLM触发历史" loading={loading}>
        <Table
          columns={triggerColumns}
          dataSource={triggerHistory}
          rowKey="id"
          pagination={{ pageSize: 10 }}
          scroll={{ x: 1000 }}
        />
      </Card>

      {/* 详情Modal */}
      <Modal
        title="LLM决策详情"
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
        width={800}
      >
        {selectedTrigger && (
          <Space direction="vertical" style={{ width: '100%' }} size="large">
            <Descriptions bordered column={2}>
              <Descriptions.Item label="触发时间" span={2}>
                {selectedTrigger.timestamp}
              </Descriptions.Item>
              <Descriptions.Item label="触发类型">
                <Tag color={getTriggerTypeColor(selectedTrigger.trigger_type)}>
                  {getTriggerTypeName(selectedTrigger.trigger_type)}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="LLM决策">
                <Tag color={getActionColor(selectedTrigger.action)}>
                  {selectedTrigger.action}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Token消耗">
                {selectedTrigger.tokens_used.toLocaleString()}
              </Descriptions.Item>
              <Descriptions.Item label="成本">
                ${selectedTrigger.cost_usd.toFixed(4)}
              </Descriptions.Item>
              <Descriptions.Item label="响应时间" span={2}>
                {selectedTrigger.response_time_ms}ms
              </Descriptions.Item>
            </Descriptions>

            <Card title="上下文" size="small">
              <pre style={{ 
                whiteSpace: 'pre-wrap', 
                wordWrap: 'break-word',
                background: '#f5f5f5',
                padding: '12px',
                borderRadius: '4px',
                fontSize: '12px'
              }}>
                {selectedTrigger.context}
              </pre>
            </Card>

            <Card title="LLM分析结果" size="small">
              <pre style={{ 
                whiteSpace: 'pre-wrap', 
                wordWrap: 'break-word',
                background: '#f5f5f5',
                padding: '12px',
                borderRadius: '4px',
                fontSize: '12px'
              }}>
                {selectedTrigger.result}
              </pre>
            </Card>
          </Space>
        )}
      </Modal>
    </Space>
  );
};

export default LLMExpert;
