import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type AjuanApi } from '@shared/ipc'

const api: AjuanApi = {
  app: {
    getInfo: () => ipcRenderer.invoke(IPC.appGetInfo)
  },
  products: {
    get: () => ipcRenderer.invoke(IPC.productsGet),
    update: (input) => ipcRenderer.invoke(IPC.productsUpdate, input),
    setImage: (upload) => ipcRenderer.invoke(IPC.productsSetImage, upload),
    clearImage: () => ipcRenderer.invoke(IPC.productsClearImage)
  },
  inventory: {
    getStock: (skuId) => ipcRenderer.invoke(IPC.inventoryGetStock, skuId),
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
  }
}

contextBridge.exposeInMainWorld('ajuan', api)
