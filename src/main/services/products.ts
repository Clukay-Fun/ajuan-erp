import type { Db } from '../db/connection'
import { nowIso } from '../db/connection'
import { productUpdateSchema, type ProductUpdateInput } from '@shared/schemas'
import type { Product } from '@shared/types'
import { ServiceError } from './errors'

interface ProductRow {
  id: number
  code: string
  name: string
  unit: string
  image_path: string | null
  default_cost_cents: number
  default_price_cents: number
  low_stock_threshold: number
  sku_id: number
  sku_code: string
}

const SELECT = `
  SELECT p.id, p.code, p.name, p.unit, p.image_path, p.default_cost_cents, p.default_price_cents,
         p.low_stock_threshold, s.id AS sku_id, s.code AS sku_code
  FROM products p JOIN skus s ON s.product_id = p.id AND s.is_default = 1`

function toProduct(r: ProductRow): Product {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    unit: r.unit,
    imagePath: r.image_path,
    defaultCostCents: r.default_cost_cents,
    defaultPriceCents: r.default_price_cents,
    lowStockThreshold: r.low_stock_threshold,
    defaultSku: { id: r.sku_id, productId: r.id, code: r.sku_code, isDefault: true }
  }
}

/** 首版只有一个商品，固定取 id=1。 */
export function getProduct(db: Db): Product {
  const row = db.prepare(`${SELECT} WHERE p.id = 1`).get() as ProductRow | undefined
  if (!row) throw new ServiceError('NOT_FOUND', '商品不存在')
  return toProduct(row)
}

export function updateProduct(db: Db, raw: ProductUpdateInput): Product {
  const input = productUpdateSchema.parse(raw)
  const dup = db.prepare(`SELECT id FROM products WHERE code = ? AND id <> 1`).get(input.code)
  if (dup) throw new ServiceError('DUPLICATE_CODE', `商品编码 ${input.code} 已存在`)
  db.prepare(
    `UPDATE products SET code = ?, name = ?, unit = ?, default_cost_cents = ?, default_price_cents = ?,
       low_stock_threshold = ?, updated_at = ? WHERE id = 1`
  ).run(
    input.code,
    input.name,
    input.unit,
    input.defaultCostCents,
    input.defaultPriceCents,
    input.lowStockThreshold,
    nowIso()
  )
  return getProduct(db)
}
