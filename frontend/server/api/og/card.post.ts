import { renderCard } from '~/server/utils/xbot-cards/index'
import type { CardPayload } from '~/server/utils/xbot-cards/types'

export default defineEventHandler(async (event) => {
  const body = await readBody<CardPayload>(event)

  if (!body?.variant) {
    throw createError({ statusCode: 400, message: 'Missing required field: variant' })
  }

  try {
    const png = await renderCard(body)
    setResponseHeader(event, 'Content-Type', 'image/png')
    setResponseHeader(event, 'Cache-Control', 'no-store')
    return png
  } catch (err: any) {
    throw createError({ statusCode: 500, message: err.message ?? 'Card generation failed' })
  }
})
