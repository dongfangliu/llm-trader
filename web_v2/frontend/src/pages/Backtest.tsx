/**
 * 回测页面
 * 运行回测、查看结果、参数优化
 */

import React, { useEffect, useState } from 'react';
import { 
  Card, 
  Row, 
  Col, 
  Form, 
  Select, 
  Button, 
  Table, 
  Space, 
  Tag,
  Descriptions,
  DatePicker,
  InputNumber,
  message
} from 'antd';
import { 
  PlayCircleOutlined, 
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  TrophyOutlined
} from '@ant-design/icons';
import { runBacktest, getBacktestTasks, getBacktestResult, getStrategyTemplates, runOptimization, getTaskDetail } from '../api/backtest';

const { Option } = Select;
const { RangePicker } = DatePicker;

interface BacktestTask {
  task_id: string;
  name: string;
  strategy: string;
  start_date: string;
  end_date: string;
  optimization_mode: string;
  status: string;
  progress: number;
  created_at: string;
  completed_at: string | null;
}

interface BacktestResult {
  total_trades: number;
  win_rate: number;
  profit_loss_ratio: number;
  total_pnl: number;
  sharpe_ratio: number;
  max_drawdown: number;
  parameters: any;
}

const Backtest: React.FC = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [tasks, setTasks] = useState<BacktestTask[]>([]);
  const [selectedResult, setSelectedResult] = useState<BacktestResult | null>(null);
  const [resultLoading, setResultLoading] = useState(false);
  // Optimization state
  const [optLoading, setOptLoading] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<any | null>(null);
  const [optTaskId, setOptTaskId] = useState<string | null>(null);
  const [optStatus, setOptStatus] = useState<string | null>(null);
  const [optResult, setOptResult] = useState<any | null>(null);
  const [optForm] = Form.useForm();

  const fetchTasks = async () => {
    try {
      const response = await getBacktestTasks(undefined, 20);
      setTasks(response.tasks || []);
    } catch (error) {
      console.error('Failed to fetch backtest tasks:', error);
    }
  };

  useEffect(() => {
    fetchTasks();
    const interval = setInterval(fetchTasks, 10000);
    return () => clearInterval(interval);
  }, []);

  // Load strategy templates for optimization
  useEffect(() => {
    (async () => {
      try {
        const res = await getStrategyTemplates();
        setTemplates(res.templates || []);
      } catch (e) {
        // ignore
      }
    })();
  }, []);

  const handleRunBacktest = async (values: any) => {
    try {
      setLoading(true);
      const params = {
        name: `${values.strategy}_${Date.now()}`,
        strategy: values.strategy,
        start_date: values.dateRange[0].format('YYYY-MM-DD'),
        end_date: values.dateRange[1].format('YYYY-MM-DD'),
        initial_capital: values.initial_capital,
        parameters: {}
      };

      await runBacktest(params);
      message.success('回测任务已提交');
      form.resetFields();
      fetchTasks();
    } catch (error) {
      message.error('回测任务提交失败');
      console.error('Failed to run backtest:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleViewResult = async (taskId: string) => {
    try {
      setResultLoading(true);
      const response = await getBacktestResult(taskId);
      setSelectedResult(response?.result || null);
      if (!response?.result) message.warning('该任务暂无结果或未完成');
    } catch (error) {
      message.error('加载回测结果失败');
      console.error('Failed to load backtest result:', error);
    } finally {
      setResultLoading(false);
    }
  };

  // ===== Optimization helpers =====
  const handleTemplateChange = (strategy: string) => {
    const tpl = templates.find(t => t.strategy === strategy);
    setSelectedTemplate(tpl || null);
    if (tpl) {
      const ranges = tpl.parameter_ranges || {};
      const defaultRanges: Record<string, any[]> = {};
      Object.keys(ranges).forEach(k => defaultRanges[k] = ranges[k]);
      optForm.setFieldsValue({ parameter_ranges: defaultRanges });
    }
  };

  const pollOptimization = (taskId: string) => {
    const timer = setInterval(async () => {
      try {
        const resp = await getTaskDetail(taskId);
        const info = resp.task_info;
        setOptStatus(info?.status || null);
        if (info?.status === 'completed') {
          setOptResult(resp.result || null);
          clearInterval(timer);
          setOptLoading(false);
          message.success('优化完成');
        } else if (info?.status === 'failed') {
          clearInterval(timer);
          setOptLoading(false);
          message.error('优化失败');
        }
      } catch {}
    }, 3000);
  };

  const handleRunOptimization = async (values: any) => {
    try {
      setOptLoading(true);
      setOptResult(null);
      const req = {
        name: `${values.strategy}_opt_${Date.now()}`,
        strategy: values.strategy,
        start_date: values.optDateRange[0].format('YYYY-MM-DD'),
        end_date: values.optDateRange[1].format('YYYY-MM-DD'),
        optimization_mode: 'grid_search',
        parameter_ranges: values.parameter_ranges || {},
        target_metric: values.target_metric || 'sharpe_ratio'
      };
      const res = await runOptimization(req);
      const taskId = res.task_id;
      setOptTaskId(taskId);
      setOptStatus('pending');
      message.success('优化任务已提交');
      pollOptimization(taskId);
    } catch (e) {
      setOptLoading(false);
      message.error('提交优化任务失败');
    }
  };

  const handleApplyBestBacktest = async () => {
    if (!optResult || !selectedTemplate) return;
    const vals = optForm.getFieldsValue();
    try {
      await runBacktest({
        name: `${selectedTemplate.strategy}_best_${Date.now()}`,
        strategy: selectedTemplate.strategy,
        start_date: vals.optDateRange[0].format('YYYY-MM-DD'),
        end_date: vals.optDateRange[1].format('YYYY-MM-DD'),
        initial_capital: vals.initial_capital || 50000,
        parameters: optResult.best_params || {}
      });
      message.success('已用最佳参数创建回测任务');
    } catch {
      message.error('创建回测任务失败');
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
      case 'running':
        return <ClockCircleOutlined style={{ color: '#1890ff' }} />;
      case 'failed':
        return <CloseCircleOutlined style={{ color: '#ff4d4f' }} />;
      default:
        return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'success';
      case 'running': return 'processing';
      case 'failed': return 'error';
      default: return 'default';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'completed': return '完成';
      case 'running': return '运行中';
      case 'failed': return '失败';
      default: return status;
    }
  };

  const taskColumns = [
    {
      title: '任务ID',
      dataIndex: 'task_id',
      key: 'task_id',
      width: 180
    },
    {
      title: '策略',
      dataIndex: 'strategy',
      key: 'strategy',
      width: 150
    },
    {
      title: '回测区间',
      key: 'date_range',
      width: 250,
      render: (_: any, record: BacktestTask) => (
        <span>{record.start_date} ~ {record.end_date}</span>
      )
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: string) => (
        <Space>
          {getStatusIcon(status)}
          <Tag color={getStatusColor(status)}>
            {getStatusText(status)}
          </Tag>
        </Space>
      )
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_: any, record: BacktestTask) => (
        record.status === 'completed' ? (
          <Button 
            type="link" 
            size="small"
            onClick={() => handleViewResult(record.id)}
          >
            查看结果
          </Button>
        ) : null
      )
    }
  ];

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      {/* 新建回测 */}
      <Card title="新建回测任务">
        <Form
          form={form}
          layout="vertical"
          onFinish={handleRunBacktest}
          initialValues={{
            strategy: 'trend_following',
            initial_capital: 50000
          }}
        >
          <Row gutter={16}>
            <Col xs={24} md={8}>
              <Form.Item
                label="策略"
                name="strategy"
                rules={[{ required: true, message: '请选择策略' }]}
              >
                <Select>
                  <Option value="trend_following">趋势跟踪</Option>
                  <Option value="mean_reversion">均值回归</Option>
                  <Option value="breakout">突破策略</Option>
                </Select>
              </Form.Item>
            </Col>

            <Col xs={24} md={8}>
              <Form.Item
                label="回测区间"
                name="dateRange"
                rules={[{ required: true, message: '请选择回测区间' }]}
              >
                <RangePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>

            <Col xs={24} md={8}>
              <Form.Item
                label="初始资金"
                name="initial_capital"
                rules={[{ required: true, message: '请输入初始资金' }]}
              >
                <InputNumber
                  style={{ width: '100%' }}
                  min={10000}
                  max={10000000}
                  step={10000}
                  formatter={value => `¥ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item>
            <Button 
              type="primary" 
              htmlType="submit" 
              loading={loading}
              icon={<PlayCircleOutlined />}
            >
              运行回测
            </Button>
          </Form.Item>
        </Form>
      </Card>

      {/* 回测结果 */}
      {selectedResult && (
        <Card 
          title="回测结果" 
          loading={resultLoading}
          extra={<Tag color="success" icon={<TrophyOutlined />}>已完成</Tag>}
        >
          <Row gutter={[16, 16]}>
            <Col span={24}>
              <Descriptions bordered column={3}>
                <Descriptions.Item label="总交易次数">
                  {selectedResult.total_trades} 次
                </Descriptions.Item>
                <Descriptions.Item label="胜率">
                  <span style={{ 
                    color: selectedResult.win_rate >= 60 ? '#52c41a' : '#faad14',
                    fontWeight: 'bold'
                  }}>
                    {selectedResult.win_rate.toFixed(2)}%
                  </span>
                </Descriptions.Item>
                <Descriptions.Item label="盈亏比">
                  <span style={{ 
                    color: selectedResult.profit_loss_ratio >= 2 ? '#52c41a' : '#faad14',
                    fontWeight: 'bold'
                  }}>
                    {selectedResult.profit_loss_ratio.toFixed(2)}
                  </span>
                </Descriptions.Item>
                <Descriptions.Item label="总盈亏">
                  <span style={{ 
                    color: selectedResult.total_pnl >= 0 ? '#52c41a' : '#ff4d4f',
                    fontWeight: 'bold',
                    fontSize: '16px'
                  }}>
                    {selectedResult.total_pnl >= 0 ? '+' : ''}¥{selectedResult.total_pnl.toFixed(2)}
                  </span>
                </Descriptions.Item>
                <Descriptions.Item label="夏普比率">
                  <span style={{ 
                    color: selectedResult.sharpe_ratio >= 1.5 ? '#52c41a' : 
                           selectedResult.sharpe_ratio >= 1 ? '#faad14' : '#ff4d4f',
                    fontWeight: 'bold'
                  }}>
                    {selectedResult.sharpe_ratio.toFixed(2)}
                  </span>
                </Descriptions.Item>
                <Descriptions.Item label="最大回撤">
                  <span style={{ 
                    color: Math.abs(selectedResult.max_drawdown) <= 5 ? '#52c41a' : 
                           Math.abs(selectedResult.max_drawdown) <= 10 ? '#faad14' : '#ff4d4f',
                    fontWeight: 'bold'
                  }}>
                    {selectedResult.max_drawdown.toFixed(2)}%
                  </span>
                </Descriptions.Item>
              </Descriptions>
            </Col>

            <Col span={24}>
              <Card size="small" title="策略参数">
                <pre style={{
                  background: '#f5f5f5',
                  padding: '12px',
                  borderRadius: '4px',
                  fontSize: '12px',
                  overflow: 'auto'
                }}>
                  {JSON.stringify(selectedResult.parameters, null, 2)}
                </pre>
              </Card>
            </Col>
          </Row>
        </Card>
      )}

      {/* 参数自优化 */}
      <Card title="参数自优化（一键）">
        <Form
          form={optForm}
          layout="vertical"
          onFinish={handleRunOptimization}
          initialValues={{ target_metric: 'sharpe_ratio', initial_capital: 50000 }}
        >
          <Row gutter={16}>
            <Col xs={24} md={8}>
              <Form.Item
                label="策略模板"
                name="strategy"
                rules={[{ required: true, message: '请选择策略模板' }]}
              >
                <Select onChange={handleTemplateChange} placeholder="选择策略">
                  {templates.map(t => (
                    <Option key={t.strategy} value={t.strategy}>{t.name || t.strategy}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item
                label="优化区间"
                name="optDateRange"
                rules={[{ required: true, message: '请选择优化区间' }]}
              >
                <RangePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item label="初始资金" name="initial_capital" rules={[{ required: true }]}> 
                <InputNumber style={{ width: '100%' }} min={10000} step={10000} formatter={v => `¥ ${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} />
              </Form.Item>
            </Col>
          </Row>

          {selectedTemplate && (
            <Row gutter={16}>
              {Object.keys(selectedTemplate.parameter_ranges || {}).map((key: string) => (
                <Col xs={24} md={8} key={key}>
                  <Form.Item label={`参数：${key}`} name={['parameter_ranges', key]}>
                    <Select mode="multiple" placeholder="选择取值" allowClear>
                      {(selectedTemplate.parameter_ranges[key] || []).map((v: any) => (
                        <Option key={String(v)} value={v}>{String(v)}</Option>
                      ))}
                    </Select>
                  </Form.Item>
                </Col>
              ))}
              <Col xs={24} md={8}>
                <Form.Item label="优化目标" name="target_metric">
                  <Select>
                    <Option value="sharpe_ratio">夏普比率</Option>
                    <Option value="total_return">总收益率</Option>
                    <Option value="max_drawdown">最小回撤</Option>
                  </Select>
                </Form.Item>
              </Col>
            </Row>
          )}

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={optLoading} icon={<PlayCircleOutlined />}>开始自优化</Button>
              {optTaskId && (
                <Tag color={optStatus === 'completed' ? 'success' : optStatus === 'failed' ? 'error' : 'processing'}>
                  状态：{optStatus}
                </Tag>
              )}
            </Space>
          </Form.Item>
        </Form>

        {optResult && (
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Card size="small" title="最佳参数">
                <pre style={{ background: '#f5f5f5', padding: 12, borderRadius: 4 }}>
                  {JSON.stringify(optResult.best_params || {}, null, 2)}
                </pre>
                <Button type="primary" onClick={handleApplyBestBacktest} icon={<PlayCircleOutlined />}>用最佳参数回测</Button>
              </Card>
            </Col>
            <Col xs={24} md={12}>
              <Card size="small" title="性能指标（样本外）">
                <Descriptions bordered size="small" column={2}>
                  <Descriptions.Item label="夏普比率">{optResult.performance?.sharpe_ratio}</Descriptions.Item>
                  <Descriptions.Item label="总收益率">{(optResult.performance?.total_return ?? 0) * 100}%</Descriptions.Item>
                  <Descriptions.Item label="最大回撤">{(optResult.performance?.max_drawdown ?? 0) * 100}%</Descriptions.Item>
                  <Descriptions.Item label="胜率">{(optResult.performance?.win_rate ?? 0) * 100}%</Descriptions.Item>
                </Descriptions>
              </Card>
            </Col>
          </Row>
        )}
      </Card>

      {/* 任务列表 */}
      <Card title="回测任务列表">
        <Table
          columns={taskColumns}
          dataSource={tasks}
          rowKey="id"
          pagination={{ pageSize: 10 }}
          scroll={{ x: 1000 }}
        />
      </Card>
    </Space>
  );
};

export default Backtest;
