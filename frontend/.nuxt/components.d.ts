
import type { DefineComponent, SlotsType } from 'vue'
type IslandComponent<T> = DefineComponent<{}, {refresh: () => Promise<void>}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, SlotsType<{ fallback: { error: unknown } }>> & T

type HydrationStrategies = {
  hydrateOnVisible?: IntersectionObserverInit | true
  hydrateOnIdle?: number | true
  hydrateOnInteraction?: keyof HTMLElementEventMap | Array<keyof HTMLElementEventMap> | true
  hydrateOnMediaQuery?: string
  hydrateAfter?: number
  hydrateWhen?: boolean
  hydrateNever?: true
}
type LazyComponent<T> = DefineComponent<HydrationStrategies, {}, {}, {}, {}, {}, {}, { hydrated: () => void }> & T


export const AnalysisForm: typeof import("../components/analysis/AnalysisForm.vue")['default']
export const AnalysisReadyNotification: typeof import("../components/analysis/AnalysisReadyNotification.vue")['default']
export const AnalysisBackgroundAnalysisIndicator: typeof import("../components/analysis/BackgroundAnalysisIndicator.vue")['default']
export const AnalysisHistorySheet: typeof import("../components/analysis/HistorySheet.vue")['default']
export const AnalysisResultSheet: typeof import("../components/analysis/ResultSheet.vue")['default']
export const AnalysisSharePreviewSheet: typeof import("../components/analysis/SharePreviewSheet.vue")['default']
export const LayoutDesktopLayout: typeof import("../components/layout/DesktopLayout.vue")['default']
export const LayoutDesktopSidebar: typeof import("../components/layout/DesktopSidebar.vue")['default']
export const LayoutMobileLayout: typeof import("../components/layout/MobileLayout.vue")['default']
export const TrialGuestTrialEndedScreen: typeof import("../components/trial/GuestTrialEndedScreen.vue")['default']
export const TrialProTrialEndedBanner: typeof import("../components/trial/ProTrialEndedBanner.vue")['default']
export const TrialProTrialInProgressBanner: typeof import("../components/trial/ProTrialInProgressBanner.vue")['default']
export const TrialProTrialWelcomeModal: typeof import("../components/trial/ProTrialWelcomeModal.vue")['default']
export const UiIosButton: typeof import("../components/ui/IosButton.vue")['default']
export const UiIosCard: typeof import("../components/ui/IosCard.vue")['default']
export const UiIosInput: typeof import("../components/ui/IosInput.vue")['default']
export const UiIosSheet: typeof import("../components/ui/IosSheet.vue")['default']
export const Ui: typeof import("../components/ui/index")['default']
export const XbotCardsXBotCardDataRecord: typeof import("../components/xbot-cards/XBotCardDataRecord.vue")['default']
export const XbotCardsXBotCardPromise: typeof import("../components/xbot-cards/XBotCardPromise.vue")['default']
export const XbotCardsXBotCardProof: typeof import("../components/xbot-cards/XBotCardProof.vue")['default']
export const NuxtWelcome: typeof import("../node_modules/nuxt/dist/app/components/welcome.vue")['default']
export const NuxtLayout: typeof import("../node_modules/nuxt/dist/app/components/nuxt-layout")['default']
export const NuxtErrorBoundary: typeof import("../node_modules/nuxt/dist/app/components/nuxt-error-boundary.vue")['default']
export const ClientOnly: typeof import("../node_modules/nuxt/dist/app/components/client-only")['default']
export const DevOnly: typeof import("../node_modules/nuxt/dist/app/components/dev-only")['default']
export const ServerPlaceholder: typeof import("../node_modules/nuxt/dist/app/components/server-placeholder")['default']
export const NuxtLink: typeof import("../node_modules/nuxt/dist/app/components/nuxt-link")['default']
export const NuxtLoadingIndicator: typeof import("../node_modules/nuxt/dist/app/components/nuxt-loading-indicator")['default']
export const NuxtTime: typeof import("../node_modules/nuxt/dist/app/components/nuxt-time.vue")['default']
export const NuxtRouteAnnouncer: typeof import("../node_modules/nuxt/dist/app/components/nuxt-route-announcer")['default']
export const NuxtImg: typeof import("../node_modules/nuxt/dist/app/components/nuxt-stubs")['NuxtImg']
export const NuxtPicture: typeof import("../node_modules/nuxt/dist/app/components/nuxt-stubs")['NuxtPicture']
export const NuxtPage: typeof import("../node_modules/nuxt/dist/pages/runtime/page")['default']
export const NoScript: typeof import("../node_modules/nuxt/dist/head/runtime/components")['NoScript']
export const Link: typeof import("../node_modules/nuxt/dist/head/runtime/components")['Link']
export const Base: typeof import("../node_modules/nuxt/dist/head/runtime/components")['Base']
export const Title: typeof import("../node_modules/nuxt/dist/head/runtime/components")['Title']
export const Meta: typeof import("../node_modules/nuxt/dist/head/runtime/components")['Meta']
export const Style: typeof import("../node_modules/nuxt/dist/head/runtime/components")['Style']
export const Head: typeof import("../node_modules/nuxt/dist/head/runtime/components")['Head']
export const Html: typeof import("../node_modules/nuxt/dist/head/runtime/components")['Html']
export const Body: typeof import("../node_modules/nuxt/dist/head/runtime/components")['Body']
export const NuxtIsland: typeof import("../node_modules/nuxt/dist/app/components/nuxt-island")['default']
export const LazyAnalysisForm: LazyComponent<typeof import("../components/analysis/AnalysisForm.vue")['default']>
export const LazyAnalysisReadyNotification: LazyComponent<typeof import("../components/analysis/AnalysisReadyNotification.vue")['default']>
export const LazyAnalysisBackgroundAnalysisIndicator: LazyComponent<typeof import("../components/analysis/BackgroundAnalysisIndicator.vue")['default']>
export const LazyAnalysisHistorySheet: LazyComponent<typeof import("../components/analysis/HistorySheet.vue")['default']>
export const LazyAnalysisResultSheet: LazyComponent<typeof import("../components/analysis/ResultSheet.vue")['default']>
export const LazyAnalysisSharePreviewSheet: LazyComponent<typeof import("../components/analysis/SharePreviewSheet.vue")['default']>
export const LazyLayoutDesktopLayout: LazyComponent<typeof import("../components/layout/DesktopLayout.vue")['default']>
export const LazyLayoutDesktopSidebar: LazyComponent<typeof import("../components/layout/DesktopSidebar.vue")['default']>
export const LazyLayoutMobileLayout: LazyComponent<typeof import("../components/layout/MobileLayout.vue")['default']>
export const LazyTrialGuestTrialEndedScreen: LazyComponent<typeof import("../components/trial/GuestTrialEndedScreen.vue")['default']>
export const LazyTrialProTrialEndedBanner: LazyComponent<typeof import("../components/trial/ProTrialEndedBanner.vue")['default']>
export const LazyTrialProTrialInProgressBanner: LazyComponent<typeof import("../components/trial/ProTrialInProgressBanner.vue")['default']>
export const LazyTrialProTrialWelcomeModal: LazyComponent<typeof import("../components/trial/ProTrialWelcomeModal.vue")['default']>
export const LazyUiIosButton: LazyComponent<typeof import("../components/ui/IosButton.vue")['default']>
export const LazyUiIosCard: LazyComponent<typeof import("../components/ui/IosCard.vue")['default']>
export const LazyUiIosInput: LazyComponent<typeof import("../components/ui/IosInput.vue")['default']>
export const LazyUiIosSheet: LazyComponent<typeof import("../components/ui/IosSheet.vue")['default']>
export const LazyUi: LazyComponent<typeof import("../components/ui/index")['default']>
export const LazyXbotCardsXBotCardDataRecord: LazyComponent<typeof import("../components/xbot-cards/XBotCardDataRecord.vue")['default']>
export const LazyXbotCardsXBotCardPromise: LazyComponent<typeof import("../components/xbot-cards/XBotCardPromise.vue")['default']>
export const LazyXbotCardsXBotCardProof: LazyComponent<typeof import("../components/xbot-cards/XBotCardProof.vue")['default']>
export const LazyNuxtWelcome: LazyComponent<typeof import("../node_modules/nuxt/dist/app/components/welcome.vue")['default']>
export const LazyNuxtLayout: LazyComponent<typeof import("../node_modules/nuxt/dist/app/components/nuxt-layout")['default']>
export const LazyNuxtErrorBoundary: LazyComponent<typeof import("../node_modules/nuxt/dist/app/components/nuxt-error-boundary.vue")['default']>
export const LazyClientOnly: LazyComponent<typeof import("../node_modules/nuxt/dist/app/components/client-only")['default']>
export const LazyDevOnly: LazyComponent<typeof import("../node_modules/nuxt/dist/app/components/dev-only")['default']>
export const LazyServerPlaceholder: LazyComponent<typeof import("../node_modules/nuxt/dist/app/components/server-placeholder")['default']>
export const LazyNuxtLink: LazyComponent<typeof import("../node_modules/nuxt/dist/app/components/nuxt-link")['default']>
export const LazyNuxtLoadingIndicator: LazyComponent<typeof import("../node_modules/nuxt/dist/app/components/nuxt-loading-indicator")['default']>
export const LazyNuxtTime: LazyComponent<typeof import("../node_modules/nuxt/dist/app/components/nuxt-time.vue")['default']>
export const LazyNuxtRouteAnnouncer: LazyComponent<typeof import("../node_modules/nuxt/dist/app/components/nuxt-route-announcer")['default']>
export const LazyNuxtImg: LazyComponent<typeof import("../node_modules/nuxt/dist/app/components/nuxt-stubs")['NuxtImg']>
export const LazyNuxtPicture: LazyComponent<typeof import("../node_modules/nuxt/dist/app/components/nuxt-stubs")['NuxtPicture']>
export const LazyNuxtPage: LazyComponent<typeof import("../node_modules/nuxt/dist/pages/runtime/page")['default']>
export const LazyNoScript: LazyComponent<typeof import("../node_modules/nuxt/dist/head/runtime/components")['NoScript']>
export const LazyLink: LazyComponent<typeof import("../node_modules/nuxt/dist/head/runtime/components")['Link']>
export const LazyBase: LazyComponent<typeof import("../node_modules/nuxt/dist/head/runtime/components")['Base']>
export const LazyTitle: LazyComponent<typeof import("../node_modules/nuxt/dist/head/runtime/components")['Title']>
export const LazyMeta: LazyComponent<typeof import("../node_modules/nuxt/dist/head/runtime/components")['Meta']>
export const LazyStyle: LazyComponent<typeof import("../node_modules/nuxt/dist/head/runtime/components")['Style']>
export const LazyHead: LazyComponent<typeof import("../node_modules/nuxt/dist/head/runtime/components")['Head']>
export const LazyHtml: LazyComponent<typeof import("../node_modules/nuxt/dist/head/runtime/components")['Html']>
export const LazyBody: LazyComponent<typeof import("../node_modules/nuxt/dist/head/runtime/components")['Body']>
export const LazyNuxtIsland: LazyComponent<typeof import("../node_modules/nuxt/dist/app/components/nuxt-island")['default']>

export const componentNames: string[]
