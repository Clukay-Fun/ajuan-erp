import { app, BrowserWindow, net, protocol, shell } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { state } from './appState'
import { registerIpc } from './ipc'
import { resolveAttachmentPath } from './services/attachments'

const isMac = process.platform === 'darwin'
const isDev = !app.isPackaged

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: '阿卷库存',
    // macOS 保留交通灯并内嵌到内容区；Windows 使用系统原生标题栏按钮。
    ...(isMac ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 16, y: 18 } } : {}),
    backgroundColor: '#f6f7f9',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false
    }
  })

  win.once('ready-to-show', () => win.show())

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
  protocol.registerSchemesAsPrivileged([{ scheme: 'ajuan-file', privileges: { standard: true, secure: true, supportFetchAPI: false } }])
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
