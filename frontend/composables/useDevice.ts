import { ref } from 'vue'

let deviceId: string | null = null

export function useDevice() {
  function getDeviceId(): string {
    if (deviceId) return deviceId

    if (typeof window === 'undefined') return ''

    let id = localStorage.getItem('device_id')
    if (!id) {
      // Generate UUID v4
      id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0
        const v = c === 'x' ? r : (r & 0x3 | 0x8)
        return v.toString(16)
      })
      localStorage.setItem('device_id', id)
    }

    deviceId = id
    return id
  }

  return { getDeviceId, deviceId: ref(getDeviceId()) }
}
