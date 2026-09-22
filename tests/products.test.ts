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
    const p = updateProduct(db, 1, {
      code: 'FG002',
      name: '新名字',
      unit: '个',
      isActive: true,
      defaultCostCents: 1000,
      defaultPriceCents: 2990,
      lowStockThreshold: 100
    })
    expect(p).toMatchObject({
      code: 'FG002',
      name: '新名字',
      unit: '个',
      defaultPriceCents: 2990,
      lowStockThreshold: 100
    })
    expect(() =>
      updateProduct(db, 1, { ...p, name: '', defaultCostCents: 1, defaultPriceCents: 1, lowStockThreshold: 0 })
    ).toThrow()
    expect(() =>
      updateProduct(db, 1, { ...p, defaultCostCents: 10.5, defaultPriceCents: 1, lowStockThreshold: 0 })
    ).toThrow()
  })
})

describe('多商品', () => {
  it('新建商品带默认 SKU 与库存快照；编码重复拒绝；不能停用最后一个', async () => {
    const { createProduct, listProducts } = await import('../src/main/services/products')
    const db = testDb()
    const p = createProduct(db, {
      code: 'FG002',
      name: '车轮贴',
      unit: '套',
      isActive: true,
      defaultCostCents: 1800,
      defaultPriceCents: 4990,
      lowStockThreshold: 30
    })
    expect(p.defaultSku.code).toBe('FG002-DEFAULT')
    expect(db.prepare('SELECT quantity FROM sku_stock WHERE sku_id = ?').get(p.defaultSku.id)).toEqual({ quantity: 0 })
    expect(() =>
      createProduct(db, {
        code: 'FG002',
        name: 'x',
        unit: '件',
        isActive: true,
        defaultCostCents: 0,
        defaultPriceCents: 0,
        lowStockThreshold: 0
      })
    ).toThrow(/已存在/)
    expect(listProducts(db).map((x) => x.code)).toEqual(['FG001', 'FG002'])
    updateProduct(db, p.id, { ...p, isActive: false })
    expect(listProducts(db).map((x) => x.isActive)).toEqual([true, false])
    expect(() => updateProduct(db, 1, { ...getProduct(db), isActive: false })).toThrow(/至少保留/)
  })
})
