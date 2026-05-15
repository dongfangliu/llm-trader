export default defineNuxtPlugin((nuxtApp) => {
  const { trackGrowthEvent } = useGrowthEvents()
  const route = useRoute()
  const router = useRouter()

  const publicSeoPrefixes = ['/stocks', '/futures', '/learn', '/research']
  const isPublicSeoPath = (path: string) => publicSeoPrefixes.some(prefix => path === prefix || path.startsWith(`${prefix}/`))

  nuxtApp.hook('app:mounted', () => {
    if (isPublicSeoPath(route.path)) {
      trackGrowthEvent('seo_landing_view', { path: route.fullPath })
    }
  })

  router.afterEach((to, from) => {
    if (to.fullPath === from.fullPath) return
    if (isPublicSeoPath(to.path)) {
      trackGrowthEvent('seo_landing_view', { path: to.fullPath })
    }
    if (to.path === '/upgrade') {
      trackGrowthEvent('upgrade_page_view', { path: to.fullPath })
    }
  })
})
