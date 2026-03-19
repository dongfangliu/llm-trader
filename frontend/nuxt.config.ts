// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  devtools: { enabled: true },
  modules: ['@nuxtjs/tailwindcss', '@pinia/nuxt'],
  css: ['~/assets/css/main.css'],
  // Server-side proxy: browser calls /api/* → Nuxt server forwards to backend container
  // Same pattern as old Next.js rewrites, works in both dev and Docker prod
  routeRules: {
    '/api/**': {
      proxy: `${process.env.BACKEND_URL || 'http://localhost:8000'}/api/**`
    }
  },
  runtimeConfig: {
    public: {
      // Empty string = use relative /api/* path (goes through Nuxt proxy)
      apiBase: ''
    }
  },
  app: {
    head: {
      title: 'AI 股票分析',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'default' }
      ],
      link: [
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' }
      ]
    }
  },
  typescript: {
    strict: false
  }
})
