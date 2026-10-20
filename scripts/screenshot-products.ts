import { _electron as electron, expect, type Page } from '@playwright/test'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = path.join(ROOT, 'docs/redesign/products')

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

const sizes = [
  { width: 1280, height: 820 },
  { width: 980, height: 640 },
  { width: 960, height: 640 }
]
const themes = ['light', 'dark'] as const

async function assertNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => {
    const table = document.querySelector('[class*="tableWrap"]')
    return {
      document: document.documentElement.scrollWidth > window.innerWidth + 1,
      table: table ? table.scrollWidth > table.clientWidth + 1 : false
    }
  })
  expect(overflow.document, '页面出现横向溢出').toBe(false)
  expect(overflow.table, '商品表格出现横向滚动').toBe(false)
}

async function closeDrawer(page: Page): Promise<void> {
  const closeButton = page.getByRole('button', { name: '关闭抽屉 (Esc)' })
  if (await closeButton.isVisible()) await closeButton.click()
  await expect(page.locator('[class*="viewHeader"]')).toHaveCount(0)
}

async function run(): Promise<void> {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'ajuan-products-screenshot-'))

  console.log('正在启动 Electron 实例生成阶段 6 商品页验收截图...')
  const app = await electron.launch({
    args: [`--user-data-dir=${userData}`, ROOT],
    env: {
      ...process.env,
      AJUAN_DATA_DIR: userData,
      npm_package_version: '0.2.7'
    }
  })

  try {
    const page = await app.firstWindow()
    await sleep(1500)
    if (!fs.existsSync(path.join(userData, 'ajuan.db'))) {
      throw new Error('验收数据未写入临时目录，停止执行以保护开发数据库')
    }
    await page.evaluate(async () => {
      try {
        // @ts-expect-error window.ajuan
        await window.ajuan.demo.seed()
      } catch {
        // 已有示例数据时保留当前数据
      }
    })
    await sleep(1000)

    const isMac = process.platform === 'darwin'
    await page.keyboard.press(isMac ? 'Meta+2' : 'Control+2')
    await expect(page.getByRole('heading', { name: '商品' })).toBeVisible()

    await page.setViewportSize({ width: 1280, height: 820 })
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'))
    const seededProduct = await page.evaluate(async () => {
      // @ts-expect-error window.ajuan is exposed by the Electron preload
      const [stockResult, healthResult] = await Promise.all([
        window.ajuan.inventory.listStock(),
        window.ajuan.stats.getProductHealth()
      ])
      if (!stockResult.ok) throw new Error(stockResult.error.message)
      if (!healthResult.ok) throw new Error(healthResult.error.message)
      const row = stockResult.data.find(
        (item) =>
          item.stock.quantity > 3 &&
          healthResult.data.find((health) => health.productId === item.product.id)?.status === 'ok'
      )
      if (!row) throw new Error('示例数据缺少库存大于 3 且状态正常的商品')
      return {
        skuId: row.product.defaultSku.id,
        name: row.product.name,
        code: row.product.code,
        unit: row.product.unit,
        threshold: row.product.lowStockThreshold,
        quantity: row.stock.quantity
      }
    })

    const productRow = page.locator('tbody tr').filter({ hasText: seededProduct.code }).first()
    const thresholdValue = productRow.locator('[class*="editableThreshold"]')
    await thresholdValue.dblclick()
    const thresholdInput = productRow.locator('input[inputmode="decimal"]')
    await expect(thresholdInput).toBeFocused()
    await thresholdInput.fill(String(seededProduct.threshold + 500))
    await thresholdInput.press('Escape')
    await expect(productRow.locator('[class*="editableThreshold"]')).toHaveText(
      `${seededProduct.threshold} ${seededProduct.unit}`
    )

    await productRow.locator('[class*="editableThreshold"]').dblclick()
    const savedThresholdInput = productRow.locator('input[inputmode="decimal"]')
    await expect(savedThresholdInput).toBeFocused()
    await savedThresholdInput.fill(String(seededProduct.threshold + 500))
    await savedThresholdInput.press('Enter')
    await expect(productRow.getByText('低于预警')).toBeVisible()
    await expect(productRow.locator('[class*="editableThreshold"]')).toHaveText(
      `${seededProduct.threshold + 500} ${seededProduct.unit}`
    )

    await page.keyboard.press(isMac ? 'Meta+1' : 'Control+1')
    const overviewStockItem = page.locator('[class*="stockItem"]').filter({ hasText: seededProduct.name })
    await expect(overviewStockItem).toContainText('低于预警')
    await page.keyboard.press(isMac ? 'Meta+2' : 'Control+2')
    await expect(page.getByRole('heading', { name: '商品' })).toBeVisible()

    await productRow.locator('[class*="editableThreshold"]').dblclick()
    const resetThresholdInput = productRow.locator('input[inputmode="decimal"]')
    await resetThresholdInput.fill(String(seededProduct.threshold))
    await resetThresholdInput.press('Enter')
    await expect(productRow.locator('[class*="editableThreshold"]')).toHaveText(
      `${seededProduct.threshold} ${seededProduct.unit}`
    )
    await expect(productRow.getByText('低于预警')).toHaveCount(0)
    await sleep(3200)

    for (const size of sizes) {
      await page.setViewportSize(size)
      for (const theme of themes) {
        await page.evaluate((value) => document.documentElement.setAttribute('data-theme', value), theme)
        await sleep(350)
        await assertNoHorizontalOverflow(page)

        const prefix = `products-${size.width}x${size.height}`
        await page.screenshot({ path: path.join(OUT_DIR, `${prefix}-list-${theme}.png`) })

        const firstRow = page.locator('tbody tr').first()
        await expect(firstRow).toBeVisible()
        await firstRow.click()
        await expect(page.locator('[class*="viewHeader"]')).toBeVisible()
        await sleep(350)
        await page.screenshot({ path: path.join(OUT_DIR, `${prefix}-drawer-view-${theme}.png`) })

        if (size.width === 1280 && theme === 'light') {
          await page.getByRole('button', { name: '更多操作' }).click()
          await page.getByRole('menuitem', { name: '停用此商品' }).click()
          await expect(page.locator('[class*="viewHeader"]').getByText('已停用')).toBeVisible()
          await sleep(3200)
          await page.getByRole('button', { name: '编辑' }).click()
          const activeCheckbox = page.getByRole('checkbox', { name: '启用此商品（允许正常出入库与开单）' })
          await expect(activeCheckbox).not.toBeChecked()
          await page.screenshot({ path: path.join(OUT_DIR, `${prefix}-edit-form-light.png`) })
          await page.getByRole('button', { name: '取消' }).click()
          await page.getByRole('button', { name: '更多操作' }).click()
          await page.getByRole('menuitem', { name: '重新启用商品' }).click()
          await expect(page.locator('[class*="viewHeader"]').getByText('已停用')).toHaveCount(0)
          await sleep(3200)

          const openingLink = page.locator('[class*="openingLink"]')
          if (await openingLink.isVisible()) {
            await openingLink.click()
            const backButton = page.locator('[class*="backButton"]')
            await expect(backButton).toBeVisible()
            await page.screenshot({ path: path.join(OUT_DIR, `${prefix}-opening-document-light.png`) })
            await backButton.click()
            await expect(page.locator('[class*="viewHeader"]')).toBeVisible()
          }

          const adjustButton = page.getByRole('button', { name: '调整库存' })
          await expect(adjustButton).toBeVisible()
          await adjustButton.click()
          const adjustmentPanel = page.locator('[class*="adjustmentBody"]')
          await expect(
            adjustmentPanel.getByText('调整会直接生效并写入流水；录错了可以作废冲回，但不能修改。')
          ).toBeVisible()
          await page.screenshot({ path: path.join(OUT_DIR, 'products-1280x820-adjustment-form-light.png') })

          const countedInput = adjustmentPanel.locator('input[inputmode="decimal"]')
          const targetQuantity = seededProduct.quantity - 3
          await countedInput.fill(String(targetQuantity))
          await expect(
            adjustmentPanel.getByText(`${seededProduct.quantity} → ${targetQuantity}，盘亏 3 ${seededProduct.unit}`)
          ).toBeVisible()
          await adjustmentPanel.getByPlaceholder('例如：月末盘点少 3 件').fill('阶段 6 验收盘亏 3 件')
          await adjustmentPanel.getByRole('button', { name: `确认盘亏 3 ${seededProduct.unit}` }).click()

          await expect(page.locator('[class*="statGrid"]')).toContainText(`${targetQuantity} ${seededProduct.unit}`)
          const adjustment = await page.evaluate(
            async ({ skuId, targetQuantity }) => {
              // @ts-expect-error window.ajuan is exposed by the Electron preload
              const result = await window.ajuan.inventory.listMovements({
                skuId,
                kind: 'adjustment',
                page: 1,
                pageSize: 20
              })
              if (!result.ok) throw new Error(result.error.message)
              return result.data.rows.find((row) => row.quantityDelta === -3 && row.quantityAfter === targetQuantity)
            },
            { skuId: seededProduct.skuId, targetQuantity }
          )
          expect(adjustment, '盘亏 3 件后应新增库存调整流水').toBeTruthy()
          if (adjustment) {
            const movementRow = page
              .locator('[class*="movementSection"] tbody tr')
              .filter({ hasText: adjustment.docNo })
            await expect(movementRow).toBeVisible()
            await expect(movementRow).toContainText('-3')
            await expect(movementRow).toContainText(String(targetQuantity))
          }
          await page.screenshot({ path: path.join(OUT_DIR, 'products-1280x820-adjusted-stock-light.png') })

          await closeDrawer(page)
          await page.keyboard.press(isMac ? 'Meta+1' : 'Control+1')
          const adjustedOverviewItem = page.locator('[class*="stockItem"]').filter({ hasText: seededProduct.name })
          await expect(adjustedOverviewItem).toContainText(`${targetQuantity} ${seededProduct.unit}`)
          await page.keyboard.press(isMac ? 'Meta+2' : 'Control+2')
          await expect(page.getByRole('heading', { name: '商品' })).toBeVisible()
          await sleep(3200)
        }

        if (await page.locator('[class*="viewHeader"]').count()) await closeDrawer(page)
      }
    }

    await page.setViewportSize({ width: 1280, height: 820 })
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'))
    await page.getByRole('button', { name: '新建商品' }).click()
    await expect(page.getByText('SKU 将自动生成为')).toBeVisible()
    await page.screenshot({ path: path.join(OUT_DIR, 'products-drawer-create-form.png') })
    const productNameInput = page.getByPlaceholder('例如：高透亚克力双层立牌 15cm')
    await productNameInput.fill('未保存的商品名称')
    await page.getByRole('button', { name: '关闭抽屉 (Esc)' }).click()
    const dirtyDialog = page.getByRole('alertdialog')
    await expect(dirtyDialog).toBeVisible()
    await dirtyDialog.getByRole('button', { name: '继续编辑' }).click()
    await expect(productNameInput).toHaveValue('未保存的商品名称')
    await page.getByRole('button', { name: '关闭抽屉 (Esc)' }).click()
    await expect(page.getByRole('alertdialog')).toBeVisible()
    await page.getByRole('alertdialog').getByRole('button', { name: '放弃并退出' }).click()
    await closeDrawer(page)

    await page.getByRole('button', { name: '更多选项' }).click()
    await page.getByRole('menuitem', { name: '导入 CSV' }).evaluate((item) => (item as HTMLElement).click())
    await expect(page.getByText('选择标准模板格式的 CSV 文件')).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(1)
    await sleep(300)
    await page.screenshot({ path: path.join(OUT_DIR, 'products-1280x820-import-drawer-light.png') })

    console.log('商品列表、详情、嵌套单据、库存调整、新建与导入截图已生成。')
  } finally {
    await app.close()
    try {
      fs.rmSync(userData, { recursive: true, force: true })
    } catch {
      // 忽略清理临时目录错误
    }
  }
}

run().catch((err) => {
  console.error('阶段 6 商品截图验收失败:', err)
  process.exit(1)
})
