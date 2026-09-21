import type {
  ProductUpdateInput,
  OpeningStockInput,
  DocumentDraftInput,
  ChannelCreateInput,
  ChannelUpdateInput
} from './schemas'
import type {
  DocumentDetail,
  DocumentListFilter,
  DocumentSummary,
  IpcResult,
  MovementFilter,
  MovementRow,
  Overview,
  Page,
  Product,
  Summary,
  SummaryRange,
  SalesChannel,
  StockLevel
} from './types'

// renderer ↔ main 的白名单 IPC 契约。
// 通道名集中定义，preload 只暴露这里列出的方法，不暴露通用 invoke。

export const IPC = {
  appGetInfo: 'app:getInfo',
  productsGet: 'products:get',
  productsUpdate: 'products:update',
  inventoryGetStock: 'inventory:getStock',
  openingGet: 'opening:get',
  openingCreate: 'opening:create',
  documentsList: 'documents:list',
  documentsGet: 'documents:get',
  documentsCreateDraft: 'documents:createDraft',
  documentsUpdateDraft: 'documents:updateDraft',
  documentsDeleteDraft: 'documents:deleteDraft',
  documentsConfirm: 'documents:confirm',
  documentsVoid: 'documents:void',
  documentsFindDuplicate: 'documents:findDuplicate',
  channelsList: 'channels:list',
  channelsCreate: 'channels:create',
  channelsUpdate: 'channels:update',
  inventoryListMovements: 'inventory:listMovements',
  overviewGet: 'overview:get',
  summaryGet: 'summary:get'
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
    listMovements(filter: MovementFilter): Promise<IpcResult<Page<MovementRow>>>
  }
  overview: {
    get(): Promise<IpcResult<Overview>>
  }
  summary: {
    get(range: SummaryRange): Promise<IpcResult<Summary>>
  }
  opening: {
    /** 该 SKU 已确认的期初单，没有则为 null */
    get(skuId: number): Promise<IpcResult<DocumentSummary | null>>
    create(input: OpeningStockInput): Promise<IpcResult<DocumentSummary>>
  }
  documents: {
    list(filter: DocumentListFilter): Promise<IpcResult<DocumentSummary[]>>
    get(id: number): Promise<IpcResult<DocumentDetail>>
    createDraft(input: DocumentDraftInput): Promise<IpcResult<DocumentDetail>>
    updateDraft(id: number, input: DocumentDraftInput): Promise<IpcResult<DocumentDetail>>
    deleteDraft(id: number): Promise<IpcResult<void>>
    confirm(id: number): Promise<IpcResult<DocumentDetail>>
    void(id: number, reason: string): Promise<IpcResult<DocumentDetail>>
    /** 同渠道下已存在相同外部订单号的单据（用于提示，不阻断） */
    findDuplicate(channelId: number | null, externalOrderNo: string, excludeId: number | null): Promise<IpcResult<DocumentSummary | null>>
  }
  channels: {
    list(): Promise<IpcResult<SalesChannel[]>>
    create(input: ChannelCreateInput): Promise<IpcResult<SalesChannel>>
    update(id: number, input: ChannelUpdateInput): Promise<IpcResult<SalesChannel>>
  }
}
