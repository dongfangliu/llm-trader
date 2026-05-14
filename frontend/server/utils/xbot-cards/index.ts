import satori from 'satori'
import { Resvg } from '@resvg/resvg-js'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
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

const _fontCache = new Map<number, ArrayBuffer>()

const FONT_FILES: Record<number, { local: string[]; urls: string[] }> = {
  400: {
    local: [
      'NotoSansSC-Regular.otf',
      'NotoSansSC-Regular.ttf',
      'NotoSansSC.ttf',
      '/usr/share/fonts/noto/NotoSansCJK-Regular.ttc',
      '/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc',
      '/usr/share/fonts/noto-cjk/NotoSansCJKsc-Regular.otf',
      '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
      'C:/Windows/Fonts/Deng.ttf',
      'C:/Windows/Fonts/simhei.ttf',
    ],
    urls: [
      'https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf',
      'https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf',
    ],
  },
  700: {
    local: [
      'NotoSansSC-Bold.otf',
      'NotoSansSC-Bold.ttf',
      '/usr/share/fonts/noto/NotoSansCJK-Bold.ttc',
      '/usr/share/fonts/noto-cjk/NotoSansCJK-Bold.ttc',
      '/usr/share/fonts/noto-cjk/NotoSansCJKsc-Bold.otf',
      '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc',
      'C:/Windows/Fonts/Dengb.ttf',
      'C:/Windows/Fonts/simhei.ttf',
    ],
    urls: [
      'https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Bold.otf',
      'https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Bold.otf',
    ],
  },
  900: {
    local: [
      'NotoSansSC-Black.otf',
      'NotoSansSC-Black.ttf',
      '/usr/share/fonts/noto/NotoSansCJK-Black.ttc',
      '/usr/share/fonts/noto/NotoSansCJK-Bold.ttc',
      '/usr/share/fonts/noto-cjk/NotoSansCJK-Black.ttc',
      '/usr/share/fonts/noto-cjk/NotoSansCJK-Bold.ttc',
      '/usr/share/fonts/noto-cjk/NotoSansCJKsc-Black.otf',
      '/usr/share/fonts/noto-cjk/NotoSansCJKsc-Bold.otf',
      '/usr/share/fonts/opentype/noto/NotoSansCJK-Black.ttc',
      '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc',
      'C:/Windows/Fonts/Dengb.ttf',
      'C:/Windows/Fonts/simhei.ttf',
    ],
    urls: [
      'https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Black.otf',
      'https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Black.otf',
    ],
  },
}

function isUsableFont(data: ArrayBuffer): boolean {
  if (data.byteLength < 1024) return false
  const view = new Uint8Array(data, 0, Math.min(4, data.byteLength))
  const signature = String.fromCharCode(...view)
  return signature === 'OTTO' || signature === 'true' || signature === 'ttcf' || (
    view[0] === 0x00 && view[1] === 0x01 && view[2] === 0x00 && view[3] === 0x00
  )
}

async function loadFont(weight: number): Promise<ArrayBuffer> {
  const cached = _fontCache.get(weight)
  if (cached) return cached

  const spec = FONT_FILES[weight] ?? FONT_FILES[400]
  for (const file of spec.local) {
    const p = isAbsolute(file) ? file : resolve('./public/fonts', file)
    if (existsSync(p) && statSync(p).size > 1024) {
      const buf = readFileSync(p)
      const data = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
      if (!isUsableFont(data)) continue
      _fontCache.set(weight, data)
      return data
    }
  }

  for (const url of spec.urls) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
      if (res.ok) {
        const data = await res.arrayBuffer()
        if (!isUsableFont(data)) continue
        _fontCache.set(weight, data)
        return data
      }
    } catch {
      // try next URL
    }
  }

  if (weight !== 400) return loadFont(400)
  throw new Error('Failed to load NotoSansSC font from local files and CDN. Check network connectivity.')
}

export async function renderCard(payload: CardPayload): Promise<Uint8Array> {
  const variant = payload.variant
  const renderer = RENDERERS[variant]
  if (!renderer) throw new Error(`Unknown card variant: "${variant}"`)

  const { w, h } = DIMS[variant]
  const vnode = renderer(payload)

  const [regular, bold, black] = await Promise.all([loadFont(400), loadFont(700), loadFont(900)])

  const svg = await satori(vnode, {
    width: w,
    height: h,
    fonts: [
      { name: 'NotoSansSC', data: regular, weight: 400, style: 'normal' },
      { name: 'NotoSansSC', data: bold, weight: 700, style: 'normal' },
      { name: 'NotoSansSC', data: black, weight: 900, style: 'normal' },
    ],
  })

  const resvg = new Resvg(svg, { fitTo: { mode: 'original' } })
  return resvg.render().asPng()
}
