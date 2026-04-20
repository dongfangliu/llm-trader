
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

interface _GlobalComponents {
  AnalysisForm: typeof import("../../components/analysis/AnalysisForm.vue")['default']
  AnalysisReadyNotification: typeof import("../../components/analysis/AnalysisReadyNotification.vue")['default']
  AnalysisBackgroundAnalysisIndicator: typeof import("../../components/analysis/BackgroundAnalysisIndicator.vue")['default']
  AnalysisHistorySheet: typeof import("../../components/analysis/HistorySheet.vue")['default']
  AnalysisResultSheet: typeof import("../../components/analysis/ResultSheet.vue")['default']
  AnalysisSharePreviewSheet: typeof import("../../components/analysis/SharePreviewSheet.vue")['default']
  LayoutDesktopLayout: typeof import("../../components/layout/DesktopLayout.vue")['default']
  LayoutDesktopSidebar: typeof import("../../components/layout/DesktopSidebar.vue")['default']
  LayoutMobileLayout: typeof import("../../components/layout/MobileLayout.vue")['default']
  TrialGuestTrialEndedScreen: typeof import("../../components/trial/GuestTrialEndedScreen.vue")['default']
  TrialProTrialEndedBanner: typeof import("../../components/trial/ProTrialEndedBanner.vue")['default']
  TrialProTrialInProgressBanner: typeof import("../../components/trial/ProTrialInProgressBanner.vue")['default']
  TrialProTrialWelcomeModal: typeof import("../../components/trial/ProTrialWelcomeModal.vue")['default']
  UiIosButton: typeof import("../../components/ui/IosButton.vue")['default']
  UiIosCard: typeof import("../../components/ui/IosCard.vue")['default']
  UiIosInput: typeof import("../../components/ui/IosInput.vue")['default']
  UiIosSheet: typeof import("../../components/ui/IosSheet.vue")['default']
  Ui: typeof import("../../components/ui/index")['default']
  XbotCardsXBotCardDataRecord: typeof import("../../components/xbot-cards/XBotCardDataRecord.vue")['default']
  XbotCardsXBotCardPromise: typeof import("../../components/xbot-cards/XBotCardPromise.vue")['default']
  XbotCardsXBotCardProof: typeof import("../../components/xbot-cards/XBotCardProof.vue")['default']
  NuxtWelcome: typeof import("../../node_modules/nuxt/dist/app/components/welcome.vue")['default']
  NuxtLayout: typeof import("../../node_modules/nuxt/dist/app/components/nuxt-layout")['default']
  NuxtErrorBoundary: typeof import("../../node_modules/nuxt/dist/app/components/nuxt-error-boundary.vue")['default']
  ClientOnly: typeof import("../../node_modules/nuxt/dist/app/components/client-only")['default']
  DevOnly: typeof import("../../node_modules/nuxt/dist/app/components/dev-only")['default']
  ServerPlaceholder: typeof import("../../node_modules/nuxt/dist/app/components/server-placeholder")['default']
  NuxtLink: typeof import("../../node_modules/nuxt/dist/app/components/nuxt-link")['default']
  NuxtLoadingIndicator: typeof import("../../node_modules/nuxt/dist/app/components/nuxt-loading-indicator")['default']
  NuxtTime: typeof import("../../node_modules/nuxt/dist/app/components/nuxt-time.vue")['default']
  NuxtRouteAnnouncer: typeof import("../../node_modules/nuxt/dist/app/components/nuxt-route-announcer")['default']
  NuxtImg: typeof import("../../node_modules/nuxt/dist/app/components/nuxt-stubs")['NuxtImg']
  NuxtPicture: typeof import("../../node_modules/nuxt/dist/app/components/nuxt-stubs")['NuxtPicture']
  NuxtPage: typeof import("../../node_modules/nuxt/dist/pages/runtime/page")['default']
  NoScript: typeof import("../../node_modules/nuxt/dist/head/runtime/components")['NoScript']
  Link: typeof import("../../node_modules/nuxt/dist/head/runtime/components")['Link']
  Base: typeof import("../../node_modules/nuxt/dist/head/runtime/components")['Base']
  Title: typeof import("../../node_modules/nuxt/dist/head/runtime/components")['Title']
  Meta: typeof import("../../node_modules/nuxt/dist/head/runtime/components")['Meta']
  Style: typeof import("../../node_modules/nuxt/dist/head/runtime/components")['Style']
  Head: typeof import("../../node_modules/nuxt/dist/head/runtime/components")['Head']
  Html: typeof import("../../node_modules/nuxt/dist/head/runtime/components")['Html']
  Body: typeof import("../../node_modules/nuxt/dist/head/runtime/components")['Body']
  NuxtIsland: typeof import("../../node_modules/nuxt/dist/app/components/nuxt-island")['default']
  LazyAnalysisForm: LazyComponent<typeof import("../../components/analysis/AnalysisForm.vue")['default']>
  LazyAnalysisReadyNotification: LazyComponent<typeof import("../../components/analysis/AnalysisReadyNotification.vue")['default']>
  LazyAnalysisBackgroundAnalysisIndicator: LazyComponent<typeof import("../../components/analysis/BackgroundAnalysisIndicator.vue")['default']>
  LazyAnalysisHistorySheet: LazyComponent<typeof import("../../components/analysis/HistorySheet.vue")['default']>
  LazyAnalysisResultSheet: LazyComponent<typeof import("../../components/analysis/ResultSheet.vue")['default']>
  LazyAnalysisSharePreviewSheet: LazyComponent<typeof import("../../components/analysis/SharePreviewSheet.vue")['default']>
  LazyLayoutDesktopLayout: LazyComponent<typeof import("../../components/layout/DesktopLayout.vue")['default']>
  LazyLayoutDesktopSidebar: LazyComponent<typeof import("../../components/layout/DesktopSidebar.vue")['default']>
  LazyLayoutMobileLayout: LazyComponent<typeof import("../../components/layout/MobileLayout.vue")['default']>
  LazyTrialGuestTrialEndedScreen: LazyComponent<typeof import("../../components/trial/GuestTrialEndedScreen.vue")['default']>
  LazyTrialProTrialEndedBanner: LazyComponent<typeof import("../../components/trial/ProTrialEndedBanner.vue")['default']>
  LazyTrialProTrialInProgressBanner: LazyComponent<typeof import("../../components/trial/ProTrialInProgressBanner.vue")['default']>
  LazyTrialProTrialWelcomeModal: LazyComponent<typeof import("../../components/trial/ProTrialWelcomeModal.vue")['default']>
  LazyUiIosButton: LazyComponent<typeof import("../../components/ui/IosButton.vue")['default']>
  LazyUiIosCard: LazyComponent<typeof import("../../components/ui/IosCard.vue")['default']>
  LazyUiIosInput: LazyComponent<typeof import("../../components/ui/IosInput.vue")['default']>
  LazyUiIosSheet: LazyComponent<typeof import("../../components/ui/IosSheet.vue")['default']>
  LazyUi: LazyComponent<typeof import("../../components/ui/index")['default']>
  LazyXbotCardsXBotCardDataRecord: LazyComponent<typeof import("../../components/xbot-cards/XBotCardDataRecord.vue")['default']>
  LazyXbotCardsXBotCardPromise: LazyComponent<typeof import("../../components/xbot-cards/XBotCardPromise.vue")['default']>
  LazyXbotCardsXBotCardProof: LazyComponent<typeof import("../../components/xbot-cards/XBotCardProof.vue")['default']>
  LazyNuxtWelcome: LazyComponent<typeof import("../../node_modules/nuxt/dist/app/components/welcome.vue")['default']>
  LazyNuxtLayout: LazyComponent<typeof import("../../node_modules/nuxt/dist/app/components/nuxt-layout")['default']>
  LazyNuxtErrorBoundary: LazyComponent<typeof import("../../node_modules/nuxt/dist/app/components/nuxt-error-boundary.vue")['default']>
  LazyClientOnly: LazyComponent<typeof import("../../node_modules/nuxt/dist/app/components/client-only")['default']>
  LazyDevOnly: LazyComponent<typeof import("../../node_modules/nuxt/dist/app/components/dev-only")['default']>
  LazyServerPlaceholder: LazyComponent<typeof import("../../node_modules/nuxt/dist/app/components/server-placeholder")['default']>
  LazyNuxtLink: LazyComponent<typeof import("../../node_modules/nuxt/dist/app/components/nuxt-link")['default']>
  LazyNuxtLoadingIndicator: LazyComponent<typeof import("../../node_modules/nuxt/dist/app/components/nuxt-loading-indicator")['default']>
  LazyNuxtTime: LazyComponent<typeof import("../../node_modules/nuxt/dist/app/components/nuxt-time.vue")['default']>
  LazyNuxtRouteAnnouncer: LazyComponent<typeof import("../../node_modules/nuxt/dist/app/components/nuxt-route-announcer")['default']>
  LazyNuxtImg: LazyComponent<typeof import("../../node_modules/nuxt/dist/app/components/nuxt-stubs")['NuxtImg']>
  LazyNuxtPicture: LazyComponent<typeof import("../../node_modules/nuxt/dist/app/components/nuxt-stubs")['NuxtPicture']>
  LazyNuxtPage: LazyComponent<typeof import("../../node_modules/nuxt/dist/pages/runtime/page")['default']>
  LazyNoScript: LazyComponent<typeof import("../../node_modules/nuxt/dist/head/runtime/components")['NoScript']>
  LazyLink: LazyComponent<typeof import("../../node_modules/nuxt/dist/head/runtime/components")['Link']>
  LazyBase: LazyComponent<typeof import("../../node_modules/nuxt/dist/head/runtime/components")['Base']>
  LazyTitle: LazyComponent<typeof import("../../node_modules/nuxt/dist/head/runtime/components")['Title']>
  LazyMeta: LazyComponent<typeof import("../../node_modules/nuxt/dist/head/runtime/components")['Meta']>
  LazyStyle: LazyComponent<typeof import("../../node_modules/nuxt/dist/head/runtime/components")['Style']>
  LazyHead: LazyComponent<typeof import("../../node_modules/nuxt/dist/head/runtime/components")['Head']>
  LazyHtml: LazyComponent<typeof import("../../node_modules/nuxt/dist/head/runtime/components")['Html']>
  LazyBody: LazyComponent<typeof import("../../node_modules/nuxt/dist/head/runtime/components")['Body']>
  LazyNuxtIsland: LazyComponent<typeof import("../../node_modules/nuxt/dist/app/components/nuxt-island")['default']>
}

declare module 'vue' {
  export interface GlobalComponents extends _GlobalComponents { }
}

export {}
