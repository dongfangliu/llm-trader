/**
 * 数据调试页面 - 诊断数据质量问题
 */
import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Select,
  Button,
  Space,
  Tag,
  Statistic,
  Row,
  Col,
  DatePicker,
  Switch,
  message,
  Tooltip,
  Descriptions,
  Alert,
} from 'antd';
import {
  ReloadOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DatabaseOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { Dayjs } from 'dayjs';
import * as echarts from 'echarts';
import {
  getRawKlineData,
  getDataStats,
  getTimeDistribution,
  getRealtimeQuote,
  getRealtimeKline,
  getRealtimeStatus,
  type RawKlineItem,
  type DataStats,
  type TimeDistributionItem,
  type RealtimeQuote,
  type RealtimeKlineItem,
  type RealtimeStatus,
} from '../api/debug';

const { RangePicker } = DatePicker;

const DataDebug: React.FC = () => {
  const [period, setPeriod] = useState<number>(1);
  const [dataSource, setDataSource] = useState<RawKlineItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [abnormalCount, setAbnormalCount] = useState(0);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 50 });
  const [onlyAbnormal, setOnlyAbnormal] = useState(false);
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null]>([null, null]);
  const [stats, setStats] = useState<DataStats | null>(null);
  const [timeDistribution, setTimeDistribution] = useState<TimeDistributionItem[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars

  // 实时数据状态
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus | null>(null);
  const [realtimeQuote, setRealtimeQuote] = useState<RealtimeQuote | null>(null);
  const [realtimeKline, setRealtimeKline] = useState<RealtimeKlineItem[]>([]);
  const [realtimePeriod, setRealtimePeriod] = useState<string>('1m');

  // 表格列定义
  const columns: ColumnsType<RawKlineItem> = [
    {
      title: '状态',
      dataIndex: 'abnormal',
      key: 'abnormal',
      width: 60,
      fixed: 'left',
      render: (abnormal: boolean) =>
        abnormal ? (
          <WarningOutlined style={{ color: '#ff4d4f', fontSize: 18 }} />
        ) : (
          <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 18 }} />
        ),
    },
    {
      title: '时间',
      dataIndex: 'datetime',
      key: 'datetime',
      width: 180,
      fixed: 'left',
      render: (text: string, record: RawKlineItem) => (
        <div>
          <div>{text}</div>
          <div style={{ fontSize: 12, color: '#999' }}>
            {record.weekday} {String(record.hour).padStart(2, '0')}:
            {String(record.minute).padStart(2, '0')}
          </div>
        </div>
      ),
    },
    {
      title: '交易时段',
      dataIndex: 'is_trading_time',
      key: 'is_trading_time',
      width: 100,
      render: (is_trading: boolean) =>
        is_trading ? (
          <Tag color="green">交易中</Tag>
        ) : (
          <Tag color="red">非交易</Tag>
        ),
    },
    {
      title: '开盘',
      dataIndex: 'open',
      key: 'open',
      width: 100,
      render: (val: number) => val?.toFixed(2) || '-',
    },
    {
      title: '最高',
      dataIndex: 'high',
      key: 'high',
      width: 100,
      render: (val: number) => val?.toFixed(2) || '-',
    },
    {
      title: '最低',
      dataIndex: 'low',
      key: 'low',
      width: 100,
      render: (val: number) => val?.toFixed(2) || '-',
    },
    {
      title: '收盘',
      dataIndex: 'close',
      key: 'close',
      width: 100,
      render: (val: number) => val?.toFixed(2) || '-',
    },
    {
      title: '成交量',
      dataIndex: 'volume',
      key: 'volume',
      width: 100,
      render: (val: number) => val || 0,
    },
    {
      title: '持仓量',
      dataIndex: 'open_interest',
      key: 'open_interest',
      width: 100,
      render: (val: number) => val || 0,
    },
    {
      title: '异常标记',
      dataIndex: 'abnormal_flags',
      key: 'abnormal_flags',
      width: 250,
      render: (flags: string[]) =>
        flags.length > 0 ? (
          <Space wrap>
            {flags.map((flag, idx) => (
              <Tag color="error" key={idx}>
                {flag}
              </Tag>
            ))}
          </Space>
        ) : (
          <Tag color="success">正常</Tag>
        ),
    },
  ];

  // 加载数据
  const loadData = async () => {
    setLoading(true);
    try {
      const offset = (pagination.current - 1) * pagination.pageSize;
      const params: any = {
        period,
        limit: pagination.pageSize,
        offset,
        only_abnormal: onlyAbnormal,
      };

      if (dateRange[0] && dateRange[1]) {
        params.start_date = dateRange[0].format('YYYY-MM-DD');
        params.end_date = dateRange[1].format('YYYY-MM-DD');
      }

      const data = await getRawKlineData(params);
      setDataSource(data.items);
      setTotal(data.total);
      setAbnormalCount(data.abnormal_count);
    } catch (error) {
      message.error('加载数据失败');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // 加载统计信息
  const loadStats = async () => {
    try {
      const data = await getDataStats();
      setStats(data);
    } catch (error) {
      console.error('加载统计信息失败', error);
    }
  };

  // 加载实时数据
  const loadRealtimeData = async () => {
    try {
      // 获取服务状态
      const status = await getRealtimeStatus();
      setRealtimeStatus(status);

      // 如果服务在运行，获取行情和K线
      if (status.running) {
        const quote = await getRealtimeQuote();
        setRealtimeQuote(quote);

        const kline = await getRealtimeKline({ period: realtimePeriod, limit: 10 });
        setRealtimeKline(kline.items);
      }
    } catch (error) {
      console.error('加载实时数据失败', error);
    }
  };

  // 加载时间分布
  const loadTimeDistribution = async () => {
    try {
      const data = await getTimeDistribution(period);
      setTimeDistribution(data);
      renderTimeDistributionChart(data);
    } catch (error) {
      console.error('加载时间分布失败', error);
    }
  };

  // 渲染时间分布图表
  const renderTimeDistributionChart = (data: TimeDistributionItem[]) => {
    const chartDom = document.getElementById('time-distribution-chart');
    if (!chartDom) return;

    const chart = echarts.init(chartDom);
    const hours = data.map((item) => item.hour);
    const counts = data.map((item) => item.count);
    const colors = data.map((item) =>
      item.abnormal ? '#ff4d4f' : item.is_trading_hour ? '#52c41a' : '#faad14'
    );

    const option: echarts.EChartsOption = {
      title: {
        text: `${period}分钟K线时间分布`,
        left: 'center',
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'shadow',
        },
        formatter: (params: any) => {
          const item = data[params[0].dataIndex];
          return `
            <div style="padding: 5px;">
              <div><strong>${item.hour}:00 - ${item.hour}:59</strong></div>
              <div>数据条数: ${item.count}</div>
              <div>是否交易时段: ${item.is_trading_hour ? '是' : '否'}</div>
              <div>状态: ${item.abnormal ? '⚠️ 异常' : '✅ 正常'}</div>
            </div>
          `;
        },
      },
      xAxis: {
        type: 'category',
        data: hours,
        name: '小时',
        axisLabel: {
          formatter: '{value}:00',
        },
      },
      yAxis: {
        type: 'value',
        name: '数据条数',
      },
      series: [
        {
          type: 'bar',
          data: counts,
          itemStyle: {
            color: (params) => colors[params.dataIndex],
          },
          label: {
            show: true,
            position: 'top',
            formatter: '{c}',
          },
        },
      ],
      grid: {
        left: 60,
        right: 30,
        bottom: 60,
        top: 60,
      },
    };

    chart.setOption(option);

    // 响应式调整
    const resizeObserver = new ResizeObserver(() => {
      chart.resize();
    });
    resizeObserver.observe(chartDom);

    return () => {
      resizeObserver.disconnect();
      chart.dispose();
    };
  };

  // 初始化和数据变化时重新加载
  useEffect(() => {
    loadData();
  }, [period, pagination.current, pagination.pageSize, onlyAbnormal, dateRange]);

  useEffect(() => {
    loadStats();
    loadRealtimeData();
  }, []);

  // 定时刷新实时数据（每3秒）
  useEffect(() => {
    const interval = setInterval(() => {
      loadRealtimeData();
    }, 3000);

    return () => clearInterval(interval);
  }, [realtimePeriod]);

  useEffect(() => {
    loadTimeDistribution();
  }, [period]);

  // 重置分页当条件改变时
  const handleFilterChange = () => {
    setPagination({ ...pagination, current: 1 });
  };

  return (
    <div style={{ padding: 24 }}>
      <h1>数据调试工具</h1>

      {/* 实时数据监控 */}
      <Card
        title={
          <Space>
            <ClockCircleOutlined />
            <span>实时数据拉取监控</span>
            {realtimeStatus?.running && (
              <Tag color="success">服务运行中</Tag>
            )}
            {realtimeStatus && !realtimeStatus.running && (
              <Tag color="error">服务未运行</Tag>
            )}
          </Space>
        }
        extra={
          <Button
            type="primary"
            icon={<ReloadOutlined />}
            onClick={loadRealtimeData}
            size="small"
          >
            刷新
          </Button>
        }
        style={{ marginBottom: 16 }}
      >
        {realtimeStatus && (
          <Row gutter={16}>
            {/* 服务状态 */}
            <Col span={8}>
              <Card size="small" title="服务状态">
                <Descriptions column={1} size="small">
                  <Descriptions.Item label="运行状态">
                    {realtimeStatus.running ? (
                      <Tag color="success">运行中</Tag>
                    ) : (
                      <Tag color="error">已停止</Tag>
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
                      {realtimeStatus.cache_status.kline_periods.map(p => (
                        <Tag key={p}>{p}</Tag>
                      ))}
                    </Space>
                  </Descriptions.Item>
                  <Descriptions.Item label="最后更新">
                    {realtimeStatus.cache_status.last_update || '-'}
                  </Descriptions.Item>
                </Descriptions>
              </Card>
            </Col>

            {/* 实时行情与五档盘口 */}
            <Col span={16}>
              <Card size="small" title="实时行情与五档盘口（TqSDK实时拉取）">
                {realtimeQuote ? (
                  <Row gutter={16}>
                    <Col span={12}>
                      <Descriptions column={1} size="small" bordered>
                        <Descriptions.Item label="合约">
                          {realtimeQuote.symbol}
                        </Descriptions.Item>
                        <Descriptions.Item label="最新价">
                          <span style={{ fontSize: 20, fontWeight: 'bold', color: '#1890ff' }}>
                            {realtimeQuote.price.toFixed(2)}
                          </span>
                        </Descriptions.Item>
                        <Descriptions.Item label="开盘/最高/最低">
                          {realtimeQuote.open.toFixed(2)} / {realtimeQuote.high.toFixed(2)} / {realtimeQuote.low.toFixed(2)}
                        </Descriptions.Item>
                        <Descriptions.Item label="成交量">
                          {realtimeQuote.volume.toLocaleString()}
                        </Descriptions.Item>
                        <Descriptions.Item label="更新时间">
                          {new Date(realtimeQuote.timestamp).toLocaleString('zh-CN')}
                        </Descriptions.Item>
                      </Descriptions>
                    </Col>
                    <Col span={12}>
                      <div style={{ fontSize: 12 }}>
                        <div style={{ fontWeight: 'bold', marginBottom: 8, textAlign: 'center' }}>
                          五档盘口
                        </div>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ backgroundColor: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
                              <th style={{ padding: '4px 8px', textAlign: 'right' }}>买量</th>
                              <th style={{ padding: '4px 8px', textAlign: 'right', color: '#52c41a' }}>买价</th>
                              <th style={{ padding: '4px 8px', textAlign: 'left', color: '#f5222d' }}>卖价</th>
                              <th style={{ padding: '4px 8px', textAlign: 'left' }}>卖量</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[1, 2, 3, 4, 5].map(level => {
                              const bidPrice = realtimeQuote[`bid_price${level}` as keyof RealtimeQuote] as number;
                              const bidVolume = realtimeQuote[`bid_volume${level}` as keyof RealtimeQuote] as number;
                              const askPrice = realtimeQuote[`ask_price${level}` as keyof RealtimeQuote] as number;
                              const askVolume = realtimeQuote[`ask_volume${level}` as keyof RealtimeQuote] as number;

                              return (
                                <tr key={level} style={{ borderBottom: '1px solid #fafafa' }}>
                                  <td style={{ padding: '2px 8px', textAlign: 'right' }}>
                                    {bidVolume || '-'}
                                  </td>
                                  <td style={{ padding: '2px 8px', textAlign: 'right', color: '#52c41a', fontWeight: 'bold' }}>
                                    {bidPrice ? bidPrice.toFixed(2) : '-'}
                                  </td>
                                  <td style={{ padding: '2px 8px', textAlign: 'left', color: '#f5222d', fontWeight: 'bold' }}>
                                    {askPrice ? askPrice.toFixed(2) : '-'}
                                  </td>
                                  <td style={{ padding: '2px 8px', textAlign: 'left' }}>
                                    {askVolume || '-'}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </Col>
                  </Row>
                ) : (
                  <Alert message="暂无实时行情数据" type="warning" />
                )}
              </Card>
            </Col>

            {/* 实时K线 */}
            <Col span={8}>
              <Card
                size="small"
                title="实时K线（最新10根）"
                extra={
                  <Select
                    value={realtimePeriod}
                    onChange={setRealtimePeriod}
                    size="small"
                    style={{ width: 80 }}
                  >
                    <Select.Option value="1m">1分钟</Select.Option>
                    <Select.Option value="5m">5分钟</Select.Option>
                    <Select.Option value="15m">15分钟</Select.Option>
                    <Select.Option value="1h">1小时</Select.Option>
                    <Select.Option value="4h">4小时</Select.Option>
                  </Select>
                }
              >
                {realtimeKline.length > 0 ? (
                  <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                    <table style={{ width: '100%', fontSize: 12 }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
                          <th>时间</th>
                          <th>开</th>
                          <th>高</th>
                          <th>低</th>
                          <th>收</th>
                          <th>量</th>
                        </tr>
                      </thead>
                      <tbody>
                        {realtimeKline.slice(0, 5).map((item, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid #fafafa' }}>
                            <td>{new Date(item.timestamp).toLocaleTimeString('zh-CN')}</td>
                            <td>{item.open.toFixed(2)}</td>
                            <td style={{ color: '#f5222d' }}>{item.high.toFixed(2)}</td>
                            <td style={{ color: '#52c41a' }}>{item.low.toFixed(2)}</td>
                            <td>{item.close.toFixed(2)}</td>
                            <td>{item.volume}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Alert message="暂无K线数据" type="warning" />
                )}
              </Card>
            </Col>
          </Row>
        )}

        {!realtimeStatus && (
          <Alert message="正在加载实时数据服务状态..." type="info" />
        )}
      </Card>

      {/* 统计概览 */}
      {stats && (
        <Card title="数据统计概览" style={{ marginBottom: 16 }}>
          <Row gutter={16}>
            <Col span={6}>
              <Statistic
                title="数据库大小"
                value={stats.database.size_mb}
                suffix="MB"
                prefix={<DatabaseOutlined />}
              />
              <div style={{ fontSize: 12, color: '#999', marginTop: 8 }}>
                {stats.database.path}
              </div>
            </Col>
            <Col span={6}>
              <Statistic
                title="1分钟K线"
                value={stats.minute_1.total}
                suffix="条"
              />
              <div style={{ fontSize: 12, color: '#999', marginTop: 8 }}>
                {stats.minute_1.earliest || '-'} ~ {stats.minute_1.latest || '-'}
              </div>
            </Col>
            <Col span={6}>
              <Statistic
                title="日线数据"
                value={stats.daily.total}
                suffix="条"
              />
              <div style={{ fontSize: 12, color: '#999', marginTop: 8 }}>
                {stats.daily.earliest || '-'} ~ {stats.daily.latest || '-'}
              </div>
            </Col>
            <Col span={6}>
              <Tooltip title="成交量为0或价格为空的数据条数">
                <Statistic
                  title="异常数据"
                  value={stats.minute_1.null_count + stats.minute_1.zero_volume_count}
                  suffix="条"
                  valueStyle={{ color: '#ff4d4f' }}
                  prefix={<WarningOutlined />}
                />
              </Tooltip>
            </Col>
          </Row>
        </Card>
      )}

      {/* 异常提示 */}
      {abnormalCount > 0 && (
        <Alert
          message={`发现 ${abnormalCount} 条异常数据`}
          description="这些数据可能包含：非交易时段数据、价格为空、价格异常、成交量异常等问题"
          type="warning"
          showIcon
          closable
          style={{ marginBottom: 16 }}
        />
      )}

      {/* 时间分布图表 */}
      <Card title="时间分布分析" style={{ marginBottom: 16 }}>
        <div
          id="time-distribution-chart"
          style={{ width: '100%', height: 400 }}
        />
        <div style={{ marginTop: 16, fontSize: 12, color: '#999' }}>
          <Space>
            <Tag color="success">绿色：交易时段正常数据</Tag>
            <Tag color="error">红色：非交易时段异常数据</Tag>
            <Tag color="warning">黄色：其他情况</Tag>
          </Space>
        </div>
      </Card>

      {/* 数据表格 */}
      <Card
        title="原始数据查看"
        extra={
          <Space>
            <span>周期：</span>
            <Select
              value={period}
              onChange={(val) => {
                setPeriod(val);
                handleFilterChange();
              }}
              style={{ width: 100 }}
            >
              <Select.Option value={1}>1分钟</Select.Option>
              <Select.Option value={5}>5分钟</Select.Option>
              <Select.Option value={15}>15分钟</Select.Option>
              <Select.Option value={60}>60分钟</Select.Option>
              <Select.Option value={240}>240分钟</Select.Option>
            </Select>

            <span>日期范围：</span>
            <RangePicker
              value={dateRange}
              onChange={(dates) => {
                setDateRange(dates as [Dayjs | null, Dayjs | null]);
                handleFilterChange();
              }}
              format="YYYY-MM-DD"
            />

            <span>仅显示异常：</span>
            <Switch
              checked={onlyAbnormal}
              onChange={(checked) => {
                setOnlyAbnormal(checked);
                handleFilterChange();
              }}
            />

            <Button
              type="primary"
              icon={<ReloadOutlined />}
              onClick={loadData}
              loading={loading}
            >
              刷新
            </Button>
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={dataSource}
          loading={loading}
          rowKey="datetime"
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: total,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 条 (异常: ${abnormalCount})`,
            onChange: (page, pageSize) => {
              setPagination({ current: page, pageSize: pageSize || 50 });
            },
          }}
          scroll={{ x: 1400, y: 600 }}
          rowClassName={(record) =>
            record.abnormal ? 'abnormal-row' : 'normal-row'
          }
        />
      </Card>

      <style>{`
        .abnormal-row {
          background-color: #fff2e8 !important;
        }
        .abnormal-row:hover {
          background-color: #ffe7d3 !important;
        }
        .normal-row:hover {
          background-color: #fafafa !important;
        }
      `}</style>
    </div>
  );
};

export default DataDebug;
