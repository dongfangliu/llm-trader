import axios from 'axios'

// All API calls use relative /api/* paths — Nuxt server proxies to backend
const api = axios.create({
  baseURL: '',
  headers: {
    'Content-Type': 'application/json',
  },
})

// Add request interceptor
api.interceptors.request.use((config) => {
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
