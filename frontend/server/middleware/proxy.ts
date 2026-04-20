import { proxyRequest } from 'h3'

// Runtime proxy: /api/** → backend container
// BACKEND_URL is set at container startup, not build time
export default defineEventHandler(async (event) => {
  if (event.path.startsWith('/api/') && !event.path.startsWith('/api/og/')) {
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000'
    return proxyRequest(event, `${backendUrl}${event.path}`)
  }
})
