import type {
  AdjustmentInput,
  ProductUpdateInput,
  OpeningStockInput,
  DocumentDraftInput,
  ChannelCreateInput,
  ChannelUpdateInput
} from './schemas'
import type {
  Attachment,
  AttachmentUpload,
  BackupInspection,
  CsvImportPreview,
  CsvImportResult,
  DocumentDetail,
  TrashEntry,
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
  summaryGet: 'summary:get',
  csvPickImportFile: 'csv:pickImportFile',
  csvPreview: 'csv:preview',
  csvCommit: 'csv:commit',
  csvSaveTemplate: 'csv:saveTemplate',
  csvExportMovements: 'csv:exportMovements',
  csvExportSummary: 'csv:exportSummary',
  attachmentsList: 'attachments:list',
  attachmentsAdd: 'attachments:add',
  attachmentsRemove: 'attachments:remove',
  backupCreate: 'backup:create',
  backupPick: 'backup:pick',
  backupInspect: 'backup:inspect',
  backupRestore: 'backup:restore',
  adjustmentsCreate: 'adjustments:create',
  productsSetImage: 'products:setImage',
  productsClearImage: 'products:clearImage',
  csvExportDocument: 'csv:exportDocument',
  backupListTrash: 'backup:listTrash',
  backupClearTrash: 'backup:clearTrash',
  demoSeed: 'demo:seed',
  demoReset: 'demo:reset',
  demoHasData: 'demo:hasData'
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
    setImage(upload: AttachmentUpload): Promise<IpcResult<Product>>
    clearImage(): Promise<IpcResult<Product>>
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
  csv: {
    /** 打开文件选择框，取消返回 null */
    pickImportFile(): Promise<IpcResult<string | null>>
    preview(path: string): Promise<IpcResult<CsvImportPreview>>
    /** 重新解析校验后在单个事务内写入；acknowledgeWarnings 为 false 且存在警告时拒绝 */
    commit(path: string, acknowledgeWarnings: boolean): Promise<IpcResult<CsvImportResult>>
    saveTemplate(): Promise<IpcResult<string | null>>
    exportMovements(filter: MovementFilter): Promise<IpcResult<string | null>>
    exportSummary(range: SummaryRange): Promise<IpcResult<string | null>>
    exportDocument(id: number): Promise<IpcResult<string | null>>
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
    findDuplicate(
      channelId: number | null,
      externalOrderNo: string,
      excludeId: number | null
    ): Promise<IpcResult<DocumentSummary | null>>
  }
  channels: {
    list(): Promise<IpcResult<SalesChannel[]>>
    create(input: ChannelCreateInput): Promise<IpcResult<SalesChannel>>
    update(id: number, input: ChannelUpdateInput): Promise<IpcResult<SalesChannel>>
  }
  attachments: {
    list(documentId: number): Promise<IpcResult<Attachment[]>>
    add(documentId: number, upload: AttachmentUpload): Promise<IpcResult<Attachment>>
    remove(id: number): Promise<IpcResult<void>>
  }
  backup: {
    /** 保存对话框 → 生成备份，取消返回 null */
    create(): Promise<IpcResult<string | null>>
    pick(): Promise<IpcResult<string | null>>
    inspect(path: string): Promise<IpcResult<BackupInspection>>
    /** 恢复成功后主进程会重新加载窗口 */
    restore(path: string): Promise<IpcResult<void>>
    listTrash(): Promise<IpcResult<TrashEntry[]>>
    clearTrash(): Promise<IpcResult<void>>
  }
  adjustments: {
    /** 直接生成已确认的库存调整单 */
    create(input: AdjustmentInput): Promise<IpcResult<DocumentDetail>>
  }
  demo: {
    hasData(): Promise<IpcResult<boolean>>
    /** 空库上载入示例数据 */
    seed(): Promise<IpcResult<{ documents: number }>>
    /** 清空全部业务数据，保留商品与渠道 */
    reset(): Promise<IpcResult<void>>
  }
}
