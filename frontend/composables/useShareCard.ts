import { ref, type Ref } from 'vue'

type MaybeFn<T> = T | (() => T)

interface ShareSpec {
  /** PNG endpoint URL */
  url: MaybeFn<string>
  /** download filename used in the <a download> fallback */
  filename: MaybeFn<string>
  /** title passed to navigator.share */
  title?: MaybeFn<string>
  /** descriptive text passed to navigator.share */
  text?: MaybeFn<string>
  /** canonical page URL passed to navigator.share */
  shareUrl?: MaybeFn<string>
  /** optional callback when user explicitly cancels (AbortError) */
  onCancel?: () => void
  /** optional callback on unrecoverable error */
  onError?: (err: unknown) => void
  /** optional callback on success */
  onSuccess?: () => void
}

interface ShareResult {
  share: () => Promise<void>
  downloading: Ref<boolean>
}

function readMaybe<T>(v: MaybeFn<T> | undefined): T | undefined {
  if (typeof v === 'function') return (v as () => T)()
  return v
}

/**
 * 拉取 PNG → 优先 navigator.share({ files })，失败则 fallback 为 <a download>。
 * 失败/取消时仅触发回调，不抛异常给调用方（外部 toast 由调用方决定）。
 */
export function useShareCard(spec: ShareSpec): ShareResult {
  const downloading = ref(false)

  async function share() {
    if (downloading.value) return
    downloading.value = true
    try {
      const url = readMaybe(spec.url) || ''
      const filename = readMaybe(spec.filename) || 'card.png'
      if (!url) throw new Error('share URL missing')

      const res = await fetch(url, { credentials: 'omit' })
      if (!res.ok) throw new Error(`fetch failed: ${res.status}`)
      const blob = await res.blob()

      // 试 navigator.share with files
      try {
        const file = new File([blob], filename, { type: blob.type || 'image/png' })
        const nav: any = typeof navigator !== 'undefined' ? navigator : null
        if (nav?.canShare?.({ files: [file] }) && nav?.share) {
          await nav.share({
            files: [file],
            title: readMaybe(spec.title),
            text: readMaybe(spec.text),
            url: readMaybe(spec.shareUrl),
          })
          spec.onSuccess?.()
          return
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          spec.onCancel?.()
          return
        }
        // 否则继续走下载兜底
      }

      // 兜底：<a download>
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = filename
      a.rel = 'noopener'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
      spec.onSuccess?.()
    } catch (err) {
      spec.onError?.(err)
    } finally {
      downloading.value = false
    }
  }

  return { share, downloading }
}
