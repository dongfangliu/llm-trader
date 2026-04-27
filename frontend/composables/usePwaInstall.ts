import { computed, onMounted, onUnmounted, ref } from 'vue'

const DISMISS_KEY = 'pwaInstallDismissed'
const DISMISS_DAYS = 7
const DISMISS_TTL = DISMISS_DAYS * 24 * 60 * 60 * 1000

type InstallGuideKind =
  | 'ios-safari'
  | 'ios-other'
  | 'wechat'
  | 'android-browser'
  | 'desktop-browser'

function readDismissed() {
  if (typeof window === 'undefined') return false
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY)
    if (!raw) return false
    const dismissedAt = Number(raw)
    return Number.isFinite(dismissedAt) && Date.now() - dismissedAt < DISMISS_TTL
  } catch {
    return false
  }
}

export function usePwaInstall() {
  const deferredPrompt = ref<any | null>(null)
  const isMobile = ref(false)
  const isIos = ref(false)
  const isAndroid = ref(false)
  const isStandalone = ref(false)
  const isIosSafari = ref(false)
  const isWeChat = ref(false)
  const isDismissed = ref(false)
  const showIosGuide = ref(false)
  const showInstallGuide = ref(false)
  const installGuideKind = ref<InstallGuideKind>('desktop-browser')

  function updateEnvironment() {
    if (typeof window === 'undefined') return
    const ua = window.navigator.userAgent
    isIos.value = /iphone|ipad|ipod/i.test(ua)
    isAndroid.value = /android/i.test(ua)
    isWeChat.value = /micromessenger/i.test(ua)
    isMobile.value = isIos.value || isAndroid.value || /mobile/i.test(ua) || window.innerWidth < 768
    isStandalone.value =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true
    isIosSafari.value =
      isIos.value &&
      /safari/i.test(ua) &&
      !/crios|fxios|edgios|opr|micromessenger/i.test(ua)
  }

  function onBeforeInstallPrompt(event: Event) {
    event.preventDefault()
    deferredPrompt.value = event
  }

  const canNativeInstall = computed(() => !!deferredPrompt.value)

  const canShowInstall = computed(() =>
    !isStandalone.value &&
    !isDismissed.value
  )

  function guideKind(): InstallGuideKind {
    if (isWeChat.value) return 'wechat'
    if (isIosSafari.value) return 'ios-safari'
    if (isIos.value) return 'ios-other'
    if (isAndroid.value || isMobile.value) return 'android-browser'
    return 'desktop-browser'
  }

  async function install() {
    if (deferredPrompt.value) {
      const promptEvent = deferredPrompt.value
      deferredPrompt.value = null
      await promptEvent.prompt()
      await promptEvent.userChoice.catch(() => null)
      updateEnvironment()
      return
    }
    installGuideKind.value = guideKind()
    showIosGuide.value = installGuideKind.value === 'ios-safari'
    showInstallGuide.value = installGuideKind.value !== 'ios-safari'
  }

  function dismiss() {
    isDismissed.value = true
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()))
    }
  }

  onMounted(() => {
    isDismissed.value = readDismissed()
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
    canNativeInstall,
    isStandalone,
    isIosSafari,
    installGuideKind,
    showIosGuide,
    showInstallGuide,
    install,
    dismiss,
  }
}
