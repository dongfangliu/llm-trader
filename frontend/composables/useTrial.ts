import { ref } from 'vue'
import { useAuthStore } from '~/stores/auth'

export function useTrial() {
  const auth = useAuthStore()

  const showGuestTrialEndedScreen = ref(false)
  const showProTrialWelcomeModal = ref(false)
  const showProTrialEndedBanner = ref(false)  // registered users who have used their trial
  const trialActivated = ref(false)           // true from modal confirm until result returns

  // Called when user confirms the ProTrialWelcomeModal ("立即开始体验")
  function activateTrial() {
    trialActivated.value = true
    showProTrialWelcomeModal.value = false
  }

  // Called when analyze returns trial_expired error (belt-and-suspenders for guests)
  function handleGuestTrialExpired() {
    if (!auth.isLoggedIn) {
      showGuestTrialEndedScreen.value = true
    }
  }

  // Called on page load when registered user has already used their trial
  function handleRegisteredTrialExpired() {
    if (auth.isLoggedIn) {
      showProTrialEndedBanner.value = true
    }
  }

  function dismissGuestTrialScreen() {
    showGuestTrialEndedScreen.value = false
  }

  function dismissProTrialEndedBanner() {
    showProTrialEndedBanner.value = false
  }

  return {
    showGuestTrialEndedScreen,
    showProTrialWelcomeModal,
    showProTrialEndedBanner,
    trialActivated,
    activateTrial,
    handleGuestTrialExpired,
    handleRegisteredTrialExpired,
    dismissGuestTrialScreen,
    dismissProTrialEndedBanner,
  }
}
