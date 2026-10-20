import { _electron as electron } from '@playwright/test'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = path.join(ROOT, 'docs/redesign/overview')

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

async function run(): Promise<void> {
  fs.mkdirSync(OUT_DIR, { recursive: true })

  const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'ajuan-overview-screenshot-'))

  console.log('正在启动 Electron 实例生成阶段 5 概览工作台全景截图...')
  const app = await electron.launch({
    args: [`--user-data-dir=${ud}`, ROOT],
    env: {
      ...process.env,
      AJUAN_DATA_DIR: ud,
      npm_package_version: '0.2.7'
    }
  })

  try {
    const page = await app.firstWindow()

    // 载入示例业务数据
    await sleep(1500)
    await page.evaluate(async () => {
      try {
        // @ts-expect-error window.ajuan
        await window.ajuan.demo.seed()
      } catch {
        // 忽略
      }
    })
    await sleep(1200)

    // 1. 1280x820 宽屏标准浅色看板
    await page.setViewportSize({ width: 1280, height: 820 })
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'light')
    })
    await sleep(600)
    console.log('截取 1280x820 浅色概览看板...')
    await page.screenshot({
      path: path.join(OUT_DIR, 'overview-1280x820-light.png')
    })

    // 2. 1280x820 宽屏标准深色看板 (Violet Night)
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark')
    })
    await sleep(600)
    console.log('截取 1280x820 深色概览看板...')
    await page.screenshot({
      path: path.join(OUT_DIR, 'overview-1280x820-dark.png')
    })

    // 3. 切换回浅色，点击切换至「明细」表格视图
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'light')
    })
    await sleep(300)
    const tableBtn = page.locator('button:text-is("明细")')
    if (await tableBtn.isVisible()) {
      await tableBtn.click()
      await sleep(400)
      console.log('截取逐日明细表格视图...')
      await page.screenshot({
        path: path.join(OUT_DIR, 'overview-daily-table-view.png')
      })
      // 切回图表
      const chartBtn = page.locator('button:text-is("图表")')
      await chartBtn.click()
      await sleep(300)
    }

    // 4. 1024x768 紧凑单栏响应式浅色
    await page.setViewportSize({ width: 1024, height: 768 })
    await sleep(600)
    console.log('截取 1024x768 浅色紧凑看板...')
    await page.screenshot({
      path: path.join(OUT_DIR, 'overview-1024x768-light.png')
    })

    // 5. 1024x768 紧凑单栏响应式深色
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark')
    })
    await sleep(600)
    console.log('截取 1024x768 深色紧凑看板...')
    await page.screenshot({
      path: path.join(OUT_DIR, 'overview-1024x768-dark.png')
    })

    console.log('概览工作台全景截图已全部生成完毕！')
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
  console.error('阶段 5 截图执行失败:', err)
  process.exit(1)
})
