import type {
  AdjustmentInput,
  ProductUpdateInput,
  ProductCreateInput,
  OpeningStockInput,
  DocumentDraftInput,
  ChannelCreateInput,
  ChannelUpdateInput,
  PsdJobCreateInput,
  PsdSlotCreateInput,
  PsdTemplateCreateInput
} from './schemas'
import type { PsdAssetKind, PsdBoard } from './psd'
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
  UpdateState,
  MovementFilter,
  MovementRow,
  Overview,
  Page,
  Product,
  StockRow,
  Summary,
  SummaryRange,
  SalesChannel,
  StockLevel
} from './types'

// renderer ↔ main 的白名单 IPC 契约。
// 通道名集中定义，preload 只暴露这里列出的方法，不暴露通用 invoke。

export const IPC = {
  appGetInfo: 'app:getInfo',
  windowState: 'window:state',
  updateGetState: 'update:getState',
  updateSetAutoCheck: 'update:setAutoCheck',
  updateCheck: 'update:check',
  updateDownload: 'update:download',
  updateInstall: 'update:install',
  updateOpenReleases: 'update:openReleases',
  updateState: 'update:state',
  productsGet: 'products:get',
  productsUpdate: 'products:update',
  productsList: 'products:list',
  productsGetById: 'products:getById',
  productsCreate: 'products:create',
  inventoryListStock: 'inventory:listStock',
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
  demoHasData: 'demo:hasData',
  psdGetBoard: 'psd:getBoard',
  psdPickTemplate: 'psd:pickTemplate',
  psdCreateTemplate: 'psd:createTemplate',
  psdDeleteTemplate: 'psd:deleteTemplate',
  psdAddSlot: 'psd:addSlot',
  psdDeleteSlot: 'psd:deleteSlot',
  psdImportAsset: 'psd:importAsset',
  psdCreateCutout: 'psd:createCutout',
  psdConfirmCutout: 'psd:confirmCutout',
  psdCancelCutout: 'psd:cancelCutout',
  psdDeleteAsset: 'psd:deleteAsset',
  psdCreateJob: 'psd:createJob',
  psdCancelJob: 'psd:cancelJob',
  psdRetryJob: 'psd:retryJob',
  psdSync: 'psd:sync',
  psdRequeueStuck: 'psd:requeueStuck',
  psdOpenBridge: 'psd:openBridge',
  psdOpenOutputDir: 'psd:openOutputDir',
  psdPickBridgeDir: 'psd:pickBridgeDir',
  psdPickOutputDir: 'psd:pickOutputDir',
  psdInstallPlugin: 'psd:installPlugin',
  psdOpenPlugin: 'psd:openPlugin',
  psdOpenUxpDeveloperTool: 'psd:openUxpDeveloperTool',
  psdOpenPhotoshop: 'psd:openPhotoshop',
  psdRevealJob: 'psd:revealJob'
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
    onState(handler: (state: { maximized: boolean }) => void): () => void
  }
  update: {
    getState(): Promise<IpcResult<UpdateState>>
    setAutoCheck(enabled: boolean): Promise<IpcResult<UpdateState>>
    check(): Promise<IpcResult<void>>
    download(): Promise<IpcResult<void>>
    install(): Promise<IpcResult<void>>
    openReleases(): Promise<IpcResult<void>>
    onState(handler: (state: UpdateState) => void): () => void
  }
  products: {
    /** 第一个商品（兼容） */
    get(): Promise<IpcResult<Product>>
    list(): Promise<IpcResult<Product[]>>
    getById(id: number): Promise<IpcResult<Product>>
    create(input: ProductCreateInput): Promise<IpcResult<Product>>
    update(id: number, input: ProductUpdateInput): Promise<IpcResult<Product>>
    setImage(id: number, upload: AttachmentUpload): Promise<IpcResult<Product>>
    clearImage(id: number): Promise<IpcResult<Product>>
  }
  inventory: {
    getStock(skuId: number): Promise<IpcResult<StockLevel>>
    listStock(): Promise<IpcResult<StockRow[]>>
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
  psd: {
    getBoard(): Promise<IpcResult<PsdBoard>>
    pickTemplate(): Promise<IpcResult<string | null>>
    createTemplate(input: PsdTemplateCreateInput): Promise<IpcResult<PsdBoard>>
    deleteTemplate(id: number): Promise<IpcResult<PsdBoard>>
    addSlot(input: PsdSlotCreateInput): Promise<IpcResult<PsdBoard>>
    deleteSlot(id: number): Promise<IpcResult<PsdBoard>>
    /** 取消选择时返回 null */
    importAsset(kind: PsdAssetKind): Promise<IpcResult<PsdBoard | null>>
    createCutout(assetId: number): Promise<IpcResult<PsdBoard>>
    confirmCutout(jobId: number): Promise<IpcResult<PsdBoard>>
    cancelCutout(jobId: number): Promise<IpcResult<PsdBoard>>
    deleteAsset(id: number): Promise<IpcResult<PsdBoard>>
    createJob(input: PsdJobCreateInput): Promise<IpcResult<PsdBoard>>
    cancelJob(id: number): Promise<IpcResult<PsdBoard>>
    retryJob(id: number): Promise<IpcResult<PsdBoard>>
    sync(): Promise<IpcResult<PsdBoard>>
    requeueStuck(): Promise<IpcResult<{ board: PsdBoard; count: number }>>
    openBridge(): Promise<IpcResult<void>>
    openOutputDir(): Promise<IpcResult<void>>
    pickBridgeDir(): Promise<IpcResult<PsdBoard | null>>
    pickOutputDir(): Promise<IpcResult<PsdBoard | null>>
    installPlugin(): Promise<IpcResult<PsdBoard>>
    openPlugin(): Promise<IpcResult<void>>
    openUxpDeveloperTool(): Promise<IpcResult<void>>
    openPhotoshop(): Promise<IpcResult<void>>
    revealJob(id: number): Promise<IpcResult<void>>
  }
}
