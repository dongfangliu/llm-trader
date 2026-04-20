import satori from 'satori'
import { Resvg } from '@resvg/resvg-js'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { CardPayload } from './types'
import { renderPromise } from './variants/promise'
import { renderProof } from './variants/proof'
import { renderDataRecord } from './variants/data_record'

const DIMS: Record<string, { w: number; h: number }> = {
  promise:     { w: 1080, h: 1350 },
  proof:       { w: 1080, h: 1350 },
  data_record: { w: 1080, h: 1080 },
}

const RENDERERS: Record<string, (p: CardPayload) => any> = {
  promise:     renderPromise,
  proof:       renderProof,
  data_record: renderDataRecord,
}

let _fontCache: ArrayBuffer | null = null

function loadFont(): ArrayBuffer {
  if (_fontCache) return _fontCache
  const paths = [
    resolve('./public/fonts/NotoSansSC-Regular.ttf'),
    resolve('./public/fonts/NotoSansSC.ttf'),
  ]
  for (const p of paths) {
    if (existsSync(p)) {
      const buf = readFileSync(p)
      _fontCache = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
      return _fontCache
    }
  }
  throw new Error(
    'Missing font for XBot card generation.\n' +
    'Please place NotoSansSC-Regular.ttf in frontend/public/fonts/\n' +
    'Download: https://fonts.google.com/noto/specimen/Noto+Sans+SC'
  )
}

export async function renderCard(payload: CardPayload): Promise<Uint8Array> {
  const variant = payload.variant
  const renderer = RENDERERS[variant]
  if (!renderer) throw new Error(`Unknown card variant: "${variant}"`)

  const { w, h } = DIMS[variant]
  const vnode = renderer(payload)

  let fontData: ArrayBuffer
  try {
    fontData = loadFont()
  } catch (e: any) {
    throw new Error(e.message)
  }

  const svg = await satori(vnode, {
    width: w,
    height: h,
    fonts: [{ name: 'NotoSansSC', data: fontData, weight: 400, style: 'normal' }],
  })

  const resvg = new Resvg(svg, { fitTo: { mode: 'original' } })
  return resvg.render().asPng()
}
