import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type AjuanApi } from '@shared/ipc'

const api: AjuanApi = {
  app: {
    getInfo: () => ipcRenderer.invoke(IPC.appGetInfo)
  }
}

contextBridge.exposeInMainWorld('ajuan', api)
