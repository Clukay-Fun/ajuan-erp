import { app, BrowserWindow, nativeTheme, net, protocol, shell } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { state } from './appState'
import { registerIpc } from './ipc'
import { resolveAttachmentPath } from './services/attachments'
import { loadWindowState, trackWindowState } from './windowState'

const isMac = process.platform === 'darwin'
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
    title: '阿卷库存',
    // macOS 保留交通灯并内嵌到内容区；Windows 使用系统原生标题栏按钮。
    ...(isMac ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 16, y: 18 } } : {}),
    // 与 tokens.css 的 --color-bg 一致，避免启动白闪 / 黑闪
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1b1916' : '#f7f4ee',
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

// 附件图片通过自定义协议提供：ajuan-file://attachments/<relPath>，只允许读附件目录内的文件。
if (!app.isReady()) {
  protocol.registerSchemesAsPrivileged([
    { scheme: 'ajuan-file', privileges: { standard: true, secure: true, supportFetchAPI: false } }
  ])
}

function registerAttachmentProtocol(): void {
  protocol.handle('ajuan-file', (request) => {
    const url = new URL(request.url)
    if (url.host !== 'attachments') return new Response('Not found', { status: 404 })
    try {
      const rel = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
      const full = resolveAttachmentPath(state.attachmentsDir, rel)
      return net.fetch(pathToFileURL(full).toString())
    } catch {
      return new Response('Forbidden', { status: 403 })
    }
  })
}

app.setName('阿卷库存')

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
  state.open()
  registerAttachmentProtocol()
  registerIpc()
  createWindow()
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
