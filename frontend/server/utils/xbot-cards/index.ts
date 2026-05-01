import satori from 'satori'
import { Resvg } from '@resvg/resvg-js'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { CardPayload } from './types'
import { renderPromise } from './variants/promise'
import { renderProof } from './variants/proof'
import { renderDataRecord } from './variants/data_record'
import { renderSummary } from './variants/summary'

const DIMS: Record<string, { w: number; h: number }> = {
  promise:     { w: 1080, h: 1350 },
  proof:       { w: 1080, h: 1350 },
  data_record: { w: 1080, h: 1080 },
  summary:     { w: 1080, h: 1350 },
}

const RENDERERS: Record<string, (p: CardPayload) => any> = {
  promise:     renderPromise,
  proof:       renderProof,
  data_record: renderDataRecord,
  summary:     renderSummary,
}

let _fontCache: ArrayBuffer | null = null

// Candidate CDN URLs for NotoSansSC TTF (tried in order, first success wins)
const FONT_URLS = [
  'https://cdn.jsdelivr.net/gh/notofonts/notofonts.github.io/fonts/NotoSansSC/hinted/ttf/NotoSansSC-Regular.ttf',
  'https://github.com/notofonts/noto-cjk/raw/main/Sans/SubsetOTF/SC/NotoSansSC-Regular.otf',
]

async function loadFont(): Promise<ArrayBuffer> {
  if (_fontCache) return _fontCache

  // 1. Try local file first
  const localPaths = [
    resolve('./public/fonts/NotoSansSC-Regular.ttf'),
    resolve('./public/fonts/NotoSansSC.ttf'),
  ]
  for (const p of localPaths) {
    if (existsSync(p)) {
      const buf = readFileSync(p)
      _fontCache = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
      return _fontCache
    }
  }

  // 2. Download from CDN
  for (const url of FONT_URLS) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
      if (res.ok) {
        _fontCache = await res.arrayBuffer()
        return _fontCache
      }
    } catch {
      // try next URL
    }
  }

  throw new Error('Failed to load NotoSansSC font from both local paths and CDN. Check network connectivity.')
}

export async function renderCard(payload: CardPayload): Promise<Uint8Array> {
  const variant = payload.variant
  const renderer = RENDERERS[variant]
  if (!renderer) throw new Error(`Unknown card variant: "${variant}"`)

  const { w, h } = DIMS[variant]
  const vnode = renderer(payload)

  const fontData = await loadFont()

  const svg = await satori(vnode, {
    width: w,
    height: h,
    fonts: [{ name: 'NotoSansSC', data: fontData, weight: 400, style: 'normal' }],
  })

  const resvg = new Resvg(svg, { fitTo: { mode: 'original' } })
  return resvg.render().asPng()
}
