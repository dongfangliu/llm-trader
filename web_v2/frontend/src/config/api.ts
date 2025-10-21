/**
 * API配置
 * 根据环境自动选择正确的URL
 */

// 开发环境使用代理（相对路径），生产环境使用完整URL
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

// WebSocket URL配置
export const getWebSocketUrl = (): string => {
  // 如果环境变量配置了WebSocket URL，使用它
  const envWsUrl = import.meta.env.VITE_WS_URL
  if (envWsUrl) {
    return `${envWsUrl}/ws`
  }

  // 开发环境：使用相对路径，让Vite代理处理
  // 生产环境：根据当前页面协议自动选择ws://或wss://
  if (import.meta.env.DEV) {
    // 开发模式：使用当前host，让代理转发
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${protocol}//${window.location.host}/ws`
  } else {
    // 生产模式：使用配置的URL或当前host
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${protocol}//${window.location.host}/ws`
  }
}

export default {
  API_BASE_URL,
  getWebSocketUrl,
}
