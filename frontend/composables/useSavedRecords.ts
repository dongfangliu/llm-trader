import { ref } from 'vue'

interface SavedRecord {
  id: string
  historyId?: string
  symbol: string
  market: string
  period: string
  savedAt: string
  result: any
}

const STORAGE_KEY = 'saved_records'

export function useSavedRecords() {
  const savedRecords = ref<SavedRecord[]>([])

  function loadSaved() {
    if (typeof window === 'undefined') return
    try {
      const data = localStorage.getItem(STORAGE_KEY)
      savedRecords.value = data ? JSON.parse(data) : []
    } catch {
      savedRecords.value = []
    }
  }

  function saveRecord(record: Omit<SavedRecord, 'id' | 'savedAt'>) {
    const newRecord: SavedRecord = {
      ...record,
      id: Date.now().toString(),
      savedAt: new Date().toISOString(),
    }
    savedRecords.value.unshift(newRecord)
    if (savedRecords.value.length > 100) {
      savedRecords.value = savedRecords.value.slice(0, 100)
    }
    persistSaved()
    return newRecord
  }

  function deleteRecord(id: string) {
    savedRecords.value = savedRecords.value.filter(r => r.id !== id)
    persistSaved()
  }

  function persistSaved() {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(savedRecords.value))
    }
  }

  function isSaved(historyId: string): boolean {
    return savedRecords.value.some(r => r.historyId === historyId || r.id === historyId)
  }

  return { savedRecords, loadSaved, saveRecord, deleteRecord, isSaved }
}
