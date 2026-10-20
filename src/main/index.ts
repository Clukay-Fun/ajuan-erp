import { app, BrowserWindow, nativeTheme, net, protocol, shell } from 'electron'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { state } from './appState'
import { registerIpc } from './ipc'
import { resolveAttachmentPath } from './services/attachments'
import { resolvePsdAssetPath, resolvePsdBridgeOutputPath, resolvePsdCutoutResultPath } from './services/psdExport'
import { preparePhotoshopAtAppStartup } from './psdIo'
import { loadWindowState, trackWindowState } from './windowState'
import { initUpdater } from './updater'
import { IPC } from '@shared/ipc'

const isMac = process.platform === 'darwin'
const isWindows = process.platform === 'win32'
const isDev = !app.isPackaged

function createWindow(): BrowserWindow {
  const saved = loadWindowState()
  const win = new BrowserWindow({
    width: saved.bounds.width,
    height: saved.bounds.height,
    ...(saved.bounds.x >= 0 ? { x: saved.bounds.x, y: saved.bounds.y } : {}),
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: '阿卷 ERP',
    // macOS：保留系统红绿灯按钮，侧栏顶部留出 44px 拖拽区
    ...(isMac ? { titleBarStyle: 'hiddenInset' as const } : {}),
    // Windows：无边框标题栏并挂载原生控制按钮 overlay
    ...(isWindows
      ? {
          titleBarStyle: 'hidden' as const,
          titleBarOverlay: {
            color: nativeTheme.shouldUseDarkColors ? '#101114' : '#f6f7f8',
            symbolColor: nativeTheme.shouldUseDarkColors ? '#9ba1a6' : '#6b7280',
            height: 40
          },
          autoHideMenuBar: true
        }
      : {}),
    // 与 tokens.css 的 --color-bg 一致，避免启动白闪 / 黑闪
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#101114' : '#f6f7f8',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false
    }
  })

  win.once('ready-to-show', () => {
    if (saved.maximized) win.maximize()
    win.show()
  })
  const sendWindowState = (): void => win.webContents.send(IPC.windowState, { maximized: win.isMaximized() })
  win.on('maximize', sendWindowState)
  win.on('unmaximize', sendWindowState)
  win.webContents.once('did-finish-load', sendWindowState)
  trackWindowState(win)

  // 阻止 renderer 打开新窗口；外链交给系统浏览器。
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) event.preventDefault()
  })

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

// 本地图片：只允许读取附件、已导入素材和桥接 outputs 中的抠图预览。
if (!app.isReady()) {
  protocol.registerSchemesAsPrivileged([
    { scheme: 'ajuan-file', privileges: { standard: true, secure: true, supportFetchAPI: false } }
  ])
}

function registerAttachmentProtocol(): void {
  protocol.handle('ajuan-file', (request) => {
    const url = new URL(request.url)
    const rel = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
    try {
      const full =
        url.host === 'attachments'
          ? resolveAttachmentPath(state.attachmentsDir, rel)
          : url.host === 'psd-assets'
            ? resolvePsdAssetPath(state.psdAssetsDir, rel)
            : url.host === 'psd-bridge'
              ? resolvePsdBridgeOutputPath(state.psdBridgeDir, rel)
              : url.host === 'psd-cutout'
                ? resolvePsdCutoutResultPath(state.db, Number(rel))
                : null
      if (!full) return new Response('Not found', { status: 404 })
      return net.fetch(pathToFileURL(full).toString())
    } catch {
      return new Response('Forbidden', { status: 403 })
    }
  })
}

app.setName('阿卷 ERP')

// 单实例：两个进程同时写同一个 SQLite 没有意义，第二个实例把已有窗口带到前台后退出。
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })
}

app.whenReady().then(() => {
  // 开发模式下没有打包图标，手动给 Dock 设一个；打包后由 electron-builder 的 icns / ico 负责
  if (isDev && isMac) {
    const icon = join(app.getAppPath(), 'build/icon.png')
    if (existsSync(icon)) app.dock?.setIcon(icon)
  }
  state.open()
  registerAttachmentProtocol()
  registerIpc()
  void preparePhotoshopAtAppStartup().catch((err) => console.error('[psd] 应用启动时准备 Photoshop 失败:', err))
  const mainWindow = createWindow()
  initUpdater(mainWindow)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (!isMac) app.quit()
})

app.on('will-quit', () => {
  state.close()
})

// 统一拒绝所有权限请求（摄像头、通知等），首版不需要。
app.on('web-contents-created', (_event, contents) => {
  contents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
})
