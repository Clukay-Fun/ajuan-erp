import { describe, expect, it } from 'vitest'
import { testDb } from './helpers'
import { getProduct, updateProduct } from '../src/main/services/products'

describe('products', () => {
  it('读取种子商品与默认 SKU', () => {
    const p = getProduct(testDb())
    expect(p.code).toBe('FG001')
    expect(p.defaultSku.code).toBe('FG001-DEFAULT')
    expect(p.defaultSku.isDefault).toBe(true)
  })

  it('更新资料并校验', () => {
    const db = testDb()
    const p = updateProduct(db, {
      code: 'FG002', name: '新名字', unit: '个',
      defaultCostCents: 1000, defaultPriceCents: 2990, lowStockThreshold: 100
    })
    expect(p).toMatchObject({ code: 'FG002', name: '新名字', unit: '个', defaultPriceCents: 2990, lowStockThreshold: 100 })
    expect(() => updateProduct(db, { ...p, name: '', defaultCostCents: 1, defaultPriceCents: 1, lowStockThreshold: 0 })).toThrow()
    expect(() => updateProduct(db, { ...p, defaultCostCents: 10.5, defaultPriceCents: 1, lowStockThreshold: 0 })).toThrow()
  })
})
