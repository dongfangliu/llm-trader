<script setup lang="ts">
import { computed } from 'vue'
import { SITE_DESCRIPTION, SITE_NAME } from '~/constants/seo'

const route = useRoute()
const requestUrl = useRequestURL()
const privateRoute = computed(() => {
  const path = route.path
  return path.startsWith('/admin')
    || path.startsWith('/account')
    || path.startsWith('/login')
    || path.startsWith('/register')
    || path.startsWith('/verify-email')
})

useHead(() => ({
  meta: privateRoute.value
    ? [{ name: 'robots', content: 'noindex,nofollow' }]
    : [],
  script: [
    {
      key: 'global-jsonld',
      type: 'application/ld+json',
      innerHTML: JSON.stringify([
        {
          '@context': 'https://schema.org',
          '@type': 'Organization',
          name: SITE_NAME,
          url: requestUrl.origin,
          logo: `${requestUrl.origin}/icons/icon-512.png`,
          description: SITE_DESCRIPTION,
        },
        {
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          name: SITE_NAME,
          url: requestUrl.origin,
          inLanguage: 'zh-CN',
          description: SITE_DESCRIPTION,
          potentialAction: {
            '@type': 'SearchAction',
            target: `${requestUrl.origin}/?market=a&symbol={search_term_string}`,
            'query-input': 'required name=search_term_string',
          },
        },
        {
          '@context': 'https://schema.org',
          '@type': 'SoftwareApplication',
          name: SITE_NAME,
          applicationCategory: 'FinanceApplication',
          operatingSystem: 'Web',
          url: requestUrl.origin,
          description: SITE_DESCRIPTION,
          offers: {
            '@type': 'Offer',
            price: '0',
            priceCurrency: 'CNY',
          },
        },
      ]),
    },
  ],
}))
</script>

<template>
  <div>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </div>
</template>
