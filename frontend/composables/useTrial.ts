import { ref } from 'vue'
import { useAuthStore } from '~/stores/auth'

export function useTrial() {
  const auth = useAuthStore()

  const showGuestTrialEndedScreen = ref(false)
  const showProTrialWelcomeModal = ref(false)

  // Called when analyze returns trial_expired error
  function handleGuestTrialExpired() {
    if (!auth.isLoggedIn) {
      showGuestTrialEndedScreen.value = true
    }
  }

  // Called when analyze succeeds and is_first_trial was true
  function handleProTrialConsumed() {
    if (auth.isLoggedIn) {
      showProTrialWelcomeModal.value = true
    }
  }

  function dismissGuestTrialScreen() {
    showGuestTrialEndedScreen.value = false
  }

  function dismissProTrialModal() {
    showProTrialWelcomeModal.value = false
  }

  return {
    showGuestTrialEndedScreen,
    showProTrialWelcomeModal,
    handleGuestTrialExpired,
    handleProTrialConsumed,
    dismissGuestTrialScreen,
    dismissProTrialModal,
  }
}
