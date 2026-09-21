// renderer ↔ main 的白名单 IPC 契约。
// 通道名集中定义，preload 只暴露这里列出的方法，不暴露通用 invoke。

export const IPC = {
  appGetInfo: 'app:getInfo'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]

export interface AppInfo {
  name: string
  version: string
  platform: NodeJS.Platform
  userDataPath: string
}

// preload 通过 contextBridge 暴露到 window.ajuan 的 API 形状。
// 后续 M1+ 按业务命名追加：products / documents / inventory / csv / backup。
export interface AjuanApi {
  app: {
    getInfo(): Promise<AppInfo>
  }
}
