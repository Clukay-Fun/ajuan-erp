/* eslint-disable */
// 定制：三选项卡、添加/删除位置、图层映射保存、模板重命名、空素材选图弹窗
const { launch, assert, eq } = require('./harness.cjs')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

module.exports = async () => {
  const t = await launch()
  const psd = path.join(os.tmpdir(), `ajuan-e2e-${process.pid}.psd`)
  fs.writeFileSync(psd, '8BPS placeholder')
  const created = await t.api(`psd.createTemplate({ name: 'E2E 模板', sourcePath: ${JSON.stringify(psd)} })`)
  const templateId = Math.max(...created.templates.map((item) => item.id))
  await t.api(
    `psd.addSlot({ templateId: ${templateId}, slotKey: 'slot_01', dogLayer: 'slot_01_dog', nameLayer: 'slot_01_name' })`
  )

  const go = `const go = async (name, wait = 400) => {
    const back = $$('aside button').find(b => b.textContent.trim().startsWith('返回应用'))
    if (back) { back.click(); await sleep(300) }
    const b = $$('nav button, aside button').find(b => b.textContent.trim().startsWith(name))
    if (!b) throw new Error('找不到侧栏：' + name); b.click(); await sleep(wait)
  }
  const tab = (name) => { const b = $$('[role=tab]').find(b => b.textContent.trim().startsWith(name)); if (!b) throw new Error('找不到选项卡：' + name); b.click() }
  `

  // 三个平级选项卡 + 生产页位置卡片
  const first = await t.ui(`
    ${go}
    await go('定制', 800)
    const tabs = $$('[role=tab]').map(b => b.textContent.trim())
    const text0 = text()
    tab('素材库'); await sleep(400)
    const hadAssets = text().includes('导入图片')
    tab('生产'); await sleep(400)
    return { tabs, slots: text0.includes('替换位置'), hadAssets }
  `)
  assert(first.tabs.includes('生产') && first.tabs.includes('模板') && first.tabs.includes('素材库'), '三个平级选项卡')
  assert(first.slots, '生产页显示替换位置')
  assert(first.hadAssets, '素材库页可导入图片')

  // 添加位置
  await t.ui(`await click('添加位置', 700)`)
  let board = await t.api('psd.getBoard()')
  eq(board.templates.find((x) => x.id === templateId).slots.length, 2, '添加位置写入模板配置')
  eq(board.templates.find((x) => x.id === templateId).slots[1].dogLayer, 'slot_02_dog', '新位置默认图层名')

  // 图层映射失焦保存
  const saved = await t.ui(`
    const toggle = $$('button').find(b => b.textContent.trim() === '图层映射')
    toggle.click(); await sleep(200)
    const input = $('input[aria-label="第 1 位狗图层名"]')
    setVal(input, '封面狗图'); input.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); await sleep(700)
    return !!$('input[aria-label="第 1 位狗图层名"]')
  `)
  assert(saved, '图层映射字段仍在')
  board = await t.api('psd.getBoard()')
  eq(board.templates.find((x) => x.id === templateId).slots[0].dogLayer, '封面狗图', '图层映射保存成功')

  // 空素材时点狗图预览：只出现狗图选图弹窗
  const picker = await t.ui(`
    $('button[aria-label="第 1 位狗图"]').click(); await sleep(500)
    const dialog = $('[role=dialog]')
    return { title: dialog?.innerText.includes('选择狗图'), empty: dialog?.innerText.includes('还没有狗图') }
  `)
  eq(picker, { title: true, empty: true }, '狗图选图弹窗为空态')
  await t.ui(`$('[role=dialog] button[aria-label="关闭抽屉 (Esc)"]')?.click(); await sleep(400)`)

  // 删除位置（二次确认，只删配置）
  await t.ui(`
    $('button[aria-label="删除第 2 位"]').click(); await sleep(300)
    await confirmIn('删除位置', 700)
  `)
  board = await t.api('psd.getBoard()')
  eq(board.templates.find((x) => x.id === templateId).slots.length, 1, '删除位置')

  // 模板重命名
  await t.ui(`
    ${go}
    tab('模板'); await sleep(400)
    $('button[aria-label="更多"]').click(); await sleep(250)
    $$('[role=menuitem]').find(m => m.textContent.includes('重命名')).click(); await sleep(300)
    setVal($('input[aria-label="模板名称"]'), 'E2E 模板已改名'); await click('保存', 700)
    tab('生产'); await sleep(400)
    return true
  `)
  board = await t.api('psd.getBoard()')
  eq(board.templates.find((x) => x.id === templateId).name, 'E2E 模板已改名', '模板重命名写入配置')
}
