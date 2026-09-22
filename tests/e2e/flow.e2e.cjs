/* eslint-disable */
// 核心业务闭环走 UI：期初 → 入库 → 出库（库存不足禁用）→ 重复订单提示 → 作废 → 库存调整 → 渠道 → 快捷键 → 离开守卫
const { launch, assert, eq } = require('./harness.cjs')

module.exports = async () => {
  const t = await launch()
  await t.ui(`
    await click('商品'); await click('录入期初库存', 150)
    setVal(inputOf('期初数量'), '100'); setVal(inputOf('单位成本'), '10')
    await click('确认期初', 400)
  `)
  assert((await t.ui(`return text()`)).includes('当前库存 100 件'), '期初后库存应为 100')

  await t.ui(`
    await click('单据'); await click('入库', 400)
    setVal($('input[inputmode=numeric]'), '50'); setVal($('input[inputmode=decimal]'), '13')
    await click('确认入库', 500)
  `)
  assert((await t.ui(`return text()`)).includes('已生效'), '入库应已生效')

  const disabled = await t.ui(`
    await click('返回单据列表'); await click('出库', 400)
    setVal($('input[inputmode=numeric]'), '200')
    return btn('确认出库').disabled && text().includes('库存不足')
  `)
  assert(disabled, '超库存时确认出库应禁用并提示')

  const ckNo = await t.ui(`
    setVal($('input[inputmode=numeric]'), '30')
    setSel($('select'), $('select').options[1].value)
    setVal(inputOf('外部订单号'), 'DY001')
    await click('确认出库', 500)
    return text().match(/CK\\d{8}-\\d{3}/)[0]
  `)
  eq((await t.api('inventory.getStock(1)')).quantity, 120, '出库后库存 120')

  const dup = await t.ui(`
    await click('返回单据列表'); await click('出库', 400)
    setSel($('select'), $('select').options[1].value)
    setVal(inputOf('外部订单号'), 'DY001'); await sleep(600)
    return text().includes('相同订单号')
  `)
  assert(dup, '同渠道同订单号应提示重复')

  // 离开守卫：编辑页有改动时切导航应弹确认
  const guard = await t.ui(`
    setVal($('input[inputmode=numeric]'), '3')
    await click('概览', 200)
    const dialog = document.querySelector('[role=alertdialog]')
    const shown = !!dialog && dialog.innerText.includes('离开')
    if (shown) await click('放弃修改并离开', 400)
    return shown
  `)
  assert(guard, '未保存时切页应弹离开确认')
  assert((await t.ui(`return text()`)).includes('概览'), '放弃后应到达概览')

  await t.ui(`
    await click('单据')
    $$('tbody tr').find(r => r.innerText.includes('${ckNo}')).click(); await sleep(300)
    await click('作废', 150)
    if (!btn('作废并冲回库存').disabled) throw new Error('无原因时作废按钮应禁用')
    setVal(inputOf('作废原因'), '发错货'); await click('作废并冲回库存', 500)
  `)
  eq(
    await t.api('inventory.getStock(1)'),
    { skuId: 1, quantity: 150, costValueCents: 165000, avgCostCents: 1100 },
    '作废后库存与成本回到 150 / ¥11'
  )

  // 库存调整（盘亏 5）
  await t.ui(`
    await click('商品'); await click('库存调整', 400)
    setVal(inputOf('减少数量'), '5'); setVal(inputOf('调整原因'), '月末盘点少 5 件')
    await click('确认调整', 500)
  `)
  const detail = await t.ui(`return text()`)
  assert(detail.includes('TZ') && detail.includes('盘亏减少'), '应跳到调整单详情')
  eq((await t.api('inventory.getStock(1)')).quantity, 145, '调整后库存 145')
  await t.shot('flow-adjustment-detail.png')

  // 设置：添加渠道、切换外观
  const settings = await t.ui(`
    await click('设置')
    setVal($('input[placeholder=新渠道名称]'), '小红书'); await click('添加', 300)
    await click('深色', 100)
    return { channel: text().includes('小红书'), theme: document.documentElement.getAttribute('data-theme') }
  `)
  eq(settings, { channel: true, theme: 'dark' }, '渠道添加与主题切换')
  await t.shot('flow-settings-dark.png')
  await t.ui(`await click('跟随系统', 100)`)

  // 快捷键：⌘/Ctrl+N 新建入库
  const isMac = process.platform === 'darwin'
  const viaKey = await t.ui(`
    key('n', { ${isMac ? 'metaKey' : 'ctrlKey'}: true }); await sleep(300)
    return text().includes('新建入库单')
  `)
  assert(viaKey, '⌘/Ctrl+N 应打开新建入库单')
}
