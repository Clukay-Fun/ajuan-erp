import { describe, expect, it } from 'vitest'
import { testDb } from './helpers'
import { createOpening } from '../src/main/services/opening'
import { createAdjustment } from '../src/main/services/adjustments'
import { getStock } from '../src/main/services/inventory'
import { voidDocument, listDocuments, createDraft, confirmDocument } from '../src/main/services/documents'
import { getOverview, getSummary } from '../src/main/services/reports'
import { listMovements } from '../src/main/services/movements'
import { openDatabase } from '../src/main/db/connection'
import { runMigrations, MIGRATIONS } from '../src/main/db/migrations'

const base = { skuId: 1, docDate: '2026-09-22', reason: '盘点' }

describe('库存调整', () => {
  it('盘盈按给定成本计入并改变均价；盘亏按均价结转', () => {
    const db = testDb()
    createOpening(db, { skuId: 1, quantity: 100, unitCostCents: 1000, docDate: '2026-09-20', note: '' })
    const up = createAdjustment(db, { ...base, direction: 'increase', quantity: 20, unitCostCents: 1600 })
    expect(up).toMatchObject({
      type: 'adjustment',
      status: 'confirmed',
      adjustDirection: 'increase',
      docNo: 'TZ20260922-001',
      note: '盘点'
    })
    expect(up.items[0]).toMatchObject({ quantity: 20, unitPriceCents: 1600, costSnapshotCents: 1600 })
    expect(getStock(db, 1)).toMatchObject({ quantity: 120, avgCostCents: 1100 })
    const down = createAdjustment(db, { ...base, direction: 'decrease', quantity: 20, unitCostCents: null })
    expect(down.items[0].unitPriceCents).toBe(1100)
    expect(getStock(db, 1)).toMatchObject({ quantity: 100, avgCostCents: 1100, costValueCents: 110000 })
  })

  it('增加时不给成本则按当前均价；库存为 0 时按 0', () => {
    const db = testDb()
    const a = createAdjustment(db, { ...base, direction: 'increase', quantity: 5, unitCostCents: null })
    expect(a.items[0].unitPriceCents).toBe(0)
    createAdjustment(db, { ...base, direction: 'increase', quantity: 5, unitCostCents: 2000 })
    const b = createAdjustment(db, { ...base, direction: 'increase', quantity: 10, unitCostCents: null })
    expect(b.items[0].unitPriceCents).toBe(1000) // (0*5 + 2000*5)/10
  })

  it('盘亏超过库存拒绝；原因必填；可作废冲回', () => {
    const db = testDb()
    createOpening(db, { skuId: 1, quantity: 10, unitCostCents: 1000, docDate: '2026-09-20', note: '' })
    expect(() => createAdjustment(db, { ...base, direction: 'decrease', quantity: 11, unitCostCents: null })).toThrow(
      /库存不足/
    )
    expect(() =>
      createAdjustment(db, { ...base, reason: ' ', direction: 'decrease', quantity: 1, unitCostCents: null })
    ).toThrow()
    const d = createAdjustment(db, { ...base, direction: 'decrease', quantity: 4, unitCostCents: null })
    expect(getStock(db, 1).quantity).toBe(6)
    voidDocument(db, d.id, '误操作')
    expect(getStock(db, 1)).toMatchObject({ quantity: 10, costValueCents: 10000 })
    expect(listMovements(db, { kind: 'adjustment' }).total).toBe(1)
  })

  it('调整不计入概览今日出入库与汇总，但出现在流水与单据列表', () => {
    const db = testDb()
    createOpening(db, { skuId: 1, quantity: 10, unitCostCents: 1000, docDate: '2026-09-20', note: '' })
    confirmDocument(
      db,
      createDraft(db, {
        type: 'inbound',
        docDate: '2026-09-22',
        channelId: null,
        externalOrderNo: '',
        note: '',
        items: [{ skuId: 1, quantity: 3, unitPriceCents: 1 }]
      }).id
    )
    createAdjustment(db, { ...base, direction: 'increase', quantity: 7, unitCostCents: 1000 })
    expect(getOverview(db, '2026-09-22').today.inQty).toBe(3)
    expect(getSummary(db, { from: '2026-09-22', to: '2026-09-22' }).inQty).toBe(3)
    expect(listDocuments(db, { type: 'adjustment' })).toHaveLength(1)
    expect(getStock(db, 1).quantity).toBe(20)
  })
})

describe('migration 002', () => {
  it('从 v1 库升级：数据保留，外键完整，可写入调整单', () => {
    const db = openDatabase(':memory:')
    runMigrations(db, [MIGRATIONS[0]])
    // 用 v1 结构直接写入一张已生效出库单及其流水（当时的 service 已不可用）
    const now = '2026-09-02T10:00:00.000Z'
    db.prepare(
      `INSERT INTO documents (id, doc_no, type, status, doc_date, channel_id, external_order_no, note, confirmed_at, created_at, updated_at)
                VALUES (1, 'CK20260902-001', 'outbound', 'confirmed', '2026-09-02', 1, 'X', '', ?, ?, ?)`
    ).run(now, now, now)
    db.prepare(
      `INSERT INTO document_items (id, document_id, line_no, sku_id, quantity, unit_price_cents, cost_snapshot_e4) VALUES (1, 1, 1, 1, 2, 500, 1000000)`
    ).run()
    db.prepare(
      `INSERT INTO stock_movements (sku_id, document_id, document_item_id, kind, quantity_delta, quantity_before, quantity_after, unit_cost_e4, cost_value_delta_e4, occurred_at, created_at)
                VALUES (1, 1, 1, 'outbound', -2, 5, 3, 1000000, -2000000, '2026-09-02T10:00:00', ?)`
    ).run(now)
    db.prepare(`UPDATE sku_stock SET quantity = 3, cost_value_e4 = 3000000 WHERE sku_id = 1`).run()

    expect(runMigrations(db)).toEqual([2])
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
    expect(db.prepare('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 })
    expect(listDocuments(db)).toHaveLength(1)
    expect(listMovements(db, {}).total).toBe(1)
    expect(getStock(db, 1)).toMatchObject({ quantity: 3, avgCostCents: 10000 })
    voidDocument(db, 1, '升级后作废')
    expect(getStock(db, 1).quantity).toBe(5)
    createAdjustment(db, { ...base, direction: 'decrease', quantity: 1, unitCostCents: null })
    expect(getStock(db, 1).quantity).toBe(4)
    // 外键仍然生效
    expect(() =>
      db
        .prepare(
          `INSERT INTO document_items (document_id, line_no, sku_id, quantity, unit_price_cents) VALUES (999, 1, 1, 1, 1)`
        )
        .run()
    ).toThrow()
  })
})
