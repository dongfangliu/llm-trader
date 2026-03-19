import { ref } from 'vue'
import api from '~/lib/api'

export function useHistory() {
  const history = ref<any[]>([])
  const total = ref(0)
  const page = ref(1)
  const hasMore = ref(false)
  const loading = ref(false)

  async function fetchHistory(pageNum = 1, perPage = 20) {
    loading.value = true
    try {
      const res = await api.get('/api/analyze/history', {
        params: { page: pageNum, per_page: perPage }
      })
      const data = res.data
      if (pageNum === 1) {
        history.value = data.items || []
      } else {
        history.value.push(...(data.items || []))
      }
      total.value = data.total || 0
      page.value = pageNum
      hasMore.value = history.value.length < total.value
    } catch (e) {
      console.error('Failed to fetch history:', e)
    } finally {
      loading.value = false
    }
  }

  async function loadMore() {
    if (!hasMore.value || loading.value) return
    await fetchHistory(page.value + 1)
  }

  async function deleteItem(id: number) {
    try {
      await api.delete(`/api/analyze/history/${id}`)
      history.value = history.value.filter(item => item.id !== id)
      total.value = Math.max(0, total.value - 1)
    } catch (e) {
      console.error('Failed to delete history item:', e)
    }
  }

  async function toggleFavorite(id: number) {
    try {
      await api.post(`/api/analyze/history/${id}/favorite`)
      const item = history.value.find(h => h.id === id)
      if (item) {
        item.is_favorited = !item.is_favorited
      }
    } catch (e) {
      console.error('Failed to toggle favorite:', e)
    }
  }

  return { history, total, page, hasMore, loading, fetchHistory, loadMore, deleteItem, toggleFavorite }
}
