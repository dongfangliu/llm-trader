import { useState, useEffect, useRef, useCallback } from 'react'

interface UseWebSocketOptions {
  url: string
  onOpen?: (event: Event) => void
  onClose?: (event: CloseEvent) => void
  onMessage?: (data: any) => void
  onError?: (event: Event) => void
  reconnectInterval?: number
  maxReconnectAttempts?: number
}

export const useWebSocket = (options: UseWebSocketOptions) => {
  const {
    url,
    onOpen,
    onClose,
    onMessage,
    onError,
    reconnectInterval = 3000,
  } = options

  const [lastMessage, setLastMessage] = useState<any>(null)
  const [readyState, setReadyState] = useState<number>(WebSocket.CONNECTING)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectCountRef = useRef(0)
  const reconnectTimeoutRef = useRef<number>()
  const heartbeatIntervalRef = useRef<number>()
  const shouldReconnectRef = useRef(true)

  // 使用ref存储回调函数，避免依赖变化导致重连
  const onOpenRef = useRef(onOpen)
  const onCloseRef = useRef(onClose)
  const onMessageRef = useRef(onMessage)
  const onErrorRef = useRef(onError)

  // 更新ref
  onOpenRef.current = onOpen
  onCloseRef.current = onClose
  onMessageRef.current = onMessage
  onErrorRef.current = onError

  const connect = useCallback(() => {
    try {
      // 清理旧连接
      if (wsRef.current) {
        wsRef.current.close()
      }
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current)
      }

      const ws = new WebSocket(url)

      ws.onopen = (event) => {
        setReadyState(WebSocket.OPEN)
        reconnectCountRef.current = 0
        console.log('WebSocket连接成功')
        onOpenRef.current?.(event)

        // 启动心跳检测 - 每30秒发送一次ping
        heartbeatIntervalRef.current = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }))
            console.log('发送心跳 ping')
          }
        }, 30000)
      }

      ws.onclose = (event) => {
        setReadyState(WebSocket.CLOSED)
        console.log(`WebSocket连接关闭: ${event.code} ${event.reason}`)
        onCloseRef.current?.(event)

        // 清理心跳
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current)
          heartbeatIntervalRef.current = undefined
        }

        // 自动重连 - 移除最大重连次数限制，改为指数退避
        if (shouldReconnectRef.current) {
          const delay = Math.min(reconnectInterval * Math.pow(1.5, reconnectCountRef.current), 30000)
          reconnectCountRef.current++
          console.log(`将在 ${delay}ms 后尝试重连 (第${reconnectCountRef.current}次)`)
          reconnectTimeoutRef.current = window.setTimeout(() => {
            connect()
          }, delay)
        }
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)

          // 忽略pong消息
          if (data.type === 'pong') {
            console.log('收到心跳 pong')
            return
          }

          setLastMessage(data)
          onMessageRef.current?.(data)
        } catch (error) {
          console.error('解析WebSocket消息失败:', error)
        }
      }

      ws.onerror = (event) => {
        console.error('WebSocket错误:', event)
        onErrorRef.current?.(event)
      }

      wsRef.current = ws
    } catch (error) {
      console.error('WebSocket连接失败:', error)
    }
  }, [url, reconnectInterval]) // 移除回调函数依赖，使用ref来访问

  const disconnect = useCallback(() => {
    shouldReconnectRef.current = false

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = undefined
    }

    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current)
      heartbeatIntervalRef.current = undefined
    }

    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
  }, [])

  const sendMessage = useCallback((data: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data))
    } else {
      console.warn('WebSocket未连接')
    }
  }, [])

  useEffect(() => {
    // 组件挂载时自动连接（只在第一次挂载时）
    if (!wsRef.current) {
      shouldReconnectRef.current = true
      connect()
    }

    // 组件卸载时不断开连接，让WebSocket持续运行
    // 这样可以避免HMR或组件重渲染导致的断开
    return () => {
      // 不调用disconnect()，保持连接
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // 只在组件挂载时检查一次

  return {
    lastMessage,
    readyState,
    sendMessage,
    connect,
    disconnect,
  }
}
