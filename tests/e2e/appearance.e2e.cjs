/* eslint-disable */
// 外观：浅色墨绿 / 深色紫罗兰、自定义颜色、字号、减少动效、分别设置与持久化
const { launch, assert, eq } = require('./harness.cjs')

module.exports = async () => {
  const t = await launch()
  await t.api('demo.seed()')
  const go = `const go = async (name, wait = 500) => {
    const back = $$('aside button').find(b => b.textContent.trim().startsWith('返回应用'))
    if (back) { back.click(); await sleep(300) }
    const b = $$('nav button, aside button').find(b => b.textContent.trim().startsWith(name))
    if (!b) throw new Error('找不到侧栏：' + name); b.click(); await sleep(wait)
  }`

  const defaults = await t.ui(`
    ${go}
    await go('设置', 700)
    $$('[role=radio]').find(b => b.textContent.trim().startsWith('浅色')).click(); await sleep(250)
    const root = getComputedStyle(document.documentElement)
    const light = { accent: root.getPropertyValue('--accent').trim(), bg: root.getPropertyValue('--bg-app').trim() }
    $$('[role=radio]').find(b => b.textContent.trim().startsWith('深色')).click(); await sleep(250)
    const root2 = getComputedStyle(document.documentElement)
    return {
      light,
      dark: { accent: root2.getPropertyValue('--accent').trim(), bg: root2.getPropertyValue('--bg-app').trim() },
      theme: document.documentElement.getAttribute('data-theme')
    }
  `)
  eq(
    defaults,
    {
      light: { accent: '#2f7357', bg: '#f5f6f8' },
      dark: { accent: '#7560dc', bg: '#111315' },
      theme: 'dark'
    },
    '浅色墨绿、深色紫罗兰'
  )

  // 自定义强调色 + 对比度提示
  const custom = await t.ui(`
    const input = $('input[aria-label="强调色取色"]')
    setVal(input, '#123456'); await sleep(300)
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
    const fg = $('input[aria-label="前景取色"]')
    setVal(fg, '#111315'); await sleep(300)
    const warn = text().includes('低于 4.5:1')
    const stored = JSON.parse(localStorage.getItem('ajuan.appearance'))
    return { accent, warn, storedAccent: stored.dark.accent, storedTheme: stored.dark.theme }
  `)
  eq(
    custom,
    { accent: '#123456', warn: true, storedAccent: '#123456', storedTheme: 'custom' },
    '自定义强调色、对比度警告与持久化'
  )

  // 恢复默认，展开高级，改字号与动效
  const advanced = await t.ui(`
    await click('恢复默认', 300)
    const summary = $$('summary').find(s => s.textContent.trim() === '高级')
    summary.click(); await sleep(250)
    const big = $$('[role=tab]').filter(b => b.textContent.trim() === '大')
    big[0].click(); await sleep(250)
    big[1].click(); await sleep(250)
    const uiSize = getComputedStyle(document.documentElement).getPropertyValue('--font-size-base').trim()
    const tableSize = getComputedStyle(document.documentElement).getPropertyValue('--font-size-table').trim()
    const motionOn = $$('[role=tab]').find(b => b.textContent.trim() === '开启'); motionOn.click(); await sleep(200)
    const reduced = document.documentElement.getAttribute('data-reduce-motion')
    const motionOff = $$('[role=tab]').find(b => b.textContent.trim() === '关闭'); motionOff.click(); await sleep(200)
    const notReduced = document.documentElement.getAttribute('data-reduce-motion')
    const cb = $$('input[type=checkbox]').pop()
    cb.click(); await sleep(250)
    const stored = JSON.parse(localStorage.getItem('ajuan.appearance'))
    return { uiSize, tableSize, reduced, notReduced, separate: stored.separate, same: stored.light.accent === stored.dark.accent }
  `)
  eq(
    advanced,
    { uiSize: '15px', tableSize: '13px', reduced: 'true', notReduced: 'false', separate: false, same: true },
    '字号、减少动效与共用配色'
  )

  // 应用实际生效：商品卡片名称字号变大，表格字号覆盖到表格内
  const applied = await t.ui(`
    ${go}
    await go('商品', 700)
    const card = $('[data-product-card]')
    const nameSize = getComputedStyle(card.querySelector('span span')).fontSize
    await go('单据', 700)
    const tableSize = getComputedStyle($('table')).fontSize
    return { nameSize, tableSize }
  `)
  assert(parseFloat(applied.nameSize) >= 15, '界面字号应用到商品卡片')
  assert(parseFloat(applied.tableSize) >= 13, '表格字号应用到单据表格')

  // 重载后偏好仍在（启动时在首帧前应用）
  t.current().webContents.reload()
  await new Promise((r) => setTimeout(r, 1800))
  const persisted = await t.ui(`
    const cs = getComputedStyle(document.documentElement)
    return {
      accent: cs.getPropertyValue('--accent').trim(),
      uiSize: cs.getPropertyValue('--font-size-base').trim(),
      tableSize: cs.getPropertyValue('--font-size-table').trim(),
      reduced: document.documentElement.getAttribute('data-reduce-motion')
    }
  `)
  eq(persisted, { accent: '#7560dc', uiSize: '15px', tableSize: '13px', reduced: 'false' }, '重载后外观偏好保留')
}
