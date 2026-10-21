/* eslint-disable */
// 列表 1000 张上限：页面提示截断，但导出仍包含全部筛选结果
const { launch, assert, eq } = require('./harness.cjs')
const { dialog } = require('electron')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

module.exports = async () => {
  const t = await launch()
  await t.api('demo.seed()')
  const base = Date.UTC(2024, 0, 1)
  for (let i = 0; i < 1001; i++) {
    const date = new Date(base + Math.floor(i / 2) * 86_400_000).toISOString().slice(0, 10)
    await t.api(
      `documents.createDraft({ type: 'outbound', docDate: ${JSON.stringify(date)}, channelId: null, externalOrderNo: '', note: '批量${i}', items: [{ skuId: 1, quantity: 1, unitPriceCents: 2990 }] })`
    )
  }
  const total = await t.api('documents.count({})')
  assert(total > 1000, '总单据数超过 1000')

  const go = `const go = async (name, wait = 500) => {
    const back = $$('aside button').find(b => b.textContent.trim().startsWith('返回应用'))
    if (back) { back.click(); await sleep(300) }
    const b = $$('nav button, aside button').find(b => b.textContent.trim().startsWith(name))
    if (!b) throw new Error('找不到侧栏：' + name); b.click(); await sleep(wait)
  }`
  const shown = await t.ui(`
    ${go}
    await go('单据', 1200)
    return { count: text().match(/共 (\\d+) 张/)?.[1], warning: text().includes('只显示最近 1000 张') }
  `)
  eq(shown.count, String(total), '显示筛选总数')
  assert(shown.warning, '超过 1000 张时显示截断提示')

  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ajuan-limit-')), 'all.csv')
  const original = dialog.showSaveDialog
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: file })
  try {
    await t.ui(`
      $('button[aria-label=更多]').click(); await sleep(250)
      $$('[role=menuitem]').find(m => m.textContent.includes('导出当前列表 CSV')).click(); await sleep(1500)
      return true
    `)
  } finally {
    dialog.showSaveDialog = original
  }
  const content = fs.readFileSync(file, 'utf8')
  eq(content.trim().split(/\r?\n/).length, total + 1, '导出包含全部单据而不是只导出 1000 张')
}
