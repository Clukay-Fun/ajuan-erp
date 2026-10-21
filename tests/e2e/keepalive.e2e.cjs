/* eslint-disable */
// 页面常驻：设置来回不留失筛选/滚动/未提交输入；隐藏页不响应 ⌘F；回来能看到新数据
const { launch, assert, eq } = require('./harness.cjs')

module.exports = async () => {
  const t = await launch()
  await t.api('demo.seed()')
  const go = `const go = async (name, wait = 500) => {
    const back = $$('aside button').find(b => b.textContent.trim().startsWith('返回应用'))
    if (back && name !== '设置') { back.click(); await sleep(300) }
    const b = $$('nav button, aside button').find(b => b.textContent.trim().startsWith(name))
    if (!b) throw new Error('找不到侧栏：' + name); b.click(); await sleep(wait)
  }`
  const mod = process.platform === 'darwin' ? 'metaKey' : 'ctrlKey'

  // 先验证表格滚动位置：不筛选时行数足够多
  const scrolled = await t.ui(`
    // step1-scroll
    ${go}
    await go('单据', 700)
    const wrap = $$('main table').find(t => t.checkVisibility()).parentElement
    wrap.scrollTop = 200
    await sleep(200)
    const before = wrap.scrollTop
    await go('商品', 400)
    await go('单据', 500)
    const el = $$('main table').find(t => t.checkVisibility()).parentElement; return { before, after: el.scrollTop, sh: el.scrollHeight, ch: el.clientHeight, overflow: getComputedStyle(el).overflowY }
  `)
  assert(scrolled.before > 0, '表格可滚动 ' + JSON.stringify(scrolled))
  eq(scrolled.before, scrolled.after, '切页后表格滚动位置保留')

  // 单据筛选
  const filtered = await t.ui(`
    // step2-filter
    setVal($('input[placeholder="单号 / 订单号 / 渠道 / 备注"]'), 'CK')
    $$('[role=tab]').find(b => b.textContent.trim() === '出库').click(); await sleep(400)
    return { count: text().match(/共 (\\d+) 张/)?.[1], scroll: $$('main table').find(t => t.checkVisibility()).parentElement.scrollTop }
  `)
  assert(filtered.count && Number(filtered.count) > 0, '单据筛选后有结果')

  // 进设置再返回，筛选和滚动都不丢
  const back = await t.ui(`
    // step3-settings-back
    try {
      ${go}
      await go('设置', 500)
      const buttons = $$('aside button').map(b => b.textContent.trim())
      const backBtn = $$('aside button').find(b => b.textContent.trim().startsWith('返回应用'))
      const settingsNav = !!backBtn
      if (backBtn) { backBtn.click(); await sleep(600) }
      return {
        settingsNav,
        query: $('input[placeholder="单号 / 订单号 / 渠道 / 备注"]')?.value,
        outbound: $$('[role=tab]').find(b => b.textContent.trim() === '出库')?.getAttribute('aria-selected'),
        scroll: $$('main table').find(t => t.checkVisibility())?.parentElement.scrollTop
      }
    } catch (e) { return { error: String(e), buttons: $$('aside button').map(b => b.textContent.trim()) } }
  `)
  eq(
    { settingsNav: back.settingsNav, query: back.query, outbound: back.outbound },
    { settingsNav: true, query: 'CK', outbound: 'true' },
    '返回应用不丢筛选'
  )
  eq(back.scroll, filtered.scroll, '返回应用后表格滚动位置一致')

  // 隐藏的单据页不响应 ⌘F
  const shortcut = await t.ui(`
    // step4-shortcut
    ${go}
    await go('商品', 500)
    key('f', { ${mod}: true }); await sleep(300)
    const search = $('input[placeholder="单号 / 订单号 / 渠道 / 备注"]')
    return { focused: document.activeElement === search, hidden: search.offsetParent === null }
  `)
  eq(shortcut, { focused: false, hidden: true }, '隐藏页不抢 ⌘F')

  // 在别处新增数据，回到单据页能看到
  await t.api(
    `documents.createDraft({ type: 'outbound', docDate: '2026-10-21', channelId: null, externalOrderNo: '', note: '常驻刷新验证', items: [{ skuId: 1, quantity: 1, unitPriceCents: 2990 }] })`
  )
  const refreshed = await t.ui(`
    // step5-refresh
    ${go}
    await go('单据', 800)
    return text().includes('常驻刷新验证')
  `)
  assert(refreshed, '回到单据页会刷新数据')

  // 定制页未提交的标题在设置来回后保留
  const title = await t.ui(`
    // step6-title
    ${go}
    await go('定制', 800)
    setVal($('input[aria-label="定制标题"]'), '还没提交的标题'); await sleep(150)
    await go('设置', 400)
    $$('aside button').find(b => b.textContent.trim().startsWith('返回应用')).click(); await sleep(700)
    return $('input[aria-label="定制标题"]').value
  `)
  eq(title, '还没提交的标题', '定制页未提交输入保留')

  // 设置分类也记住上次位置
  const section = await t.ui(`
    ${go}
    await go('设置', 500)
    settingsNav('数据', 300)
    $$('aside button').find(b => b.textContent.trim().startsWith('返回应用')).click(); await sleep(500)
    await go('设置', 500)
    return $$('aside button').find(b => b.getAttribute('aria-current') === 'page')?.textContent.trim()
  `)
  assert(section && section.startsWith('数据'), '设置分类保持在数据')
}
