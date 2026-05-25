import { ref } from 'vue'
import { useAuthStore } from '~/stores/auth'

export function useTrial() {
  const auth = useAuthStore()

  const showGuestTrialEndedScreen = ref(false)
  const showProTrialWelcomeModal = ref(false)
  const showProTrialEndedBanner = ref(false)  // registered users who have used their trial
  const showProTrialNextSteps = ref(false)    // registered: save-to-home → upgrade, shown once after the pro trial
  const trialActivated = ref(false)           // true from modal confirm until result returns
  // One-shot flag: the result the user is currently viewing IS their trial result.
  // Set when the trial result returns, consumed when the result sheet closes to drive
  // the next guidance step (guest → register/save screen, registered → save/upgrade sheet).
  const postTrialPending = ref(false)

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

  function dismissProTrialNextSteps() {
    showProTrialNextSteps.value = false
  }

  return {
    showGuestTrialEndedScreen,
    showProTrialWelcomeModal,
    showProTrialEndedBanner,
    showProTrialNextSteps,
    trialActivated,
    postTrialPending,
    activateTrial,
    handleGuestTrialExpired,
    handleRegisteredTrialExpired,
    dismissGuestTrialScreen,
    dismissProTrialEndedBanner,
    dismissProTrialNextSteps,
  }
}
