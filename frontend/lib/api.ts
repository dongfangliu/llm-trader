import axios from 'axios'

// Create axios instance - baseURL will be set dynamically
const api = axios.create({
  headers: {
    'Content-Type': 'application/json',
  },
})

// We need to set baseURL at runtime since useRuntimeConfig() only works in composables
export function getApiBase(): string {
  // In browser, read from window or fallback
  if (typeof window !== 'undefined') {
    return (window as any).__NUXT_API_BASE__ || 'http://localhost:8000'
  }
  return process.env.NUXT_PUBLIC_API_BASE || 'http://localhost:8000'
}

// Add request interceptor
api.interceptors.request.use((config) => {
  // Set baseURL dynamically
  config.baseURL = getApiBase()

  // Add auth token
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }

    // Add device_id
    const deviceId = localStorage.getItem('device_id')
    if (deviceId) {
      config.headers['X-Device-ID'] = deviceId
    }
  }

  return config
})

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('token')
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

export default api
export { api }
