import { describe, expect, it } from 'vitest'
import { testDb } from './helpers'
import { createOpening } from '../src/main/services/opening'
import { createDraft, confirmDocument, listDocuments } from '../src/main/services/documents'
import { getStock } from '../src/main/services/inventory'
import {
  buildTemplateCsv,
  commitImport,
  decodeCsv,
  previewImport,
  CSV_COLUMNS,
  LEGACY_COLUMNS
} from '../src/main/services/csvImport'
import { buildMovementsCsv, buildSummaryCsv } from '../src/main/services/csvExport'

const ctx = { fileName: 'test.csv', encoding: 'utf-8' as const }
const H = LEGACY_COLUMNS.join(',')
const csv = (...rows: string[]) => [H, ...rows].join('\n')

function withOpening(qty = 100) {
  const db = testDb()
  createOpening(db, { skuId: 1, quantity: qty, unitCostCents: 1000, docDate: '2026-09-01', note: '' })
  return db
}

describe('CSV 解码与模板', () => {
  it('模板可被自己解析；已有期初时只有期初行报错', () => {
    const db = withOpening()
    const p = previewImport(db, buildTemplateCsv(), ctx)
    expect(p.total).toBe(4)
    expect(p.errorCount).toBe(1)
    expect(p.rows[0].productCode).toBe('FG001')
    expect(p.rows[0].messages[0]).toMatch(/已有库存流水/)
  })
  it('UTF-8 BOM 与 GBK 都能解码', () => {
    const utf8 = new TextEncoder().encode('﻿' + csv('入库,2026-09-02,1,1,,,备注'))
    expect(decodeCsv(utf8)).toMatchObject({ encoding: 'utf-8' })
    expect(previewImport(withOpening(), decodeCsv(utf8).text, ctx).errorCount).toBe(0)
    // 用 iconv 不可用时构造 GBK 字节：'入库' 的 GBK 编码 C8 EB BF E2
    const gbk = new Uint8Array([0xc8, 0xeb, 0xbf, 0xe2, ...new TextEncoder().encode(',2026-09-02,1,1,,,')])
    const body = new Uint8Array([...new TextEncoder().encode(H + '\n'), ...gbk])
    const d = decodeCsv(body)
    expect(d.encoding).toBe('gbk')
    expect(d.text).toContain('入库,2026-09-02')
  })
})

describe('CSV 预览校验', () => {
  it('表头不符 / 空文件 直接拒绝', () => {
    const db = withOpening()
    expect(() => previewImport(db, '类型,日期\n入库,2026-09-01', ctx)).toThrow(/表头/)
    expect(() => previewImport(db, H, ctx)).toThrow(/没有数据行/)
    expect(() => previewImport(db, '', ctx)).toThrow(/为空/)
  })

  it('逐行错误定位，且有错误时 stockAfter 为 null', () => {
    const db = withOpening()
    const p = previewImport(
      db,
      csv(
        '出库,2026-09-02,2,29.90,抖音小店,DY1,', // ok
        '出库,2026-09-02,-3,29.90,淘宝,TB1,', // 数量错误
        '出库,2026/99/99,1,29.90,微信,WX1,', // 日期错误
        '退货,2026-09-03,1,1,,,', // 类型错误
        '出库,2026-09-03,1,1.234,,,', // 单价错误
        '出库,2026-09-03,1,1,小红书,,', // 渠道不存在
        '入库,2026-09-03,1,1,抖音小店,,' // 入库带渠道
      ),
      ctx
    )
    expect(p.rows.map((r) => r.status)).toEqual(['ok', 'error', 'error', 'error', 'error', 'error', 'error'])
    expect(p.rows[1].messages[0]).toMatch(/数量错误/)
    expect(p.rows[2].messages[0]).toMatch(/日期格式/)
    expect(p.rows[3].messages[0]).toMatch(/类型无法识别/)
    expect(p.rows[4].messages[0]).toMatch(/单价错误/)
    expect(p.rows[5].messages[0]).toMatch(/渠道不存在/)
    expect(p.rows[6].messages[0]).toMatch(/入库行不能/)
    expect(p.rows[1].line).toBe(3)
    expect(p.errorCount).toBe(6)
    expect(p.stockAfter).toBeNull()
    expect(p.canCommit).toBe(false)
  })

  it('按日期顺序模拟库存，中途不足标记为错误', () => {
    const db = withOpening(10)
    const p = previewImport(
      db,
      csv(
        '出库,2026-09-05,50,29.90,,,', // 到这天时库存 10+30=40 <50 → 错误
        '入库,2026-09-03,30,10,,,',
        '出库,2026-09-02,5,29.90,,,'
      ),
      ctx
    )
    expect(p.rows[0].status).toBe('error')
    expect(p.rows[0].messages[0]).toMatch(/库存为 35，需要 50/)
    expect(p.rows[1].status).toBe('ok')
    expect(p.stockAfter).toBeNull()
  })

  it('重复外部订单号：文件内与库内均为警告，不阻断但需确认', () => {
    const db = withOpening()
    confirmDocument(
      db,
      createDraft(db, {
        type: 'outbound',
        docDate: '2026-09-01',
        channelId: 1,
        externalOrderNo: 'DY1',
        note: '',
        items: [{ skuId: 1, quantity: 1, unitPriceCents: 1 }]
      }).id
    )
    const text = csv(
      '出库,2026-09-02,1,29.90,抖音小店,DY1,',
      '出库,2026-09-02,1,29.90,抖音小店,DY2,',
      '出库,2026-09-02,1,29.90,抖音小店,DY2,',
      '出库,2026-09-02,1,29.90,淘宝,DY2,'
    )
    const p = previewImport(db, text, ctx)
    expect(p.rows.map((r) => r.status)).toEqual(['warning', 'ok', 'warning', 'ok'])
    expect(p.rows[0].messages[0]).toMatch(/已有单据 CK20260901-001/)
    expect(p.rows[2].messages[0]).toMatch(/与第 3 行/)
    expect(p.canCommit).toBe(true)
    expect(p.stockAfter).toBe(100 - 1 - 4)
    expect(() => commitImport(db, text, ctx, false)).toThrow(/警告/)
    expect(commitImport(db, text, ctx, true).documentCount).toBe(4)
  })
})

describe('CSV 原子导入', () => {
  it('有错误行整批不写', () => {
    const db = withOpening()
    const before = db.prepare('SELECT COUNT(*) AS c FROM documents').get()
    expect(() => commitImport(db, csv('入库,2026-09-02,10,10,,,', '出库,bad,1,1,,,'), ctx, false)).toThrow(/1 行错误/)
    expect(db.prepare('SELECT COUNT(*) AS c FROM documents').get()).toEqual(before)
    expect(getStock(db, 1).quantity).toBe(100)
  })

  it('合法文件按日期顺序生成已确认单据、流水与成本快照', () => {
    const db = testDb()
    const r = commitImport(
      db,
      csv('出库,2026-09-03,2,29.90,抖音小店,DY1,发货', '入库,2026-09-02,10,12,,,', '入库,2026-09-02,10,10,,,首批'),
      ctx,
      false
    )
    expect(r.documentCount).toBe(3)
    expect(r.docNos).toEqual(['RK20260902-001', 'RK20260902-002', 'CK20260903-001'])
    expect(r.stockAfter).toBe(18)
    const s = getStock(db, 1)
    expect(s.avgCostCents).toBe(1100)
    const docs = listDocuments(db, { type: 'outbound' })
    expect(docs[0]).toMatchObject({
      status: 'confirmed',
      channelName: '抖音小店',
      externalOrderNo: 'DY1',
      note: '发货'
    })
    const snap = db.prepare('SELECT cost_snapshot_e4 FROM document_items WHERE document_id = ?').get(docs[0].id) as {
      cost_snapshot_e4: number
    }
    expect(Number(snap.cost_snapshot_e4)).toBe(1100 * 100)
    const notes = listDocuments(db, { type: 'inbound' })
      .map((d) => d.note)
      .sort()
    expect(notes).toEqual(['CSV 导入：test.csv', '首批'])
  })

  it('重复导入同一文件：无订单号的行不会被识别为重复（只能靠用户），有订单号的会警告', () => {
    const db = withOpening()
    const text = csv('出库,2026-09-02,1,29.90,抖音小店,DY9,')
    commitImport(db, text, ctx, false)
    const p = previewImport(db, text, ctx)
    expect(p.warningCount).toBe(1)
  })
})

describe('CSV 导出', () => {
  it('流水与汇总导出带 BOM 与合计行', () => {
    const db = withOpening()
    commitImport(db, csv('出库,2026-09-02,2,29.90,抖音小店,DY1,'), ctx, false)
    const mv = buildMovementsCsv(db, {})
    expect(mv.startsWith('﻿时间,商品编码,商品,类型,单号')).toBe(true)
    expect(mv.split('\n').filter(Boolean)).toHaveLength(3)
    expect(mv).toContain('FG001,电动车发光小饰品,出库,CK20260902-001,抖音小店,DY1,-2,29.90,10.00,98')
    const sm = buildSummaryCsv(db, { from: '2026-09-01', to: '2026-09-30' })
    expect(sm).toContain('2026-09-02,0,0.00,2,59.80')
    expect(sm).toContain('合计 2026-09-01 ~ 2026-09-30,0,0.00,2,59.80')
  })
})

describe('CSV 期初行', () => {
  const H2 = LEGACY_COLUMNS.join(',')
  const csv2 = (...rows: string[]) => [H2, ...rows].join('\n')
  it('全新库可导入一行期初，日期须最早，之后不能再导', () => {
    const db = testDb()
    const p = previewImport(db, csv2('入库,2026-09-01,10,10,,,', '期初,2026-08-31,50,8,,,'), ctx)
    expect(p.errorCount).toBe(0)
    expect(p.stockAfter).toBe(60)
    expect(p.inQty).toBe(10) // 期初不算入库
    const r = commitImport(db, csv2('入库,2026-09-01,10,10,,,', '期初,2026-08-31,50,8,,,'), ctx, false)
    expect(r.docNos).toEqual(['QC20260831-001', 'RK20260901-001'])
    expect(getStock(db, 1)).toMatchObject({ quantity: 60, costValueCents: 50 * 800 + 10 * 1000 })
    const again = previewImport(db, csv2('期初,2026-08-30,1,1,,,'), ctx)
    expect(again.rows[0].messages[0]).toMatch(/已有库存流水/)
  })
  it('期初晚于其他行、两行期初、带渠道 都是错误', () => {
    const db = testDb()
    const p = previewImport(
      db,
      csv2('期初,2026-09-02,50,8,,,', '入库,2026-09-01,10,10,,,', '期初,2026-08-01,1,1,抖音小店,,'),
      ctx
    )
    expect(p.rows[0].messages.join()).toMatch(/必须早于/)
    expect(p.rows[2].messages.join()).toMatch(/只能有一行/)
    expect(p.rows[2].messages.join()).toMatch(/期初行不能填写渠道/)
    expect(p.canCommit).toBe(false)
  })
  it('模板自带期初行，在空库上整体合法', () => {
    expect(previewImport(testDb(), buildTemplateCsv(), ctx).errorCount).toBe(0)
  })
})

describe('CSV 多商品', () => {
  it('新模板按商品编码分别模拟库存；未知 / 停用编码报错；旧模板归到第一个商品', async () => {
    const { createProduct, updateProduct } = await import('../src/main/services/products')
    const db = testDb()
    const p2 = createProduct(db, {
      code: 'FG002',
      name: '车轮贴',
      unit: '套',
      isActive: true,
      defaultCostCents: 1800,
      defaultPriceCents: 4990,
      lowStockThreshold: 0
    })
    const H8 = CSV_COLUMNS.join(',')
    const text = [
      H8,
      'FG001,期初,2026-09-01,10,10,,,',
      'FG002,期初,2026-09-01,5,18,,,',
      'FG002,出库,2026-09-02,6,49.9,淘宝,T1,'
    ].join('\n')
    const p = previewImport(db, text, ctx)
    expect(p.rows.map((r) => r.status)).toEqual(['ok', 'ok', 'error'])
    expect(p.rows[2].messages[0]).toMatch(/该商品库存为 5，需要 6/)
    expect(previewImport(db, [H8, 'FG003,入库,2026-09-02,1,1,,,'].join('\n'), ctx).rows[0].messages[0]).toMatch(
      /商品编码不存在/
    )
    const good = [
      H8,
      'FG001,期初,2026-09-01,10,10,,,',
      'FG002,期初,2026-09-01,5,18,,,',
      'FG002,出库,2026-09-02,2,49.9,淘宝,T1,'
    ].join('\n')
    const r = commitImport(db, good, ctx, false)
    expect(r.stockAfter).toBe(13)
    expect(getStock(db, p2.defaultSku.id).quantity).toBe(3)
    updateProduct(db, p2.id, { ...p2, isActive: false })
    expect(previewImport(db, [H8, 'FG002,入库,2026-09-03,1,1,,,'].join('\n'), ctx).rows[0].messages[0]).toMatch(
      /已停用/
    )
    // 旧模板归到 FG001
    const legacy = previewImport(db, [LEGACY_COLUMNS.join(','), '入库,2026-09-03,1,1,,,'].join('\n'), ctx)
    expect(legacy.rows[0]).toMatchObject({ status: 'ok', productCode: 'FG001' })
  })
})
