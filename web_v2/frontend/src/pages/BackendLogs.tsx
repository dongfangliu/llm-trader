import { useEffect, useRef, useState } from 'react'
import { Button, Card, Checkbox, InputNumber, Space, Typography } from 'antd'
import api from '../api/client'

const { Text } = Typography

export default function BackendLogs() {
  const [lines, setLines] = useState<string[]>([])
  const [tail, setTail] = useState<number>(500)
  const [autoScroll, setAutoScroll] = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const fetchLogs = async () => {
    setLoading(true)
    try {
      const res = await api.get('/system/logs', { params: { tail } })
      if (res?.data?.lines) {
        setLines(res.data.lines as string[])
      } else if (Array.isArray(res?.lines)) {
        // fallback if backend doesn't nest under data
        setLines(res.lines as string[])
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLogs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tail])

  useEffect(() => {
    if (!autoRefresh) return
    const id = setInterval(fetchLogs, 2000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, tail])

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [lines, autoScroll])

  return (
    <Card
      title={
        <Space>
          <Text strong>后端日志</Text>
          <Button size="small" onClick={fetchLogs} loading={loading}>刷新</Button>
          <Checkbox checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)}>自动刷新</Checkbox>
          <Checkbox checked={autoScroll} onChange={e => setAutoScroll(e.target.checked)}>自动滚动</Checkbox>
          <Space size={4}>
            <Text>尾部行数:</Text>
            <InputNumber min={50} max={5000} step={50} value={tail} onChange={v => setTail(Number(v) || 500)} />
          </Space>
        </Space>
      }
      bordered={false}
      style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
    >
      <div
        ref={scrollRef}
        style={{
          background: '#0b0e11',
          color: '#d1d5db',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace',
          fontSize: 12,
          padding: 12,
          borderRadius: 6,
          height: 'calc(100vh - 220px)',
          overflow: 'auto',
          whiteSpace: 'pre',
        }}
      >
        {lines.length ? lines.join('') : '暂无日志'}
      </div>
    </Card>
  )
}
