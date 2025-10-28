/**
 * 系统综合调试页面
 * 提供完整的系统测试和调试功能
 */
import React, { useState, useEffect } from 'react';
import {
  Card,
  Tabs,
  Button,
  Space,
  Tag,
  Statistic,
  Row,
  Col,
  Table,
  message,
  Alert,
  Descriptions,
  Badge,
  Progress,
} from 'antd';
import {
  ReloadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  SyncOutlined,
  DatabaseOutlined,
  ApiOutlined,
  LineChartOutlined,
  DollarOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import * as echarts from 'echarts';
import { getKline } from '../api/trading';
import {
  getRealtimeQuote,
  getRealtimeKline,
  getRealtimeStatus,
  getSystemLogs,
} from '../api/debug';

const { TabPane } = Tabs;

interface TestResult {
  name: string;
  status: 'success' | 'error' | 'warning' | 'pending';
  message: string;
  details?: any;
  timestamp?: string;
}

const SystemDebug: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [activeTab, setActiveTab] = useState('overview');

  // 实时数据状态
  const [realtimeStatus, setRealtimeStatus] = useState<any>(null);
  const [realtimeQuote, setRealtimeQuote] = useState<any>(null);
  const [realtimeKline, setRealtimeKline] = useState<any[]>([]);
  const [logs, setLogs] = useState<string[]>([]);

  // 加载实时数据
  const loadRealtimeData = async () => {
    try {
      const [status, quote, kline] = await Promise.all([
        getRealtimeStatus(),
        getRealtimeQuote(),
        getRealtimeKline({ period: '1m', limit: 10 }),
      ]);

      setRealtimeStatus(status);
      setRealtimeQuote(quote);
      setRealtimeKline(kline.items || []);
    } catch (error) {
      console.error('加载实时数据失败:', error);
    }
  };

  // 定时刷新实时数据
  useEffect(() => {
    loadRealtimeData();
    const interval = setInterval(loadRealtimeData, 3000);
    return () => clearInterval(interval);
  }, []);

  // 运行完整测试套件
  const runFullTest = async () => {
    setLoading(true);
    const results: TestResult[] = [];

    try {
      // 测试1: 数据服务状态
      try {
        const status = await getRealtimeStatus();
        results.push({
          name: '数据服务状态',
          status: status.running ? 'success' : 'error',
          message: status.running ? '服务运行正常' : '服务未启动',
          details: status,
          timestamp: new Date().toLocaleString(),
        });
      } catch (error) {
        results.push({
          name: '数据服务状态',
          status: 'error',
          message: `连接失败: ${error}`,
          timestamp: new Date().toLocaleString(),
        });
      }

      // 测试2: 实时行情数据
      try {
        const quote = await getRealtimeQuote();
        const hasData = quote && quote.price > 0;
        results.push({
          name: '实时行情数据',
          status: hasData ? 'success' : 'warning',
          message: hasData
            ? `最新价: ¥${quote.price.toFixed(2)}`
            : '暂无实时行情',
          details: quote,
          timestamp: new Date().toLocaleString(),
        });
      } catch (error) {
        results.push({
          name: '实时行情数据',
          status: 'error',
          message: `获取失败: ${error}`,
          timestamp: new Date().toLocaleString(),
        });
      }

      // 测试3: K线数据
      for (const period of ['1m', '5m', '15m']) {
        try {
          const response = await getKline(period, 10);
          const klines = response.data?.klines || [];
          results.push({
            name: `K线数据 (${period})`,
            status: klines.length > 0 ? 'success' : 'warning',
            message: klines.length > 0
              ? `获取到 ${klines.length} 根K线`
              : '暂无K线数据',
            details: { count: klines.length, latest: klines[klines.length - 1] },
            timestamp: new Date().toLocaleString(),
          });
        } catch (error) {
          results.push({
            name: `K线数据 (${period})`,
            status: 'error',
            message: `获取失败: ${error}`,
            timestamp: new Date().toLocaleString(),
          });
        }
      }

      // 测试4: 后端API连通性
      const apiTests = [
        { endpoint: '/api/system/status', name: '系统状态API' },
        { endpoint: '/api/account', name: '账户API' },
        { endpoint: '/api/strategy/summary', name: '策略API' },
      ];

      for (const test of apiTests) {
        try {
          const response = await fetch(`http://localhost:8000${test.endpoint}`);
          const data = await response.json();
          results.push({
            name: test.name,
            status: response.ok ? 'success' : 'error',
            message: response.ok ? 'API正常响应' : `HTTP ${response.status}`,
            details: data,
            timestamp: new Date().toLocaleString(),
          });
        } catch (error) {
          results.push({
            name: test.name,
            status: 'error',
            message: `连接失败: ${error}`,
            timestamp: new Date().toLocaleString(),
          });
        }
      }

      setTestResults(results);

      // 统计结果
      const successCount = results.filter((r) => r.status === 'success').length;
      const totalCount = results.length;

      if (successCount === totalCount) {
        message.success(`所有测试通过 (${successCount}/${totalCount})`);
      } else {
        message.warning(`部分测试失败 (${successCount}/${totalCount})`);
      }
    } catch (error) {
      message.error(`测试过程出错: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  // 测试结果表格列
  const columns = [
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (status: string) => {
        const config = {
          success: { color: 'success', icon: <CheckCircleOutlined /> },
          error: { color: 'error', icon: <CloseCircleOutlined /> },
          warning: { color: 'warning', icon: <SyncOutlined /> },
          pending: { color: 'default', icon: <SyncOutlined spin /> },
        };
        const { color, icon } = config[status as keyof typeof config];
        return <Badge status={color as any} icon={icon} />;
      },
    },
    {
      title: '测试项',
      dataIndex: 'name',
      key: 'name',
      width: 200,
    },
    {
      title: '结果',
      dataIndex: 'message',
      key: 'message',
    },
    {
      title: '时间',
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 180,
    },
  ];

  // 计算统计信息
  const stats = {
    total: testResults.length,
    success: testResults.filter((r) => r.status === 'success').length,
    error: testResults.filter((r) => r.status === 'error').length,
    warning: testResults.filter((r) => r.status === 'warning').length,
  };

  const successRate =
    stats.total > 0 ? ((stats.success / stats.total) * 100).toFixed(1) : '0';

  return (
    <div style={{ padding: 24 }}>
      <h1>系统综合调试</h1>

      {/* 顶部操作栏 */}
      <Card style={{ marginBottom: 16 }}>
        <Space size="large">
          <Button
            type="primary"
            icon={<ThunderboltOutlined />}
            onClick={runFullTest}
            loading={loading}
            size="large"
          >
            运行完整测试
          </Button>
          <Button
            icon={<ReloadOutlined />}
            onClick={loadRealtimeData}
            size="large"
          >
            刷新实时数据
          </Button>
        </Space>
      </Card>

      {/* 测试结果统计 */}
      {testResults.length > 0 && (
        <Card title="测试结果统计" style={{ marginBottom: 16 }}>
          <Row gutter={16}>
            <Col span={6}>
              <Statistic
                title="总测试数"
                value={stats.total}
                prefix={<DatabaseOutlined />}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="通过"
                value={stats.success}
                valueStyle={{ color: '#52c41a' }}
                prefix={<CheckCircleOutlined />}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="失败"
                value={stats.error}
                valueStyle={{ color: '#ff4d4f' }}
                prefix={<CloseCircleOutlined />}
              />
            </Col>
            <Col span={6}>
              <Card>
                <Statistic title="成功率" value={successRate} suffix="%" />
                <Progress
                  percent={parseFloat(successRate)}
                  strokeColor={
                    parseFloat(successRate) >= 80
                      ? '#52c41a'
                      : parseFloat(successRate) >= 60
                      ? '#faad14'
                      : '#ff4d4f'
                  }
                  showInfo={false}
                />
              </Card>
            </Col>
          </Row>
        </Card>
      )}

      {/* 主内容标签页 */}
      <Tabs activeKey={activeTab} onChange={setActiveTab}>
        {/* 概览标签 */}
        <TabPane tab="系统概览" key="overview">
          <Space direction="vertical" style={{ width: '100%' }} size="large">
            {/* 实时服务状态 */}
            <Card
              title={
                <Space>
                  <ApiOutlined />
                  <span>实时数据服务</span>
                  {realtimeStatus?.running && (
                    <Tag color="success">运行中</Tag>
                  )}
                  {realtimeStatus && !realtimeStatus.running && (
                    <Tag color="error">已停止</Tag>
                  )}
                </Space>
              }
            >
              {realtimeStatus ? (
                <Descriptions column={2}>
                  <Descriptions.Item label="服务状态">
                    {realtimeStatus.running ? (
                      <Badge status="success" text="运行中" />
                    ) : (
                      <Badge status="error" text="已停止" />
                    )}
                  </Descriptions.Item>
                  <Descriptions.Item label="行情缓存">
                    {realtimeStatus.cache_status.quote_cached ? (
                      <Tag color="success">已缓存</Tag>
                    ) : (
                      <Tag color="warning">未缓存</Tag>
                    )}
                  </Descriptions.Item>
                  <Descriptions.Item label="K线周期">
                    <Space wrap>
                      {realtimeStatus.cache_status.kline_periods.map(
                        (p: string) => (
                          <Tag key={p}>{p}</Tag>
                        )
                      )}
                    </Space>
                  </Descriptions.Item>
                  <Descriptions.Item label="最后更新">
                    {realtimeStatus.cache_status.last_update || '-'}
                  </Descriptions.Item>
                </Descriptions>
              ) : (
                <Alert message="正在加载服务状态..." type="info" />
              )}
            </Card>

            {/* 实时行情 */}
            <Card
              title={
                <Space>
                  <LineChartOutlined />
                  <span>实时行情</span>
                </Space>
              }
            >
              {realtimeQuote ? (
                <Row gutter={16}>
                  <Col span={8}>
                    <Statistic
                      title="最新价"
                      value={realtimeQuote.price}
                      precision={2}
                      prefix="¥"
                      valueStyle={{ fontSize: 32, color: '#1890ff' }}
                    />
                  </Col>
                  <Col span={8}>
                    <Descriptions column={1} size="small">
                      <Descriptions.Item label="开盘">
                        ¥{realtimeQuote.open.toFixed(2)}
                      </Descriptions.Item>
                      <Descriptions.Item label="最高">
                        <span style={{ color: '#f5222d' }}>
                          ¥{realtimeQuote.high.toFixed(2)}
                        </span>
                      </Descriptions.Item>
                      <Descriptions.Item label="最低">
                        <span style={{ color: '#52c41a' }}>
                          ¥{realtimeQuote.low.toFixed(2)}
                        </span>
                      </Descriptions.Item>
                    </Descriptions>
                  </Col>
                  <Col span={8}>
                    <Descriptions column={1} size="small">
                      <Descriptions.Item label="成交量">
                        {realtimeQuote.volume.toLocaleString()}
                      </Descriptions.Item>
                      <Descriptions.Item label="持仓量">
                        {realtimeQuote.open_interest?.toLocaleString() || '-'}
                      </Descriptions.Item>
                      <Descriptions.Item label="更新时间">
                        {new Date(realtimeQuote.timestamp).toLocaleTimeString()}
                      </Descriptions.Item>
                    </Descriptions>
                  </Col>
                </Row>
              ) : (
                <Alert message="暂无实时行情数据" type="warning" />
              )}
            </Card>

            {/* 最近K线 */}
            <Card
              title={
                <Space>
                  <DollarOutlined />
                  <span>最近K线 (1分钟)</span>
                </Space>
              }
            >
              {realtimeKline.length > 0 ? (
                <Table
                  dataSource={realtimeKline}
                  rowKey={(_, index) => `kline-${index}`}
                  pagination={false}
                  size="small"
                  columns={[
                    {
                      title: '时间',
                      dataIndex: 'timestamp',
                      key: 'timestamp',
                      render: (val: string) =>
                        new Date(val).toLocaleTimeString(),
                    },
                    {
                      title: '开',
                      dataIndex: 'open',
                      key: 'open',
                      render: (val: number) => val.toFixed(2),
                    },
                    {
                      title: '高',
                      dataIndex: 'high',
                      key: 'high',
                      render: (val: number) => (
                        <span style={{ color: '#f5222d' }}>
                          {val.toFixed(2)}
                        </span>
                      ),
                    },
                    {
                      title: '低',
                      dataIndex: 'low',
                      key: 'low',
                      render: (val: number) => (
                        <span style={{ color: '#52c41a' }}>
                          {val.toFixed(2)}
                        </span>
                      ),
                    },
                    {
                      title: '收',
                      dataIndex: 'close',
                      key: 'close',
                      render: (val: number) => val.toFixed(2),
                    },
                    {
                      title: '量',
                      dataIndex: 'volume',
                      key: 'volume',
                      render: (val: number) => val.toLocaleString(),
                    },
                  ]}
                />
              ) : (
                <Alert message="暂无K线数据" type="warning" />
              )}
            </Card>
          </Space>
        </TabPane>

        {/* 测试结果标签 */}
        <TabPane tab="测试结果" key="tests">
          {testResults.length > 0 ? (
            <Card>
              <Table
                columns={columns}
                dataSource={testResults}
                rowKey={(_, index) => `test-${index}`}
                pagination={false}
                expandable={{
                  expandedRowRender: (record) => (
                    <pre style={{ margin: 0, background: 'rgba(255, 255, 255, 0.08)', padding: 12, color: '#e8e8e8' }}>
                      {JSON.stringify(record.details, null, 2)}
                    </pre>
                  ),
                  rowExpandable: (record) => !!record.details,
                }}
              />
            </Card>
          ) : (
            <Alert
              message="暂无测试结果"
              description="点击 '运行完整测试' 按钮开始系统测试"
              type="info"
              showIcon
            />
          )}
        </TabPane>

        {/* API测试标签 */}
        <TabPane tab="API测试" key="api">
          <Card>
            <Alert
              message="API测试工具"
              description="在此标签下可以测试各个API端点的响应情况"
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
            />
            <Space direction="vertical" style={{ width: '100%' }}>
              <Button onClick={() => fetch('http://localhost:8000/api/system/status').then(r => r.json()).then(console.log)}>
                测试系统状态API
              </Button>
              <Button onClick={() => fetch('http://localhost:8000/api/kline?period=1m&limit=10').then(r => r.json()).then(console.log)}>
                测试K线API
              </Button>
              <Button onClick={() => fetch('http://localhost:8000/api/account').then(r => r.json()).then(console.log)}>
                测试账户API
              </Button>
            </Space>
          </Card>
        </TabPane>

        {/* \u540e\u7aef\u65e5\u5fd7\u6807\u7b7e */}
        <TabPane tab="\u540e\u7aef\u65e5\u5fd7" key="logs">
          <Card>
            <div style={{ maxHeight: 400, overflow: 'auto', background: '#0f0f0f', color: '#e8e8e8', padding: 12, borderRadius: 6, fontFamily: 'Consolas, monospace', fontSize: 12 }}>
              {logs && logs.length > 0 ? (
                <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{logs.join('\n')}</pre>
              ) : (
                <Alert message="\u6682\u65e0\u65e5\u5fd7\u8f93\u51fa" type="info" />
              )}
            </div>
          </Card>
        </TabPane>
      </Tabs>
    </div>
  );
};

export default SystemDebug;
