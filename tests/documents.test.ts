import { describe, expect, it, beforeEach } from 'vitest'
import { testDb } from './helpers'
import type { Db } from '../src/main/db/connection'
import { createOpening } from '../src/main/services/opening'
import { getStock } from '../src/main/services/inventory'
import {
  createDraft,
  updateDraft,
  deleteDraft,
  confirmDocument,
  voidDocument,
  listDocuments,
  getDocument,
  findDuplicateOrder
} from '../src/main/services/documents'
import { createChannel, listChannels, updateChannel } from '../src/main/services/channels'

const inbound = (qty: number, price: number, date = '2026-09-21') => ({
  type: 'inbound' as const,
  docDate: date,
  channelId: null,
  externalOrderNo: '',
  note: '',
  items: [{ skuId: 1, quantity: qty, unitPriceCents: price }]
})
const outbound = (
  qty: number,
  price: number,
  extra: Partial<{ channelId: number | null; externalOrderNo: string }> = {}
) => ({
  type: 'outbound' as const,
  docDate: '2026-09-21',
  channelId: null,
  externalOrderNo: '',
  note: '',
  ...extra,
  items: [{ skuId: 1, quantity: qty, unitPriceCents: price }]
})

/** 由流水重放库存，验证快照与流水一致 */
function replay(db: Db, skuId: number): { qty: number; cost: bigint } {
  const rows = db
    .prepare(`SELECT quantity_delta, cost_value_delta_e4 FROM stock_movements WHERE sku_id = ? ORDER BY id`)
    .all(skuId) as { quantity_delta: number; cost_value_delta_e4: number | bigint }[]
  return rows.reduce(
    (acc, r) => ({ qty: acc.qty + r.quantity_delta, cost: acc.cost + BigInt(r.cost_value_delta_e4) }),
    { qty: 0, cost: 0n }
  )
}
function expectReconciled(db: Db): void {
  const s = getStock(db, 1)
  const r = replay(db, 1)
  expect(s.quantity).toBe(r.qty)
  expect(BigInt(s.costValueCents) * 100n).toBe(r.cost)
}

describe('单据草稿', () => {
  let db: Db
  beforeEach(() => {
    db = testDb()
  })

  it('创建 / 修改 / 删除草稿，不影响库存', () => {
    const d = createDraft(db, inbound(10, 1000))
    expect(d).toMatchObject({ docNo: 'RK20260921-001', status: 'draft', totalQuantity: 10, totalAmountCents: 10000 })
    expect(getStock(db, 1).quantity).toBe(0)
    const u = updateDraft(db, d.id, { ...inbound(20, 1100), note: '改' })
    expect(u).toMatchObject({ docNo: 'RK20260921-001', totalQuantity: 20, note: '改' })
    expect(u.items).toHaveLength(1)
    deleteDraft(db, d.id)
    expect(() => getDocument(db, d.id)).toThrow(/不存在/)
    expect(db.prepare('SELECT COUNT(*) AS c FROM document_items').get()).toEqual({ c: 0 })
  })

  it('同日单号递增；入库不能带渠道；空明细拒绝', () => {
    createDraft(db, inbound(1, 1))
    expect(createDraft(db, inbound(1, 1)).docNo).toBe('RK20260921-002')
    expect(createDraft(db, outbound(1, 1)).docNo).toBe('CK20260921-001')
    expect(() => createDraft(db, { ...inbound(1, 1), channelId: 1 })).toThrow(/入库单不能/)
    expect(() => createDraft(db, { ...inbound(1, 1), items: [] })).toThrow()
  })
})

describe('确认与作废', () => {
  let db: Db
  beforeEach(() => {
    db = testDb()
    createOpening(db, { skuId: 1, quantity: 100, unitCostCents: 1000, docDate: '2026-09-20', note: '' })
  })

  it('不同价格入库后均价正确，出库按均价结转并记录成本快照', () => {
    confirmDocument(db, createDraft(db, inbound(50, 1300)).id)
    expect(getStock(db, 1)).toMatchObject({ quantity: 150, avgCostCents: 1100 })
    const ck = confirmDocument(db, createDraft(db, outbound(2, 2990, { channelId: 1, externalOrderNo: 'DY1' })).id)
    expect(ck.status).toBe('confirmed')
    expect(ck.items[0].costSnapshotCents).toBe(1100)
    expect(getStock(db, 1)).toMatchObject({ quantity: 148, avgCostCents: 1100, costValueCents: 162800 })
    expectReconciled(db)
  })

  it('库存不足时整单回滚，不留流水', () => {
    const d = createDraft(db, {
      ...outbound(60, 2990),
      items: [
        { skuId: 1, quantity: 60, unitPriceCents: 2990 },
        { skuId: 1, quantity: 50, unitPriceCents: 2990 }
      ]
    })
    expect(() => confirmDocument(db, d.id)).toThrow(/库存不足/)
    expect(getDocument(db, d.id).status).toBe('draft')
    expect(getStock(db, 1).quantity).toBe(100)
    expect(db.prepare(`SELECT COUNT(*) AS c FROM stock_movements WHERE document_id = ?`).get(d.id)).toEqual({ c: 0 })
  })

  it('已生效单据不能修改或删除；草稿不能作废', () => {
    const d = confirmDocument(db, createDraft(db, inbound(1, 1)).id)
    expect(() => updateDraft(db, d.id, inbound(2, 2))).toThrow(/已生效/)
    expect(() => deleteDraft(db, d.id)).toThrow(/已生效/)
    expect(() => confirmDocument(db, d.id)).toThrow(/已生效/)
    const draft = createDraft(db, inbound(1, 1))
    expect(() => voidDocument(db, draft.id, 'x')).toThrow(/只有已生效/)
    expect(() => voidDocument(db, d.id, '  ')).toThrow(/作废原因/)
  })

  it('作废出库单：按原成本冲回，均价不变', () => {
    confirmDocument(db, createDraft(db, inbound(50, 1300)).id) // 均价 11
    const ck = confirmDocument(db, createDraft(db, outbound(30, 2990)).id)
    confirmDocument(db, createDraft(db, inbound(20, 2000)).id) // 均价变化
    const before = getStock(db, 1)
    const v = voidDocument(db, ck.id, '发错货')
    expect(v).toMatchObject({ status: 'voided', voidReason: '发错货' })
    const after = getStock(db, 1)
    expect(after.quantity).toBe(before.quantity + 30)
    expect(after.costValueCents).toBe(before.costValueCents + 30 * 1100)
    expect(
      db.prepare(`SELECT COUNT(*) AS c FROM stock_movements WHERE document_id = ? AND kind = 'void'`).get(ck.id)
    ).toEqual({ c: 1 })
    expectReconciled(db)
    expect(() => voidDocument(db, ck.id, '再来')).toThrow(/只有已生效/)
  })

  it('作废入库单：已售出导致库存不足时拒绝', () => {
    const rk = confirmDocument(db, createDraft(db, inbound(50, 1300)).id)
    confirmDocument(db, createDraft(db, outbound(120, 2990)).id)
    expect(() => voidDocument(db, rk.id, '退货')).toThrow(/库存不足/)
    expect(getDocument(db, rk.id).status).toBe('confirmed')
    expectReconciled(db)
  })

  it('作废入库单成功后成本精确回到作废前', () => {
    const s0 = getStock(db, 1)
    const rk = confirmDocument(db, createDraft(db, inbound(50, 1300)).id)
    voidDocument(db, rk.id, '重复录入')
    expect(getStock(db, 1)).toEqual(s0)
    expectReconciled(db)
  })

  it('期初单不能作废', () => {
    const qc = listDocuments(db, { type: 'opening' })[0]
    expect(() => voidDocument(db, qc.id, 'x')).toThrow(/期初单不能作废/)
  })

  it('列表筛选与排序', () => {
    confirmDocument(db, createDraft(db, inbound(1, 1, '2026-09-22')).id)
    createDraft(db, inbound(1, 1, '2026-09-19'))
    const all = listDocuments(db)
    expect(all.map((d) => d.docDate)).toEqual(['2026-09-22', '2026-09-20', '2026-09-19'])
    expect(listDocuments(db, { status: 'draft' })).toHaveLength(1)
    expect(listDocuments(db, { type: 'inbound', status: 'confirmed' })).toHaveLength(1)
  })
})

describe('重复外部订单号与渠道', () => {
  it('同渠道同订单号可查到，作废的不算，不同渠道不算', () => {
    const db = testDb()
    createOpening(db, { skuId: 1, quantity: 10, unitCostCents: 1, docDate: '2026-09-20', note: '' })
    const a = createDraft(db, outbound(1, 1, { channelId: 1, externalOrderNo: 'DY100' }))
    expect(findDuplicateOrder(db, 1, 'DY100', null)?.id).toBe(a.id)
    expect(findDuplicateOrder(db, 1, 'DY100', a.id)).toBeNull()
    expect(findDuplicateOrder(db, 2, 'DY100', null)).toBeNull()
    expect(findDuplicateOrder(db, null, 'DY100', null)).toBeNull()
    confirmDocument(db, a.id)
    voidDocument(db, a.id, '取消')
    expect(findDuplicateOrder(db, 1, 'DY100', null)).toBeNull()
  })

  it('渠道新增 / 改名 / 停用，重名拒绝', () => {
    const db = testDb()
    expect(listChannels(db).map((c) => c.name)).toEqual(['抖音小店', '淘宝', '拼多多', '微信', '线下', '其他'])
    const c = createChannel(db, { name: '小红书' })
    expect(c.sortOrder).toBe(6)
    expect(() => createChannel(db, { name: '淘宝' })).toThrow(/已存在/)
    expect(updateChannel(db, c.id, { name: '小红书店', isActive: false })).toMatchObject({
      name: '小红书店',
      isActive: false
    })
    expect(() => updateChannel(db, c.id, { name: '微信', isActive: true })).toThrow(/已存在/)
  })
})
