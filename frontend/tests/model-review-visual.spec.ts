import { expect, test, type Page } from '@playwright/test'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '..', '..')
const screenshotDir = path.resolve(currentDir, '..', 'test-results', 'model-review')
const seedPath = path.join(screenshotDir, 'seed.json')

type SeedRecord = {
  id: number
  symbol: string
  market: string
  status: string
  prediction_date: string
  admin_path: string
  public_detail_path: string
  public_symbol_path: string
}

function readDotEnv() {
  const envPath = path.join(repoRoot, '.env')
  const parsed: Record<string, string> = {}
  if (!existsSync(envPath)) return parsed
  for (const rawLine of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const idx = line.indexOf('=')
    if (idx < 1) continue
    parsed[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
  }
  return parsed
}

function seedRecords(): SeedRecord[] {
  const payload = JSON.parse(readFileSync(seedPath, 'utf8'))
  return payload.records
}

function adminToken() {
  const env = readDotEnv()
  return process.env.ADMIN_TOKEN || env.ADMIN_TOKEN || ''
}

async function attachAdminToken(page: Page) {
  const token = adminToken()
  expect(token, 'ADMIN_TOKEN must be present in root .env or process env').not.toEqual('')
  await page.addInitScript(value => {
    window.localStorage.setItem('admin_token', value)
  }, token)
}

function collectConsoleErrors(page: Page) {
  const errors: string[] = []
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', err => errors.push(err.message))
  return errors
}

async function expectNoHorizontalScroll(page: Page) {
  const hasOverflow = await page.evaluate(() => {
    const doc = document.documentElement
    const body = document.body
    return doc.scrollWidth > doc.clientWidth + 2 || body.scrollWidth > body.clientWidth + 2
  })
  expect(hasOverflow).toBe(false)
}

async function expectImageLoaded(page: Page, selector: string) {
  await page.waitForSelector(selector, { state: 'visible' })
  await page.waitForFunction((value) => {
    const img = document.querySelector(value) as HTMLImageElement | null
    return Boolean(img?.complete && img.naturalWidth > 20 && img.naturalHeight > 20)
  }, selector, { timeout: 30_000 })
}

async function capture(
  page: Page,
  name: string,
  pathname: string,
  viewport: { width: number; height: number },
  waitForText: string,
  imageSelector?: string,
) {
  mkdirSync(screenshotDir, { recursive: true })
  await page.setViewportSize(viewport)
  await page.goto(pathname, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
  await expect(page.locator('body')).toContainText(waitForText)
  if (imageSelector) await expectImageLoaded(page, imageSelector)
  await expectNoHorizontalScroll(page)
  await page.screenshot({
    path: path.join(screenshotDir, `${name}-${viewport.width < 700 ? 'mobile' : 'desktop'}.png`),
    fullPage: true,
  })
}

test.describe('model review visual workflow', () => {
  test.beforeEach(async ({ page }) => {
    await attachAdminToken(page)
  })

  test('admin workflow desktop and mobile', async ({ page }) => {
    const errors = collectConsoleErrors(page)
    await capture(page, 'admin-workflow', '/admin/model-review', { width: 1440, height: 1000 }, '澜石科技')
    await expect(page.getByRole('button', { name: /扫描候选/ })).toBeVisible()
    await expect(page.getByText('待审核').first()).toBeVisible()
    await capture(page, 'admin-workflow', '/admin/model-review', { width: 390, height: 844 }, '澜石科技')
    expect(errors).toEqual([])
  })

  test('admin detail review desk renders png preview', async ({ page }) => {
    const errors = collectConsoleErrors(page)
    const pending = seedRecords().find(r => r.status === 'pending')!
    await capture(page, 'admin-detail', pending.admin_path, { width: 1440, height: 1050 }, '完整审核', '.mr-png-preview')
    await expect(page.getByRole('button', { name: /通过审核/ })).toBeVisible()
    await capture(page, 'admin-detail', pending.admin_path, { width: 390, height: 900 }, '完整审核', '.mr-png-preview')
    expect(errors).toEqual([])
  })

  test('card preview workbench renders card frames', async ({ page }) => {
    const errors = collectConsoleErrors(page)
    await capture(page, 'card-preview', '/admin/xbot-card-preview', { width: 1440, height: 1000 }, '模型复盘卡片工作台')
    await expect(page.locator('.mr-card-frame').first()).toBeVisible()
    await capture(page, 'card-preview', '/admin/xbot-card-preview', { width: 390, height: 844 }, '模型复盘卡片工作台')
    await expect(page.locator('.mr-card-frame').first()).toBeVisible()
    expect(errors).toEqual([])
  })

  test('public research archive pages render', async ({ page }) => {
    const errors = collectConsoleErrors(page)
    const hit = seedRecords().find(r => r.status === 'settled' && r.symbol === 'VSHIT')!
    await capture(page, 'public-list', '/research', { width: 1440, height: 1000 }, '青岭能源')
    await expect(page.getByText('青岭能源').first()).toBeVisible()
    await capture(page, 'public-list', '/research', { width: 390, height: 844 }, '青岭能源')
    await capture(page, 'public-symbol', hit.public_symbol_path, { width: 1440, height: 1000 }, '青岭能源')
    await capture(page, 'public-symbol', hit.public_symbol_path, { width: 390, height: 844 }, '青岭能源')
    expect(errors).toEqual([])
  })

  test('public research detail renders card image and result state', async ({ page }) => {
    const errors = collectConsoleErrors(page)
    const hit = seedRecords().find(r => r.status === 'settled' && r.symbol === 'VSHIT')!
    await capture(page, 'public-detail', hit.public_detail_path, { width: 1440, height: 1050 }, 'AI K线分析复盘', '.mr-public-figure img')
    await expect(page.getByText('命中').first()).toBeVisible()
    await capture(page, 'public-detail', hit.public_detail_path, { width: 390, height: 900 }, 'AI K线分析复盘', '.mr-public-figure img')
    expect(errors).toEqual([])
  })
})
