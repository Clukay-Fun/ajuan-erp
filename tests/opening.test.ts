import { describe, expect, it } from 'vitest'
import { testDb } from './helpers'
import { createOpening, getOpening } from '../src/main/services/opening'
import { getStock, applyMovement } from '../src/main/services/inventory'
import { centsToE4 } from '../src/shared/money'

const base = { skuId: 1, quantity: 100, unitCostCents: 1000, docDate: '2026-09-21', note: '盘点' }

describe('opening stock', () => {
  it('生成已确认期初单、流水与库存快照', () => {
    const db = testDb()
    expect(getOpening(db, 1)).toBeNull()
    const doc = createOpening(db, base)
    expect(doc).toMatchObject({
      docNo: 'QC20260921-001',
      type: 'opening',
      status: 'confirmed',
      totalQuantity: 100,
      totalAmountCents: 100000
    })
    expect(getOpening(db, 1)?.id).toBe(doc.id)
    expect(getStock(db, 1)).toEqual({ skuId: 1, quantity: 100, avgCostCents: 1000, costValueCents: 100000 })
    const mv = db.prepare('SELECT * FROM stock_movements').all()
    expect(mv).toHaveLength(1)
    expect(mv[0]).toMatchObject({ kind: 'opening', quantity_before: 0, quantity_after: 100, quantity_delta: 100 })
  })

  it('已有流水后禁止再次录入期初，且失败不留痕', () => {
    const db = testDb()
    createOpening(db, base)
    expect(() => createOpening(db, base)).toThrow(/已有库存流水/)
    expect(db.prepare('SELECT COUNT(*) AS c FROM documents').get()).toEqual({ c: 1 })
  })

  it('校验失败不写入', () => {
    const db = testDb()
    expect(() => createOpening(db, { ...base, quantity: 0 })).toThrow()
    expect(() => createOpening(db, { ...base, docDate: '2026/09/21' })).toThrow()
    expect(db.prepare('SELECT COUNT(*) AS c FROM documents').get()).toEqual({ c: 0 })
  })
})

describe('移动加权平均成本', () => {
  it('计划示例：100×10 + 50×13 → 均价 11；出库不改均价；清零无残留', () => {
    const db = testDb()
    const doc = createOpening(db, { ...base, quantity: 100, unitCostCents: 1000 })
    const mv = (delta: number, cents: number, kind: 'inbound' | 'outbound') =>
      applyMovement(db, {
        skuId: 1,
        documentId: doc.id,
        documentItemId: null,
        kind,
        quantityDelta: delta,
        unitCostE4: centsToE4(cents),
        occurredAt: '2026-09-21T10:00:00'
      })
    mv(50, 1300, 'inbound')
    expect(getStock(db, 1)).toMatchObject({ quantity: 150, avgCostCents: 1100, costValueCents: 165000 })
    mv(-30, 0, 'outbound')
    expect(getStock(db, 1)).toMatchObject({ quantity: 120, avgCostCents: 1100, costValueCents: 132000 })
    // 非整除均价：120 件 ¥1100 + 7 件 ¥12.34 → 用 e4 精度承载
    mv(7, 1234, 'inbound')
    const s = getStock(db, 1)
    expect(s.quantity).toBe(127)
    expect(s.costValueCents).toBe(132000 + 7 * 1234)
    mv(-127, 0, 'outbound')
    expect(getStock(db, 1)).toEqual({ skuId: 1, quantity: 0, avgCostCents: 0, costValueCents: 0 })
    expect(() => mv(-1, 0, 'outbound')).toThrow(/库存不足/)
  })
})
