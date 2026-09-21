import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type AjuanApi } from '@shared/ipc'

const api: AjuanApi = {
  app: {
    getInfo: () => ipcRenderer.invoke(IPC.appGetInfo)
  },
  products: {
    get: () => ipcRenderer.invoke(IPC.productsGet),
    update: (input) => ipcRenderer.invoke(IPC.productsUpdate, input)
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
    exportSummary: (range) => ipcRenderer.invoke(IPC.csvExportSummary, range)
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
    findDuplicate: (channelId, no, excludeId) => ipcRenderer.invoke(IPC.documentsFindDuplicate, channelId, no, excludeId)
  },
  channels: {
    list: () => ipcRenderer.invoke(IPC.channelsList),
    create: (input) => ipcRenderer.invoke(IPC.channelsCreate, input),
    update: (id, input) => ipcRenderer.invoke(IPC.channelsUpdate, id, input)
  }
}

contextBridge.exposeInMainWorld('ajuan', api)
