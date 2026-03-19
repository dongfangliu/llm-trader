import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useAnalysisStore = defineStore('analysis', () => {
  const symbol = ref('')
  const market = ref('a')
  const period = ref('daily')

  function setSymbol(s: string) { symbol.value = s.toUpperCase() }
  function setMarket(m: string) { market.value = m }
  function setPeriod(p: string) { period.value = p }

  return { symbol, market, period, setSymbol, setMarket, setPeriod }
})
