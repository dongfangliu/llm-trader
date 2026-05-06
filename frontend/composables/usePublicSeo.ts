import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { DEFAULT_OG_IMAGE, SITE_NAME } from '~/constants/seo'

type SeoInput = {
  title: MaybeRefOrGetter<string>
  description: MaybeRefOrGetter<string>
  path: MaybeRefOrGetter<string>
  image?: MaybeRefOrGetter<string>
  type?: 'website' | 'article'
}

export function useCanonical(path: MaybeRefOrGetter<string>) {
  const requestUrl = useRequestURL()
  const href = computed(() => `${requestUrl.origin}${toValue(path)}`)

  useHead(() => ({
    link: [{ rel: 'canonical', href: href.value }],
  }))

  return href
}

export function usePublicSeo(input: SeoInput) {
  const requestUrl = useRequestURL()
  const canonical = useCanonical(input.path)
  const imageUrl = computed(() => {
    const image = toValue(input.image) || DEFAULT_OG_IMAGE
    return image.startsWith('http') ? image : `${requestUrl.origin}${image}`
  })

  useSeoMeta({
    title: () => toValue(input.title),
    description: () => toValue(input.description),
    ogTitle: () => toValue(input.title),
    ogDescription: () => toValue(input.description),
    ogSiteName: SITE_NAME,
    ogType: input.type || 'website',
    ogUrl: () => canonical.value,
    ogImage: () => imageUrl.value,
    twitterCard: 'summary_large_image',
    twitterImage: () => imageUrl.value,
    robots: 'index,follow',
  })

  return canonical
}

export function useJsonLd(id: string, data: MaybeRefOrGetter<Record<string, any> | Record<string, any>[]>) {
  useHead(() => ({
    script: [
      {
        key: id,
        type: 'application/ld+json',
        innerHTML: JSON.stringify(toValue(data)),
      },
    ],
  }))
}

export function breadcrumbJsonLd(origin: string, items: Array<{ name: string; path: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: `${origin}${item.path}`,
    })),
  }
}
