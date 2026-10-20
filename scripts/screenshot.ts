import { _electron as electron } from '@playwright/test'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = path.join(ROOT, 'docs/redesign/before')

interface Size {
  width: number
  height: number
}

const SIZES: Size[] = [
  { width: 1280, height: 800 },
  { width: 960, height: 640 }
]

const THEMES: ('light' | 'dark')[] = ['light', 'dark']

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

async function run(): Promise<void> {
  fs.mkdirSync(OUT_DIR, { recursive: true })

  for (const size of SIZES) {
    for (const theme of THEMES) {
      console.log(`正在截取配置：${size.width}x${size.height} - ${theme}...`)
      const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'ajuan-screenshot-'))

      const app = await electron.launch({
        args: [`--user-data-dir=${ud}`, ROOT],
        env: {
          ...process.env,
          AJUAN_DATA_DIR: ud,
          npm_package_version: '0.2.7'
        }
      })

      const page = await app.firstWindow()
      await page.setViewportSize(size)
      await sleep(1500)

      // 载入示例业务数据
      await page.evaluate(async () => {
        try {
          // @ts-expect-error window.ajuan is exposed
          await window.ajuan.demo.seed()
        } catch {
          // 忽略已存在数据
        }
      })
      await sleep(800)

      // 切换主题
      await page.evaluate((th) => {
        document.documentElement.setAttribute('data-theme', th)
      }, theme)
      await sleep(400)

      // 辅助截图函数
      const shot = async (name: string): Promise<void> => {
        const file = path.join(OUT_DIR, `${name}-${size.width}x${size.height}-${theme}.png`)
        await page.screenshot({ path: file })
      }

      // 1. 概览页
      await page
        .locator('aside button:has-text("概览")')
        .click()
        .catch(() => {})
      await sleep(500)
      await shot('page-overview')

      // 2. 商品列表页
      await page.locator('aside button:has-text("商品")').click()
      await sleep(500)
      await shot('page-products')

      // 2.1 商品详情弹窗
      const productRow = page.locator('tbody tr').first()
      if (await productRow.count()) {
        await productRow.click()
        await sleep(500)
        await shot('modal-product-detail')

        // 2.2 商品编辑弹窗
        const editBtn = page.locator('[role="dialog"] button:has-text("编辑")')
        if (await editBtn.count()) {
          await editBtn.click()
          await sleep(500)
          await shot('modal-product-edit')
          await page.keyboard.press('Escape')
          await sleep(400)
        }

        // 关闭商品详情弹窗
        await page.keyboard.press('Escape')
        await sleep(400)
      }

      // 2.3 库存调整弹窗
      const adjustBtn = page.locator('header button:has-text("库存调整")')
      if (await adjustBtn.count()) {
        await adjustBtn.click()
        await sleep(500)
        await shot('modal-stock-adjustment')
        await page.keyboard.press('Escape')
        await sleep(400)
      }

      // 3. 单据列表页
      await page.locator('aside button:has-text("单据")').click()
      await sleep(500)
      await shot('page-documents')

      // 3.1 入库单创建弹窗
      const inBtn = page.locator('header button:has-text("入库")')
      if (await inBtn.count()) {
        await inBtn.click()
        await sleep(500)
        await shot('modal-document-new-inbound')
        await page.keyboard.press('Escape')
        await sleep(400)
      }

      // 3.2 出库单创建弹窗
      const outBtn = page.locator('header button:has-text("出库")')
      if (await outBtn.count()) {
        await outBtn.click()
        await sleep(500)
        await shot('modal-document-new-outbound')
        await page.keyboard.press('Escape')
        await sleep(400)
      }

      // 3.3 CSV 导入弹窗
      const importBtn = page.locator('header button:has-text("导入 CSV")')
      if (await importBtn.count()) {
        await importBtn.click()
        await sleep(500)
        await shot('modal-csv-import')
        await page.keyboard.press('Escape')
        await sleep(400)
      }

      // 3.4 单据详情弹窗
      const docRow = page.locator('tbody tr').first()
      if (await docRow.count()) {
        await docRow.click()
        await sleep(500)
        await shot('modal-document-detail')
        await page.keyboard.press('Escape')
        await sleep(400)
      }

      // 4. 定制页
      await page.locator('aside button:has-text("定制")').click()
      await sleep(500)
      await shot('page-psd')

      // 4.1 定制 Photoshop 设置抽屉
      const psdSettingsBtn = page.locator('main button:has-text("设置")')
      if (await psdSettingsBtn.count()) {
        await psdSettingsBtn.click()
        await sleep(500)
        await shot('drawer-psd-settings')
        const closePsdSettings = page.locator('button[aria-label="关闭设置"]')
        if (await closePsdSettings.count()) {
          await closePsdSettings.click()
        } else {
          await page.keyboard.press('Escape')
        }
        await sleep(400)
      }

      // 5. 设置页
      await page.locator('aside button:has-text("设置")').click()
      await sleep(500)
      await shot('page-settings')

      await app.close()
      fs.rmSync(ud, { recursive: true, force: true })
    }
  }

  console.log(`基线截图已成功输出至：${OUT_DIR}`)
}

run().catch((err) => {
  console.error('截图执行失败：', err)
  process.exit(1)
})
