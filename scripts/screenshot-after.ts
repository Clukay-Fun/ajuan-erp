// 重构后全页面截图：{1280×800, 960×640} × {浅色, 深色}，每个页面加主要弹窗。
// 用法：npm run build && node scripts/screenshot-after.ts [输出目录，默认 docs/redesign/after] [只截的页面，逗号分隔]
import { _electron as electron, type Page } from '@playwright/test'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = path.resolve(ROOT, process.argv[2] ?? 'docs/redesign/after')
const ONLY = process.argv[3]?.split(',')

const SIZES = [
  { width: 1280, height: 800 },
  { width: 960, height: 640 }
]
const THEMES = ['light', 'dark'] as const
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
const mod = process.platform === 'darwin' ? 'Meta' : 'Control'

async function nav(page: Page, n: number): Promise<void> {
  await page.keyboard.press('Escape')
  await page.keyboard.press(`${mod}+${n}`)
  await sleep(600)
}

async function closeDialog(page: Page): Promise<void> {
  await page.keyboard.press('Escape')
  await sleep(350)
}

async function run(): Promise<void> {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'ajuan-after-'))
  const app = await electron.launch({
    args: [`--user-data-dir=${ud}`, ROOT],
    env: { ...process.env, AJUAN_DATA_DIR: ud, npm_package_version: '0.2.7' }
  })
  try {
    const page = await app.firstWindow()
    await sleep(1500)
    if (!fs.existsSync(path.join(ud, 'ajuan.db'))) throw new Error('数据没有写进临时目录，停止以保护开发库')
    await page.evaluate(async () => {
      // @ts-expect-error preload
      await window.ajuan.demo.seed()
    })
    await sleep(600)

    for (const size of SIZES) {
      await page.setViewportSize(size)
      for (const theme of THEMES) {
        await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme)
        const shot = async (name: string): Promise<void> => {
          if (ONLY && !ONLY.some((o) => name.startsWith(o))) return
          await sleep(300)
          await page.screenshot({ path: path.join(OUT_DIR, `${name}-${size.width}x${size.height}-${theme}.png`) })
        }
        const want = (prefix: string): boolean => !ONLY || ONLY.some((o) => o.startsWith(prefix))

        if (want('overview')) {
          await nav(page, 1)
          await shot('overview')
        }

        if (want('products')) {
          await nav(page, 2)
          await shot('products')
          await page.locator('main tbody tr').first().click()
          await sleep(500)
          await shot('products-dialog')
          await closeDialog(page)
        }

        if (want('documents')) {
          await nav(page, 3)
          await shot('documents')
          const draft = page.locator('main tbody tr', { hasText: '草稿' }).first()
          if (await draft.count()) {
            await draft.click()
            await sleep(500)
            await shot('documents-draft')
            await closeDialog(page)
          }
          await page.keyboard.press(`${mod}+n`)
          await sleep(700)
          await shot('documents-new-outbound')
          await closeDialog(page)
        }

        if (want('psd')) {
          await nav(page, 4)
          await shot('psd')
        }

        if (want('settings')) {
          await nav(page, 5)
          await shot('settings')
        }
      }
    }
    console.log(`截图已输出到 ${path.relative(ROOT, OUT_DIR)}`)
  } finally {
    await app.close()
  }
}

void run().catch((err) => {
  console.error(err)
  process.exit(1)
})
