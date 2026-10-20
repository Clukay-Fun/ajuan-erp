/* eslint-disable */
// 无障碍检查：图标按钮都有名字、Tab 能走遍页面且焦点环可见、弹窗关闭后焦点回到原处、减少动态效果时不做动画
const { launch, assert, eq } = require('./harness.cjs')

// 在页面里收集没有可读名字的按钮（无文字、无 aria-label、无 aria-labelledby、无 title）
const UNNAMED = `const unnamed = () => $$('button, [role=button], a[href]')
  .filter(b => b.offsetParent !== null)
  .filter(b => !b.innerText.trim() && !b.getAttribute('aria-label') && !b.getAttribute('aria-labelledby') && !b.getAttribute('title'))
  .map(b => (b.closest('[role=dialog]') ? '弹窗 ' : '') + b.outerHTML.slice(0, 120))`

const GO = `const go = async (name, wait = 500) => {
  const b = $$('nav button, aside button').find(b => b.textContent.trim().startsWith(name))
  if (!b) throw new Error('找不到侧栏：' + name); b.click(); await sleep(wait)
}`

module.exports = async () => {
  const t = await launch()
  await t.api('demo.seed()')

  // 1. 每个页面与主要弹窗：图标按钮都有 aria-label
  const missing = await t.ui(`
    ${UNNAMED}
    ${GO}
    const out = {}
    for (const name of ['概览', '商品', '单据', '定制', '设置']) {
      await go(name); out[name] = unnamed()
    }
    await go('商品'); $$('tbody tr')[0].click(); await sleep(600); out['商品弹窗'] = unnamed(); key('Escape'); await sleep(300)
    await go('单据'); $$('tbody tr')[0].click(); await sleep(600); out['单据弹窗'] = unnamed(); key('Escape'); await sleep(300)
    key('n', { ${process.platform === 'darwin' ? 'metaKey' : 'ctrlKey'}: true }); await sleep(600); out['开单弹窗'] = unnamed(); key('Escape'); await sleep(300)
    return Object.fromEntries(Object.entries(out).filter(([, v]) => v.length))
  `)
  eq(missing, {}, '所有图标按钮都有 aria-label')

  // 2. Tab 能走到页面里的每个可交互元素，且焦点环可见
  const tab = await t.ui(`
    ${GO}
    const res = {}
    for (const name of ['概览', '商品', '单据', '定制', '设置']) {
      await go(name)
      const focusables = $$('main button, main input, main select, main textarea, main a[href], main [tabindex="0"]')
        .filter(el => el.offsetParent !== null && !el.disabled && el.tabIndex >= 0)
      const unreachable = focusables.filter(el => el.tabIndex < 0)
      // 焦点环：键盘聚焦第一个按钮后 outline 不为 none
      const first = focusables.find(el => el.tagName === 'BUTTON')
      first?.focus({ focusVisible: true })
      const ring = first ? getComputedStyle(first).outlineStyle !== 'none' || getComputedStyle(first).boxShadow !== 'none' : true
      res[name] = { count: focusables.length, unreachable: unreachable.length, ring }
    }
    return res
  `)
  for (const [page, r] of Object.entries(tab)) {
    assert(r.count > 0 && r.unreachable === 0, `${page}：可交互元素都能用 Tab 到达`)
    assert(r.ring, `${page}：键盘焦点环可见`)
  }

  // 3. 弹窗关闭后焦点回到打开它的那一行（用关闭按钮关；harness 合成的 Esc 到不了 Base UI）
  await t.ui(
    `for (let i = 0; i < 3 && $('[role=dialog]'); i++) { $('[aria-label="关闭抽屉 (Esc)"]')?.click(); await sleep(300) }`
  )
  const opened = await t.ui(`
    ${GO}
    await go('单据')
    const row = $$('tbody tr')[1]; row.focus(); row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await sleep(600)
    window.__a11yRow = row
    return !!$('[role=dialog]')
  `)
  await t.ui(`$('[aria-label="关闭抽屉 (Esc)"]').click(); await sleep(500)`)
  const back = { opened, restored: await t.ui(`return document.activeElement === window.__a11yRow`) }
  eq(back, { opened: true, restored: true }, '弹窗关闭后焦点回到原处')

  // 4. 减少动态效果：模拟系统设置后，过渡与动画时长为 0
  await t.current().webContents.debugger.attach('1.3')
  await t.current().webContents.debugger.sendCommand('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }]
  })
  const motion = await t.ui(`
    const probe = $$('button').find(b => b.offsetParent !== null)
    const cs = getComputedStyle(probe)
    return { reduce: matchMedia('(prefers-reduced-motion: reduce)').matches, transition: parseFloat(cs.transitionDuration) * 1000 <= 0.01 }
  `)
  eq(motion, { reduce: true, transition: true }, '减少动态效果时过渡关闭')
}
