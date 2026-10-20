/* eslint-disable */
// 核心业务闭环走 UI：期初 → 入库 → 出库（库存不足禁用）→ 重复订单提示 → 作废 → 库存调整 → 渠道 → 快捷键 → 离开守卫
const { launch, assert, eq } = require('./harness.cjs')

module.exports = async () => {
  const t = await launch()
  await t.ui(`
    await click('商品'); $$('tbody tr')[0].click(); await sleep(500); await click('录入期初库存', 200)
    setVal(inputOf('期初数量'), '100'); setVal(inputOf('单件成本 (元)'), '10')
    await click('确认期初', 600)
  `)
  assert((await t.ui(`return text()`)).includes('当前库存 100 件'), '期初后库存应为 100')

  const isMac = process.platform === 'darwin'
  const mod = isMac ? 'metaKey' : 'ctrlKey'

  // 入库：⇧⌘N 打开开单弹窗，唯一商品自动带出
  await t.ui(`
    await click('单据'); key('n', { ${mod}: true, shiftKey: true }); await sleep(600)
    setVal($('[data-cell=qty]'), '50'); setVal($('[data-cell=price]'), '13'); await sleep(100)
    await click('确认入库', 700)
  `)
  eq((await t.api('inventory.getStock(1)')).quantity, 150, '入库后库存 150')

  const disabled = await t.ui(`
    await click('开单', 600)
    setVal($('[data-cell=qty]'), '200'); await sleep(100)
    return btn('确认出库').disabled && text().includes('超出可用库存')
  `)
  assert(disabled, '超库存时确认出库应禁用并提示')

  await t.ui(`
    setVal($('[data-cell=qty]'), '30')
    await pickOption(0, '抖音小店')
    setVal(inputOf('外部订单号'), 'DY001'); await sleep(100)
    await click('确认出库', 700)
  `)
  eq((await t.api('inventory.getStock(1)')).quantity, 120, '出库后库存 120')
  const ckNo = (await t.api('documents.list({ type: "outbound" })'))[0].docNo

  const dup = await t.ui(`
    await click('开单', 600)
    await pickOption(0, '抖音小店')
    setVal(inputOf('外部订单号'), 'DY001'); await sleep(600)
    return text().includes('相同订单号')
  `)
  assert(dup, '同渠道同订单号应提示重复')

  // 未保存的开单弹窗：切页先确认放弃，确认后才能离开
  const guard = await t.ui(`
    setVal($('[data-cell=qty]'), '3'); await sleep(100)
    await click('概览', 300)
    const dialog = document.querySelector('[role=alertdialog]')
    const shown = !!dialog && dialog.innerText.includes('放弃')
    if (shown) await click('放弃并退出', 400)
    await click('概览', 400)
    return shown
  `)
  assert(guard, '未保存时切页应弹放弃确认')
  assert((await t.ui(`return text()`)).includes('最近单据'), '放弃后应到达概览')

  await t.ui(`
    await click('单据', 400)
    $$('tbody tr').find(r => r.innerText.includes('${ckNo}')).click(); await sleep(500)
    await click('作废', 300)
    setVal(inputOf('作废原因'), '发错货'); await click('作废并冲回', 700)
  `)
  eq(
    await t.api('inventory.getStock(1)'),
    { skuId: 1, quantity: 150, costValueCents: 165000, avgCostCents: 1100 },
    '作废后库存与成本回到 150 / ¥11'
  )
  // 库存调整：商品抽屉里按盘点数盘亏 5
  await t.ui(`
    await click('商品'); $$('tbody tr')[0].click(); await sleep(500); await click('调整库存', 300)
    setVal(inputOf('实际盘点数'), '145'); setVal(inputOf('原因'), '月末盘点少 5 件'); await sleep(100)
    await click('确认盘亏 5 件', 600)
  `)
  const afterAdjust = await t.ui(`return text()`)
  assert(afterAdjust.includes('当前库存 145 件'), '调整后商品页应显示 145')
  // 单据页应能看到调整单
  const listed = await t.ui(`await click('单据'); return text().includes('TZ')`)
  assert(listed, '单据列表应包含调整单')
  eq((await t.api('inventory.getStock(1)')).quantity, 145, '调整后库存 145')
  await t.shot('flow-documents-after-adjust.png')

  // 设置：添加渠道、切换外观
  const settings = await t.ui(`
    await click('设置')
    setVal($('input[placeholder=新渠道名称]'), '小红书'); await click('添加', 300)
    $$('[role=radio]').find(b => b.textContent.startsWith('深色')).click(); await sleep(100)
    return {
      channel: text().includes('小红书'),
      theme: document.documentElement.getAttribute('data-theme'),
      updateSettings: text().includes('启动时自动检查')
    }
  `)
  eq(settings, { channel: true, theme: 'dark', updateSettings: true }, '渠道、外观与更新设置显示')
  const updateState = await t.api('update.getState()')
  eq(updateState.currentVersion, require('../../package.json').version, '更新面板显示项目版本')
  eq(updateState.status, 'unsupported', '开发版应说明仅 Windows 安装版支持自动更新')
  await t.shot('flow-settings-dark.png')
  await t.ui(
    `$$('h2').find(h => h.textContent.trim() === '更新').scrollIntoView({ block: 'center' }); await sleep(500)`
  )
  await t.shot('flow-settings-update.png')
  await t.ui(`$$('[role=radio]').find(b => b.textContent.startsWith('跟随系统')).click(); await sleep(100)`)

  // 快捷键：⌘/Ctrl+N 新建出库单，⇧⌘/Ctrl+N 新建入库单
  const viaKey = await t.ui(`
    key('n', { ${mod}: true }); await sleep(400)
    const out = text().includes('新建出库单')
    key('n', { ${mod}: true, shiftKey: true }); await sleep(400)
    return out && text().includes('新建入库单')
  `)
  assert(viaKey, '⌘N 应打开新建出库单，⇧⌘N 应打开新建入库单')
}
