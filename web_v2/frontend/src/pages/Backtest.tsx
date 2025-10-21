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
import { runBacktest, getBacktestTasks, getBacktestResult } from '../api/backtest';

const { Option } = Select;
const { RangePicker } = DatePicker;

interface BacktestTask {
  id: number;
  strategy: string;
  start_date: string;
  end_date: string;
  status: string;
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

  const handleViewResult = async (taskId: number) => {
    try {
      setResultLoading(true);
      const response = await getBacktestResult(taskId.toString());
      setSelectedResult(response);
    } catch (error) {
      message.error('加载回测结果失败');
      console.error('Failed to load backtest result:', error);
    } finally {
      setResultLoading(false);
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
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 80
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
