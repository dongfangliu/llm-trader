import { SITE_DESCRIPTION, SITE_NAME } from './constants/seo'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  devtools: { enabled: false },
  modules: ['@nuxtjs/tailwindcss', '@pinia/nuxt'],
  css: ['~/assets/css/tokens.css', '~/assets/css/main.css', '~/assets/css/model-review.css'],
  // API proxy is handled by server/middleware/proxy.ts (runtime, reads BACKEND_URL env var)
  app: {
    head: {
      htmlAttrs: { lang: 'zh-CN' },
      title: SITE_NAME,
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'description', content: SITE_DESCRIPTION },
        { name: 'theme-color', content: '#f2f2f7' },
        { name: 'application-name', content: SITE_NAME },
        { name: 'mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-title', content: SITE_NAME },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
        // SEO: search-engine verification (fill in after registering)
        // { name: 'google-site-verification', content: '<paste from Google Search Console>' },
        // { name: 'msvalidate.01', content: '<paste from Bing Webmaster Tools>' },
      ],
      link: [
        { rel: 'manifest', href: '/manifest.webmanifest' },
        { rel: 'icon', type: 'image/png', sizes: '192x192', href: '/icons/icon-192.png' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/icons/apple-touch-icon.png' }
      ]
    }
  },
  typescript: {
    strict: false
  }
})
