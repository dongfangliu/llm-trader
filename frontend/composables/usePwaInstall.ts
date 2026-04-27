import { computed, onMounted, onUnmounted, ref } from 'vue'

const DISMISS_KEY = 'pwaInstallDismissed'

export function usePwaInstall() {
  const deferredPrompt = ref<any | null>(null)
  const isMobile = ref(false)
  const isStandalone = ref(false)
  const isIosSafari = ref(false)
  const isDismissed = ref(false)
  const showIosGuide = ref(false)

  function updateEnvironment() {
    if (typeof window === 'undefined') return
    const ua = window.navigator.userAgent
    const isIos = /iphone|ipad|ipod/i.test(ua)
    isMobile.value = isIos || /android|mobile/i.test(ua) || window.innerWidth < 768
    isStandalone.value =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true
    isIosSafari.value =
      isIos &&
      /safari/i.test(ua) &&
      !/crios|fxios|edgios|opr/i.test(ua)
  }

  function onBeforeInstallPrompt(event: Event) {
    event.preventDefault()
    deferredPrompt.value = event
  }

  const canShowInstall = computed(() =>
    isMobile.value &&
    !isStandalone.value &&
    !isDismissed.value &&
    (!!deferredPrompt.value || isIosSafari.value)
  )

  async function install() {
    if (deferredPrompt.value) {
      const promptEvent = deferredPrompt.value
      deferredPrompt.value = null
      await promptEvent.prompt()
      await promptEvent.userChoice.catch(() => null)
      updateEnvironment()
      return
    }
    if (isIosSafari.value) showIosGuide.value = true
  }

  function dismiss() {
    isDismissed.value = true
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DISMISS_KEY, '1')
    }
  }

  onMounted(() => {
    isDismissed.value = window.localStorage.getItem(DISMISS_KEY) === '1'
    updateEnvironment()
    window.addEventListener('resize', updateEnvironment)
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', updateEnvironment)
  })

  onUnmounted(() => {
    if (typeof window === 'undefined') return
    window.removeEventListener('resize', updateEnvironment)
    window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.removeEventListener('appinstalled', updateEnvironment)
  })

  return {
    canShowInstall,
    isStandalone,
    isIosSafari,
    showIosGuide,
    install,
    dismiss,
  }
}
