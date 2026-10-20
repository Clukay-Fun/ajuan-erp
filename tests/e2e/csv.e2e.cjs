/* eslint-disable */
// CSV 导入（含期初行、错误行、重复警告）与导出内容
const { launch, assert, eq } = require('./harness.cjs')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

module.exports = async () => {
  const t = await launch()
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ajuan-csv-'))
  const H = '类型,日期,数量,单价,渠道,外部订单号,备注\n'
  const bad = path.join(dir, 'bad.csv')
  fs.writeFileSync(
    bad,
    '﻿' +
      H +
      '期初,2026-09-01,100,10.50,,,\n出库,2026-09-11,2,29.90,抖音小店,DY1,\n出库,2026-09-11,3,29.90,抖音小店,DY1,\n出库,2026-09-12,x,29.90,淘宝,TB1,\n'
  )
  const good = path.join(dir, 'good.csv')
  fs.writeFileSync(good, H + '期初,2026-09-01,100,10.50,,,\n出库,2026-09-11,2,29.90,抖音小店,DY1,\n')

  const p = await t.api(`csv.preview(${JSON.stringify(bad)})`)
  eq(
    p.rows.map((r) => r.status),
    ['ok', 'ok', 'warning', 'error'],
    '逐行状态'
  )
  eq(p.canCommit, false, '有错误不可提交')
  const e = await t.apiErr(`csv.commit(${JSON.stringify(bad)}, true)`)
  eq(e && e.code, 'CSV_HAS_ERRORS', '错误文件提交被拒')
  eq((await t.api('documents.list({})')).length, 0, '错误文件不写入')

  const r = await t.api(`csv.commit(${JSON.stringify(good)}, false)`)
  eq(r.docNos, ['QC20260901-001', 'CK20260911-001'], '按日期生成单号')
  eq(r.stockAfter, 98, '导入后库存')
  eq(
    (await t.api(`csv.preview(${JSON.stringify(good)})`)).rows.map((x) => x.status),
    ['error', 'warning'],
    '再导：期初拒绝，订单号警告'
  )
  const notCsv = await t.apiErr(`csv.preview('/etc/hosts')`)
  eq(notCsv && notCsv.code, 'VALIDATION', '非 csv 拒绝')

  // 导入对话框可打开并显示模板说明
  const dlg = await t.ui(
    `await click('单据'); $('button[aria-label=更多]').click(); await sleep(200); $$('[role=menuitem]').find(m => m.textContent.includes('导入 CSV')).click(); await sleep(400); return text().includes('期初 / 入库 / 出库')`
  )
  assert(dlg, '导入对话框应打开')
  await t.shot('csv-import-dialog.png')
}
