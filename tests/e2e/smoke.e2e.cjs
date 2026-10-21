/* eslint-disable */
// 冒烟：示例数据上走一遍主要页面与操作
// 打开每个页面 → ⌘K 搜商品 → ⌘N 开出库单并确认 → 盘亏 1 件 → 作废刚开的出库单 → 确认草稿 → 切深色
const { launch, assert, eq } = require('./harness.cjs')

module.exports = async () => {
  const t = await launch()
  await t.api('demo.seed()')
  const mod = process.platform === 'darwin' ? 'metaKey' : 'ctrlKey'
  // 侧栏按钮可能带角标（如「单据1」），按前缀找
  const go = `const go = async (name, wait = 500) => {
    if (name !== '设置') {
      const back = $$('aside button').find(b => b.textContent.trim().startsWith('返回应用'))
      if (back) { back.click(); await sleep(300) }
    }
    const b = $$('nav button, aside button').find(b => b.textContent.trim().startsWith(name))
    if (!b) throw new Error('找不到侧栏：' + name); b.click(); await sleep(wait)
  }`
  // 确认框里的按钮与页面上的同名按钮区分开
  // 打开每个页面
  const titles = await t.ui(`
    ${go}
    const out = []
    for (const name of ['概览', '商品', '单据', '定制', '设置']) {
      await go(name); out.push([...$('main').querySelectorAll('h1')].find(h => h.offsetParent !== null)?.textContent.trim())
    }
    return out
  `)
  eq(titles, ['概览', '商品', '单据', '定制', '设置'], '每个页面都能打开')

  // ⌘K 搜商品
  const found = await t.ui(`
    key('k', { ${mod}: true }); await sleep(300)
    setVal($('input[placeholder^="搜索操作"]'), '小饰品'); await sleep(400)
    const hit = $$('[role=dialog]').some(d => d.innerText.includes('电动车发光小饰品'))
    key('Escape'); $('input[placeholder^="搜索操作"]')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(300)
    return hit
  `)
  assert(found, '⌘K 能搜到商品')

  // ⌘N 开出库单并确认
  const before = (await t.api('inventory.getStock(1)')).quantity
  await t.ui(`
    ${go}
    await go('单据')
    key('n', { ${mod}: true }); await sleep(600)
    setVal($('input[placeholder="搜索名称 / 编码 / SKU"]'), 'FG001'); await sleep(300)
    $$('[role=option]')[0].click(); await sleep(300)
    setVal($('[data-cell=qty]'), '2'); setVal($('[data-cell=price]'), '29.9'); await sleep(100)
    await click('确认出库', 800)
  `)
  eq((await t.api('inventory.getStock(1)')).quantity, before - 2, '出库后库存减 2')
  const newDoc = (await t.api('documents.list({ type: "outbound", limit: 1 })'))[0]
  eq(newDoc.status, 'confirmed', '新出库单已生效')

  // 盘亏 1 件
  await t.ui(`
    ${go}
    await go('商品')
    $$('[data-product-card]').find(c => c.innerText.includes('电动车发光小饰品')).click(); await sleep(600)
    await click('调整库存', 300)
    setVal(inputOf('实际盘点数'), '${before - 3}'); setVal(inputOf('原因'), '冒烟：盘点少 1 件'); await sleep(100)
    await click('确认盘亏 1 件', 700)
    key('Escape'); await sleep(300)
  `)
  eq((await t.api('inventory.getStock(1)')).quantity, before - 3, '盘亏后库存再减 1')

  // 作废刚开的出库单
  await t.ui(`
    ${go}
    await go('单据')
    rows().find(r => r.innerText.includes('${newDoc.docNo}')).click(); await sleep(600)
    await click('作废', 300)
    setVal(inputOf('作废原因'), '冒烟：作废'); await confirmIn('作废并冲回', 800)
    key('Escape'); await sleep(300)
  `)
  eq((await t.api('inventory.getStock(1)')).quantity, before - 1, '作废后库存加回 2')

  // 确认示例草稿
  const draft = (await t.api('documents.list({ status: "draft" })'))[0]
  assert(draft, '示例数据里有草稿')
  await t.ui(`
    rows().find(r => r.innerText.includes('${draft.docNo}')).click(); await sleep(600)
    await click('确认出库', 400)
    await confirmIn('确认出库', 800)
    key('Escape'); await sleep(300)
  `)
  eq((await t.api('documents.list({ status: "draft" })')).length, 0, '草稿确认后不再是草稿')

  // 切换深色
  const theme = await t.ui(`
    ${go}
    await go('设置')
    $$('[role=radio]').find(b => b.textContent.startsWith('深色')).click(); await sleep(150)
    return document.documentElement.getAttribute('data-theme')
  `)
  eq(theme, 'dark', '切换到深色')
  await t.shot('smoke-dark-settings.png')
}
