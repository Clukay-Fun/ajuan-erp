import { _electron as electron } from '@playwright/test'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = path.join(ROOT, 'docs/redesign/components')

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

async function run(): Promise<void> {
  fs.mkdirSync(OUT_DIR, { recursive: true })

  const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'ajuan-comp-screenshot-'))

  console.log('正在启动 Electron 实例生成组件画板截图...')
  const app = await electron.launch({
    args: [`--user-data-dir=${ud}`, ROOT],
    env: {
      ...process.env,
      AJUAN_DATA_DIR: ud,
      VITE_ENABLE_DEV_UI: 'true',
      npm_package_version: '0.2.7'
    }
  })

  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1280, height: 1200 })
    await sleep(1500)

    // 导航至 /dev/ui 预览画板
    console.log('正在导航至 #/dev/ui...')
    await page.evaluate(() => {
      window.location.hash = '#/dev/ui'
    })
    await sleep(1200)

    // 1. 截取浅色全景图
    console.log('正在截取浅色全景组件画板...')
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'light')
    })
    await sleep(500)
    await page.screenshot({
      path: path.join(OUT_DIR, 'dev-ui-1280x800-light.png'),
      fullPage: true
    })

    // 2. 截取深色全景图
    console.log('正在截取深色全景组件画板...')
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark')
    })
    await sleep(500)
    await page.screenshot({
      path: path.join(OUT_DIR, 'dev-ui-1280x800-dark.png'),
      fullPage: true
    })

    // 3. 切回浅色并打开抽屉截图
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'light')
    })
    await sleep(300)

    console.log('正在触发抽屉交互截图...')
    const drawerBtn = page.locator('button:has-text("打开中抽屉 (600px)")')
    if ((await drawerBtn.count()) > 0) {
      await drawerBtn.click()
      await sleep(500)
      await page.screenshot({
        path: path.join(OUT_DIR, 'drawer-open-light.png'),
        fullPage: false
      })

      // 按 Esc 关闭抽屉
      await page.keyboard.press('Escape')
      await sleep(400)
    }

    // 4. 触发 ConfirmDialog 截图
    console.log('正在触发 ConfirmDialog 模态框截图...')
    const confirmBtn = page.locator('button:has-text("触发模态确认框")')
    if ((await confirmBtn.count()) > 0) {
      await confirmBtn.click()
      await sleep(400)
      await page.screenshot({
        path: path.join(OUT_DIR, 'confirm-dialog-light.png'),
        fullPage: false
      })
      await page.keyboard.press('Escape')
      await sleep(300)
    }

    console.log('组件截图全部成功输出至 docs/redesign/components/！')
  } finally {
    await app.close()
    try {
      fs.rmSync(ud, { recursive: true, force: true })
    } catch {
      // 忽略清理临时目录错误
    }
  }
}

run().catch((err) => {
  console.error('截图执行失败:', err)
  process.exit(1)
})
