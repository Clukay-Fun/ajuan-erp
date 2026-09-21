// 主进程与 renderer 共用的领域类型（读模型）。

export type DocumentType = 'inbound' | 'outbound' | 'opening'
export type DocumentStatus = 'draft' | 'confirmed' | 'voided'

export interface Product {
  id: number
  code: string
  name: string
  unit: string
  imagePath: string | null
  defaultCostCents: number
  defaultPriceCents: number
  lowStockThreshold: number
  defaultSku: Sku
}

export interface Sku {
  id: number
  productId: number
  code: string
  isDefault: boolean
}

export interface StockLevel {
  skuId: number
  quantity: number
  /** 移动加权平均成本，整数分（由 e4 四舍五入得到，仅展示用） */
  avgCostCents: number
  /** 库存成本总额，整数分 */
  costValueCents: number
}

export interface DocumentSummary {
  id: number
  docNo: string
  type: DocumentType
  status: DocumentStatus
  docDate: string
  note: string
  totalQuantity: number
  totalAmountCents: number
  confirmedAt: string | null
  channelName: string | null
  externalOrderNo: string
}

export interface AppError {
  code: string
  message: string
}

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: AppError }

export interface SalesChannel {
  id: number
  name: string
  sortOrder: number
  isActive: boolean
}

export interface DocumentItem {
  id: number
  lineNo: number
  skuId: number
  skuCode: string
  productName: string
  quantity: number
  unitPriceCents: number
  /** 出库确认时的平均成本快照（分），未确认或入库为 null */
  costSnapshotCents: number | null
}

export interface DocumentDetail extends DocumentSummary {
  channelId: number | null
  channelName: string | null
  externalOrderNo: string
  voidedAt: string | null
  voidReason: string | null
  items: DocumentItem[]
}

export interface DocumentListFilter {
  type?: DocumentType
  status?: DocumentStatus
  limit?: number
}
