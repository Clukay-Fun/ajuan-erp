import type { AjuanApi } from '@shared/ipc'

declare global {
  interface Window {
    ajuan: AjuanApi
  }
}

export {}
