import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type AjuanApi } from '@shared/ipc'

const api: AjuanApi = {
  app: {
    getInfo: () => ipcRenderer.invoke(IPC.appGetInfo),
    revealPath: (target) => ipcRenderer.invoke(IPC.appRevealPath, target),
    setTitleBarOverlay: (overlay) => ipcRenderer.invoke(IPC.windowSetTitleBarOverlay, overlay),
    onState: (handler) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: Parameters<typeof handler>[0]) => handler(payload)
      ipcRenderer.on(IPC.windowState, listener)
      return () => ipcRenderer.removeListener(IPC.windowState, listener)
    }
  },
  update: {
    getState: () => ipcRenderer.invoke(IPC.updateGetState),
    setAutoCheck: (enabled) => ipcRenderer.invoke(IPC.updateSetAutoCheck, enabled),
    check: () => ipcRenderer.invoke(IPC.updateCheck),
    download: () => ipcRenderer.invoke(IPC.updateDownload),
    install: () => ipcRenderer.invoke(IPC.updateInstall),
    openReleases: () => ipcRenderer.invoke(IPC.updateOpenReleases),
    onState: (handler) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: Parameters<typeof handler>[0]) => handler(payload)
      ipcRenderer.on(IPC.updateState, listener)
      return () => ipcRenderer.removeListener(IPC.updateState, listener)
    }
  },
  products: {
    get: () => ipcRenderer.invoke(IPC.productsGet),
    list: () => ipcRenderer.invoke(IPC.productsList),
    getById: (id) => ipcRenderer.invoke(IPC.productsGetById, id),
    create: (input) => ipcRenderer.invoke(IPC.productsCreate, input),
    update: (id, input) => ipcRenderer.invoke(IPC.productsUpdate, id, input),
    setImage: (id, upload) => ipcRenderer.invoke(IPC.productsSetImage, id, upload),
    clearImage: (id) => ipcRenderer.invoke(IPC.productsClearImage, id),
    getLastPrices: (input) => ipcRenderer.invoke(IPC.productsGetLastPrices, input)
  },
  stats: {
    getSummary: (input) => ipcRenderer.invoke(IPC.statsGetSummary, input),
    getDailySeries: (input) => ipcRenderer.invoke(IPC.statsGetDailySeries, input),
    getLatestActivityDate: () => ipcRenderer.invoke(IPC.statsGetLatestActivityDate),
    getProductHealth: (input) => ipcRenderer.invoke(IPC.statsGetProductHealth, input)
  },
  inventory: {
    getStock: (skuId) => ipcRenderer.invoke(IPC.inventoryGetStock, skuId),
    listStock: () => ipcRenderer.invoke(IPC.inventoryListStock),
    listMovements: (filter) => ipcRenderer.invoke(IPC.inventoryListMovements, filter)
  },
  overview: {
    get: () => ipcRenderer.invoke(IPC.overviewGet)
  },
  summary: {
    get: (range) => ipcRenderer.invoke(IPC.summaryGet, range)
  },
  csv: {
    pickImportFile: () => ipcRenderer.invoke(IPC.csvPickImportFile),
    preview: (path) => ipcRenderer.invoke(IPC.csvPreview, path),
    commit: (path, ack) => ipcRenderer.invoke(IPC.csvCommit, path, ack),
    saveTemplate: () => ipcRenderer.invoke(IPC.csvSaveTemplate),
    saveText: (input) => ipcRenderer.invoke(IPC.csvSaveText, input),
    exportMovements: (filter) => ipcRenderer.invoke(IPC.csvExportMovements, filter),
    exportSummary: (range) => ipcRenderer.invoke(IPC.csvExportSummary, range),
    exportDocument: (id) => ipcRenderer.invoke(IPC.csvExportDocument, id)
  },
  opening: {
    get: (skuId) => ipcRenderer.invoke(IPC.openingGet, skuId),
    create: (input) => ipcRenderer.invoke(IPC.openingCreate, input)
  },
  documents: {
    list: (filter) => ipcRenderer.invoke(IPC.documentsList, filter),
    get: (id) => ipcRenderer.invoke(IPC.documentsGet, id),
    createDraft: (input) => ipcRenderer.invoke(IPC.documentsCreateDraft, input),
    updateDraft: (id, input) => ipcRenderer.invoke(IPC.documentsUpdateDraft, id, input),
    deleteDraft: (id) => ipcRenderer.invoke(IPC.documentsDeleteDraft, id),
    confirm: (id) => ipcRenderer.invoke(IPC.documentsConfirm, id),
    void: (id, reason) => ipcRenderer.invoke(IPC.documentsVoid, id, reason),
    getPendingSummary: () => ipcRenderer.invoke(IPC.documentsGetPendingSummary),
    findDuplicate: (channelId, no, excludeId) =>
      ipcRenderer.invoke(IPC.documentsFindDuplicate, channelId, no, excludeId)
  },
  channels: {
    list: () => ipcRenderer.invoke(IPC.channelsList),
    create: (input) => ipcRenderer.invoke(IPC.channelsCreate, input),
    update: (id, input) => ipcRenderer.invoke(IPC.channelsUpdate, id, input)
  },
  attachments: {
    list: (documentId) => ipcRenderer.invoke(IPC.attachmentsList, documentId),
    add: (documentId, upload) => ipcRenderer.invoke(IPC.attachmentsAdd, documentId, upload),
    remove: (id) => ipcRenderer.invoke(IPC.attachmentsRemove, id)
  },
  backup: {
    create: () => ipcRenderer.invoke(IPC.backupCreate),
    pick: () => ipcRenderer.invoke(IPC.backupPick),
    inspect: (path) => ipcRenderer.invoke(IPC.backupInspect, path),
    restore: (path) => ipcRenderer.invoke(IPC.backupRestore, path),
    listTrash: () => ipcRenderer.invoke(IPC.backupListTrash),
    clearTrash: () => ipcRenderer.invoke(IPC.backupClearTrash)
  },
  adjustments: {
    create: (input) => ipcRenderer.invoke(IPC.adjustmentsCreate, input)
  },
  demo: {
    hasData: () => ipcRenderer.invoke(IPC.demoHasData),
    seed: () => ipcRenderer.invoke(IPC.demoSeed),
    reset: () => ipcRenderer.invoke(IPC.demoReset)
  },
  psd: {
    getBoard: () => ipcRenderer.invoke(IPC.psdGetBoard),
    pickTemplate: () => ipcRenderer.invoke(IPC.psdPickTemplate),
    createTemplate: (input) => ipcRenderer.invoke(IPC.psdCreateTemplate, input),
    deleteTemplate: (id) => ipcRenderer.invoke(IPC.psdDeleteTemplate, id),
    addSlot: (input) => ipcRenderer.invoke(IPC.psdAddSlot, input),
    deleteSlot: (id) => ipcRenderer.invoke(IPC.psdDeleteSlot, id),
    importAsset: (kind) => ipcRenderer.invoke(IPC.psdImportAsset, kind),
    createCutout: (assetId) => ipcRenderer.invoke(IPC.psdCreateCutout, assetId),
    confirmCutout: (jobId) => ipcRenderer.invoke(IPC.psdConfirmCutout, jobId),
    cancelCutout: (jobId) => ipcRenderer.invoke(IPC.psdCancelCutout, jobId),
    deleteAsset: (id) => ipcRenderer.invoke(IPC.psdDeleteAsset, id),
    createJob: (input) => ipcRenderer.invoke(IPC.psdCreateJob, input),
    cancelJob: (id) => ipcRenderer.invoke(IPC.psdCancelJob, id),
    retryJob: (id) => ipcRenderer.invoke(IPC.psdRetryJob, id),
    sync: () => ipcRenderer.invoke(IPC.psdSync),
    requeueStuck: () => ipcRenderer.invoke(IPC.psdRequeueStuck),
    openBridge: () => ipcRenderer.invoke(IPC.psdOpenBridge),
    openOutputDir: () => ipcRenderer.invoke(IPC.psdOpenOutputDir),
    pickBridgeDir: () => ipcRenderer.invoke(IPC.psdPickBridgeDir),
    pickOutputDir: () => ipcRenderer.invoke(IPC.psdPickOutputDir),
    installPlugin: () => ipcRenderer.invoke(IPC.psdInstallPlugin),
    openPlugin: () => ipcRenderer.invoke(IPC.psdOpenPlugin),
    openUxpDeveloperTool: () => ipcRenderer.invoke(IPC.psdOpenUxpDeveloperTool),
    openPhotoshop: () => ipcRenderer.invoke(IPC.psdOpenPhotoshop),
    revealJob: (id) => ipcRenderer.invoke(IPC.psdRevealJob, id)
  }
}

contextBridge.exposeInMainWorld('ajuan', api)
