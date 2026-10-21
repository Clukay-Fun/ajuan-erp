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

    // 定制：用一个占位 PSD 建三位置模板；文件对话框在主进程里打桩，导入一张狗狗图和一张名字图
    if (!ONLY || ONLY.some((o) => o.startsWith('psd'))) {
      const psdPath = path.join(ud, '示例六宫格.psd')
      fs.writeFileSync(psdPath, '8BPS placeholder')
      const icon = path.join(ROOT, 'build/icon.png')
      await page.evaluate(async (p) => {
        // @ts-expect-error preload
        const api = window.ajuan.psd
        const board = (await api.createTemplate({ name: '六宫格', sourcePath: p })).data
        const id = Math.max(...board.templates.map((t: { id: number }) => t.id))
        for (const n of [1, 2, 3]) {
          const key = `slot_0${n}`
          await api.addSlot({ templateId: id, slotKey: key, dogLayer: `${key}_dog`, nameLayer: `${key}_name` })
        }
      }, psdPath)
      await app.evaluate(({ dialog }, file) => {
        dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [file] })) as typeof dialog.showOpenDialog
      }, icon)
      await page.evaluate(async () => {
        // @ts-expect-error preload
        await window.ajuan.psd.importAsset('dog')
        // @ts-expect-error preload
        await window.ajuan.psd.importAsset('name')
      })
    }

    for (const size of SIZES) {
      await page.setViewportSize(size)
      for (const theme of THEMES) {
        await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme)
        // 文件名与 docs/redesign/before 一一对应；新增的视图用新名字
        const shot = async (name: string): Promise<void> => {
          await sleep(300)
          await page.screenshot({ path: path.join(OUT_DIR, `${name}-${size.width}x${size.height}-${theme}.png`) })
        }
        const want = (prefix: string): boolean => !ONLY || ONLY.some((o) => o.startsWith(prefix))

        if (want('overview')) {
          await nav(page, 1)
          await shot('page-overview')
        }

        if (want('products')) {
          await nav(page, 2)
          await shot('page-products')
          await page.locator('main [data-product-card]').first().click()
          await sleep(500)
          await shot('modal-product-detail')
          await page.getByRole('dialog').getByRole('button', { name: '编辑', exact: true }).click()
          await sleep(400)
          await shot('modal-product-edit')
          await closeDialog(page)
          await closeDialog(page)
        }

        if (want('documents')) {
          await nav(page, 3)
          await shot('page-documents')
          await page.locator('main tbody tr', { hasText: '已生效' }).first().click()
          await sleep(500)
          await shot('modal-document-detail')
          await closeDialog(page)
          const draft = page.locator('main tbody tr', { hasText: '草稿' }).first()
          if (await draft.count()) {
            await draft.click()
            await sleep(500)
            await shot('modal-document-draft')
            await closeDialog(page)
          }
          await page.keyboard.press(`${mod}+n`)
          await sleep(700)
          await shot('modal-document-new-outbound')
          await closeDialog(page)
          await page.keyboard.press(`${mod}+Shift+n`)
          await sleep(700)
          await shot('modal-document-new-inbound')
          await closeDialog(page)
          await page.getByRole('button', { name: '更多', exact: true }).click()
          await sleep(250)
          await page.getByRole('menuitem', { name: '导入 CSV' }).click()
          await sleep(500)
          await shot('modal-csv-import')
          await closeDialog(page)
        }

        if (want('psd')) {
          await nav(page, 4)
          await shot('page-psd')
          await page.getByRole('button', { name: '第 1 位狗图' }).click()
          await sleep(350)
          await shot('modal-psd-asset-picker')
          await page.getByRole('dialog').locator('button[aria-pressed]').first().click()
          await page.getByRole('button', { name: '确认选择' }).click()
          await sleep(300)
          await shot('page-psd-picked')
          await page.getByRole('tab', { name: '模板' }).click()
          await sleep(400)
          await shot('page-psd-templates')
          await page.getByRole('button', { name: '新建模板' }).first().click()
          await sleep(500)
          await shot('modal-psd-new-template')
          await closeDialog(page)
          await page.getByRole('tab', { name: '素材库' }).click()
          await sleep(400)
          await shot('page-psd-assets')
          await page.getByRole('tab', { name: '生产' }).click()
        }

        if (want('settings')) {
          await nav(page, 5)
          await shot('page-settings')
          for (const [label, name] of [
            ['销售渠道', 'channels'],
            ['Photoshop 连接', 'photoshop'],
            ['数据', 'data'],
            ['更新与关于', 'about']
          ]) {
            await page
              .getByRole('navigation', { name: '设置分类' })
              .getByRole('button', { name: new RegExp(`^${label}`) })
              .click()
            await sleep(300)
            await shot(name === 'photoshop' ? 'drawer-psd-settings' : `page-settings-${name}`)
          }
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
