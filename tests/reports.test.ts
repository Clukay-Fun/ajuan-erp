import { describe, expect, it } from 'vitest'
import { testDb } from './helpers'
import { createOpening } from '../src/main/services/opening'
import { createDraft, confirmDocument, voidDocument } from '../src/main/services/documents'
import { listMovements } from '../src/main/services/movements'
import { getOverview, getSummary, localToday } from '../src/main/services/reports'

function seed() {
  const db = testDb()
  createOpening(db, { skuId: 1, quantity: 100, unitCostCents: 1000, docDate: '2026-09-10', note: '' })
  const doc = (type: 'inbound' | 'outbound', date: string, qty: number, price: number, channelId: number | null = null, no = '') =>
    confirmDocument(db, createDraft(db, { type, docDate: date, channelId, externalOrderNo: no, note: '', items: [{ skuId: 1, quantity: qty, unitPriceCents: price }] }).id)
  doc('inbound', '2026-09-20', 50, 1300)              // 均价 11
  doc('outbound', '2026-09-20', 10, 2990, 1, 'DY1')   // 成本 11
  doc('outbound', '2026-09-21', 5, 2990, 2, 'TB1')
  const voided = doc('outbound', '2026-09-21', 3, 2990, 1, 'DY2')
  voidDocument(db, voided.id, '取消')
  createDraft(db, { type: 'inbound', docDate: '2026-09-21', channelId: null, externalOrderNo: '', note: '', items: [{ skuId: 1, quantity: 999, unitPriceCents: 1 }] })
  return db
}

describe('库存流水查询', () => {
  it('分页、筛选与单号搜索', () => {
    const db = seed()
    const all = listMovements(db)
    expect(all.total).toBe(6) // 期初 + 入库 + 出库×3（含被作废的）+ 作废反向
    expect(all.rows[0].kind).toBe('void')
    expect(listMovements(db, { kind: 'outbound' }).total).toBe(3)
    expect(listMovements(db, { channelId: 1 }).total).toBe(3) // 出库 DY1 + DY2 + DY2 的 void
    // 作废冲回的业务时间是执行当天，不落在单据日期上
    const sameDay = listMovements(db, { from: '2026-09-21', to: '2026-09-21' })
    expect(sameDay.rows.map((r) => r.kind)).toEqual(['outbound', 'outbound'])
    expect(listMovements(db, { kind: 'void' }).rows[0].occurredAt.slice(0, 10)).toBe(localToday())
    expect(listMovements(db, { docNo: 'TB1' }).rows[0]).toMatchObject({ channelName: '淘宝', quantityDelta: -5, unitPriceCents: 2990, unitCostCents: 1100 })
    expect(listMovements(db, { docNo: 'QC' }).rows[0]).toMatchObject({ kind: 'opening', quantityAfter: 100, unitCostCents: 1000 })
    const p = listMovements(db, { pageSize: 2, page: 2 })
    expect(p.rows).toHaveLength(2)
    expect(p.total).toBe(all.total)
  })
})

describe('概览', () => {
  it('今日指标只计已生效单，趋势 14 天，草稿与作废不计', () => {
    const db = seed()
    const o = getOverview(db, '2026-09-21')
    expect(o.stock).toMatchObject({ quantity: 135, avgCostCents: 1100 })
    expect(o.today).toEqual({ inQty: 0, inAmountCents: 0, outQty: 5, outAmountCents: 14950 })
    expect(o.trend).toHaveLength(14)
    expect(o.trend[0].date).toBe('2026-09-08')
    expect(o.trend.at(-1)!.date).toBe('2026-09-21')
    expect(o.trend.find((d) => d.date === '2026-09-20')).toMatchObject({ inQty: 50, outQty: 10 })
    expect(o.recentDocuments.length).toBeGreaterThan(0)
    expect(o.hasOpening).toBe(true)
  })
})

describe('日期汇总', () => {
  it('区间合计、出库成本与逐日明细', () => {
    const db = seed()
    const s = getSummary(db, { from: '2026-09-01', to: '2026-09-30' })
    expect(s).toMatchObject({ inQty: 50, inAmountCents: 65000, outQty: 15, outAmountCents: 44850, outCostCents: 16500, inDocCount: 1, outDocCount: 2 })
    expect(s.daily.map((d) => d.date)).toEqual(['2026-09-21', '2026-09-20'])
    expect(getSummary(db, { from: '2026-09-21', to: '2026-09-21' }).outQty).toBe(5)
    expect(() => getSummary(db, { from: '2026-09-22', to: '2026-09-21' })).toThrow(/不能晚于/)
  })
})
