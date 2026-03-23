import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '~/lib/api'

export interface UserOut {
  id: number
  email: string
  is_verified: boolean
  tier: string
  trial_state: string
  has_had_pro_trial: boolean
  is_admin: boolean
  bonus_quota: number
  invite_code?: string
  used_invite_code?: string
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<UserOut | null>(null)
  const token = ref<string | null>(null)
  const initialized = ref(false)

  const isLoggedIn = computed(() => !!token.value && !!user.value)
  const isAdmin = computed(() => user.value?.is_admin === true)
  const tier = computed(() => user.value?.tier || 'free')
  const trialState = computed(() => user.value?.trial_state || 'available')

  function initFromStorage() {
    if (typeof window !== 'undefined') {
      const savedToken = localStorage.getItem('token')
      if (savedToken) {
        token.value = savedToken
      }
    }
  }

  function setToken(newToken: string) {
    token.value = newToken
    if (typeof window !== 'undefined') {
      localStorage.setItem('token', newToken)
    }
  }

  function setUser(newUser: UserOut) {
    user.value = newUser
  }

  async function fetchMe() {
    if (!token.value) return
    try {
      const res = await api.get('/api/auth/me')
      user.value = res.data
    } catch (e: any) {
      if (e.response?.status === 401) {
        logout()
      }
    }
  }

  async function initAuth() {
    initFromStorage()
    if (token.value) {
      await fetchMe()
    }
    initialized.value = true
  }

  async function login(email: string, password: string) {
    const res = await api.post('/api/auth/login', { email, password })
    const { access_token, user: userData } = res.data
    setToken(access_token)
    setUser(userData)
    return userData
  }

  async function register(email: string, password: string, inviteCode?: string) {
    const body: any = { email, password }
    if (inviteCode) body.invite_code = inviteCode
    const res = await api.post('/api/auth/register', body)
    return res.data
  }

  async function verifyEmail(token: string) {
    const res = await api.post('/api/auth/verify-email', { token })
    return res.data
  }

  async function resendVerification(email: string) {
    const res = await api.post('/api/auth/resend-verification', { email })
    return res.data
  }

  function logout() {
    token.value = null
    user.value = null
    if (typeof window !== 'undefined') {
      localStorage.removeItem('token')
    }
  }

  return {
    user, token, isLoggedIn, isAdmin, tier, trialState, initialized,
    initFromStorage, setToken, setUser, fetchMe, initAuth,
    login, register, verifyEmail, resendVerification, logout
  }
})
