import type { ProductUpdateInput, OpeningStockInput } from './schemas'
import type { DocumentSummary, IpcResult, Product, StockLevel } from './types'

// renderer ↔ main 的白名单 IPC 契约。
// 通道名集中定义，preload 只暴露这里列出的方法，不暴露通用 invoke。

export const IPC = {
  appGetInfo: 'app:getInfo',
  productsGet: 'products:get',
  productsUpdate: 'products:update',
  inventoryGetStock: 'inventory:getStock',
  openingGet: 'opening:get',
  openingCreate: 'opening:create'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]

export interface AppInfo {
  name: string
  version: string
  platform: NodeJS.Platform
  userDataPath: string
  dbPath: string
}

// preload 通过 contextBridge 暴露到 window.ajuan 的 API 形状。
export interface AjuanApi {
  app: {
    getInfo(): Promise<IpcResult<AppInfo>>
  }
  products: {
    /** 首版只有一个商品 */
    get(): Promise<IpcResult<Product>>
    update(input: ProductUpdateInput): Promise<IpcResult<Product>>
  }
  inventory: {
    getStock(skuId: number): Promise<IpcResult<StockLevel>>
  }
  opening: {
    /** 该 SKU 已确认的期初单，没有则为 null */
    get(skuId: number): Promise<IpcResult<DocumentSummary | null>>
    create(input: OpeningStockInput): Promise<IpcResult<DocumentSummary>>
  }
}
