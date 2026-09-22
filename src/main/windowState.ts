import { app, screen, type BrowserWindow, type Rectangle } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

interface WindowState {
  bounds: Rectangle
  maximized: boolean
}

const FILE = 'window-state.json'
const DEFAULT: WindowState = { bounds: { x: -1, y: -1, width: 1200, height: 800 }, maximized: false }

function statePath(): string {
  return join(app.getPath('userData'), FILE)
}

/** 读取上次窗口位置；若落在当前所有显示器之外则回到默认居中。 */
export function loadWindowState(): WindowState {
  let state = DEFAULT
  try {
    const raw = JSON.parse(readFileSync(statePath(), 'utf8')) as Partial<WindowState>
    if (raw.bounds && typeof raw.bounds.width === 'number' && typeof raw.bounds.height === 'number') {
      state = { bounds: { ...DEFAULT.bounds, ...raw.bounds }, maximized: raw.maximized === true }
    }
  } catch {
    /* 首次启动或文件损坏：用默认值 */
  }
  const { bounds } = state
  const visible = screen.getAllDisplays().some((d) => {
    const a = d.workArea
    return (
      bounds.x + 80 < a.x + a.width &&
      bounds.x + bounds.width - 80 > a.x &&
      bounds.y + 40 < a.y + a.height &&
      bounds.y >= a.y - 20
    )
  })
  if (!visible) state = { ...state, bounds: { ...state.bounds, x: -1, y: -1 } }
  state.bounds.width = Math.max(state.bounds.width, 960)
  state.bounds.height = Math.max(state.bounds.height, 640)
  return state
}

/** 监听尺寸 / 位置变化，防抖写盘。 */
export function trackWindowState(win: BrowserWindow): void {
  let timer: NodeJS.Timeout | null = null
  const save = (): void => {
    const maximized = win.isMaximized()
    const bounds = maximized ? loadWindowState().bounds : win.getNormalBounds()
    try {
      writeFileSync(statePath(), JSON.stringify({ bounds, maximized } satisfies WindowState))
    } catch {
      /* 写失败不影响使用 */
    }
  }
  const schedule = (): void => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(save, 300)
  }
  win.on('resize', schedule)
  win.on('move', schedule)
  win.on('maximize', schedule)
  win.on('unmaximize', schedule)
  win.on('close', save)
}
