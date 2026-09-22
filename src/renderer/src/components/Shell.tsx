import type { ReactElement, ReactNode } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Sun, Moon } from 'lucide-react'
import { unwrap } from '@/lib/api'
import { applyTheme, type ThemePreference } from '@/lib/theme'
import styles from './Shell.module.css'
import { PRIMARY_ROUTES, SETTINGS_ROUTE, type RouteDef, type RouteKey } from '@/app/routes'

interface ShellProps {
  route: RouteKey
  /** 每次导航递增，用于刷新侧栏的库存预警状态 */
  seq: number
  onNavigate: (key: RouteKey) => void
  children: ReactNode
}

const isMac = navigator.platform.toUpperCase().includes('MAC')
const WIDTH_KEY = 'ajuan.sidebarWidth'
const MIN_EXPANDED = 176
const MAX_WIDTH = 320
const COLLAPSED = 64
const DEFAULT_WIDTH = 224

function readWidth(): number {
  try {
    const v = Number(localStorage.getItem(WIDTH_KEY))
    if (v === COLLAPSED) return v
    if (v >= MIN_EXPANDED && v <= MAX_WIDTH) return v
  } catch {
    /* ignore */
  }
  return DEFAULT_WIDTH
}

function isDarkNow(): boolean {
  const t = document.documentElement.getAttribute('data-theme')
  if (t === 'dark') return true
  if (t === 'light') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function NavItem({
  def,
  active,
  alert,
  collapsed,
  onClick
}: {
  def: RouteDef
  active: boolean
  alert?: boolean
  collapsed: boolean
  onClick: () => void
}): ReactElement {
  const Icon = def.icon
  return (
    <button
      type="button"
      className={styles.navItem}
      aria-current={active ? 'page' : undefined}
      aria-label={collapsed ? def.label : undefined}
      title={collapsed ? def.label : undefined}
      onClick={onClick}
    >
      <Icon size={18} strokeWidth={1.8} />
      {!collapsed && <span className={styles.navLabel}>{def.label}</span>}
      {alert && <span className={styles.dot} aria-label="库存预警" title="库存低于预警值" />}
    </button>
  )
}

export function Shell({ route, seq, onNavigate, children }: ShellProps): ReactElement {
  const [lowStock, setLowStock] = useState(false)
  const [width, setWidth] = useState<number>(readWidth)
  const [dragging, setDragging] = useState(false)
  const [dark, setDark] = useState(isDarkNow)
  const dragStart = useRef<{ x: number; w: number } | null>(null)
  const collapsed = width === COLLAPSED

  useEffect(() => {
    unwrap(window.ajuan.overview.get())
      .then((o) => setLowStock(o.lowStock))
      .catch(() => setLowStock(false))
  }, [seq])

  // 跟随系统时，系统切换外观要同步图标
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const on = (): void => setDark(isDarkNow())
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  // 标题栏快切：浅 ⇄ 深（显式设置，设置页可改回跟随系统）
  const toggleTheme = (): void => {
    const next: ThemePreference = isDarkNow() ? 'light' : 'dark'
    applyTheme(next)
    setDark(next === 'dark')
  }

  // 拖拽右缘改宽度；拖到阈值以下吸附为折叠态（只剩图标）
  const onHandleDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      dragStart.current = { x: e.clientX, w: collapsed ? COLLAPSED : width }
      setDragging(true)
      const move = (ev: MouseEvent): void => {
        if (!dragStart.current) return
        const raw = dragStart.current.w + (ev.clientX - dragStart.current.x)
        setWidth(raw < MIN_EXPANDED - 24 ? COLLAPSED : Math.min(MAX_WIDTH, Math.max(MIN_EXPANDED, raw)))
      }
      const up = (): void => {
        dragStart.current = null
        setDragging(false)
        window.removeEventListener('mousemove', move)
        window.removeEventListener('mouseup', up)
        setWidth((w) => {
          try {
            localStorage.setItem(WIDTH_KEY, String(w))
          } catch {
            /* ignore */
          }
          return w
        })
      }
      window.addEventListener('mousemove', move)
      window.addEventListener('mouseup', up)
    },
    [collapsed, width]
  )

  const toggleSidebar = (): void => {
    const next = collapsed ? DEFAULT_WIDTH : COLLAPSED
    setWidth(next)
    try {
      localStorage.setItem(WIDTH_KEY, String(next))
    } catch {
      /* ignore */
    }
  }

  return (
    <div
      className={`${styles.shell} ${dragging ? styles.dragging : ''}`}
      style={{ '--sidebar-width': `${width}px` } as React.CSSProperties}
    >
      {/* 贯通顶部的标题栏：交通灯、品牌、主题快切。整条可拖动窗口。 */}
      <header className={`${styles.titlebar} ${isMac ? styles.titlebarMac : ''}`}>
        <div className={styles.brand} onDoubleClick={toggleSidebar} title={collapsed ? '双击展开侧栏' : '双击收起侧栏'}>
          <span className={styles.brandText}>
            阿卷<em>ERP</em>
          </span>
        </div>
        <div className={styles.titlebarActions}>
          <button
            type="button"
            className={styles.iconButton}
            onClick={toggleTheme}
            aria-label={dark ? '切换到浅色' : '切换到深色'}
            title={dark ? '切换到浅色' : '切换到深色'}
          >
            {dark ? <Sun size={16} strokeWidth={1.8} /> : <Moon size={16} strokeWidth={1.8} />}
          </button>
        </div>
      </header>

      <aside className={`${styles.sidebar} ${collapsed ? styles.collapsed : ''}`}>
        <nav className={styles.nav} aria-label="主导航">
          {PRIMARY_ROUTES.map((def) => (
            <NavItem
              key={def.key}
              def={def}
              active={route === def.key}
              collapsed={collapsed}
              alert={lowStock && (def.key === 'overview' || def.key === 'products')}
              onClick={() => onNavigate(def.key)}
            />
          ))}
        </nav>
        <div className={styles.spacer} />
        <NavItem
          def={SETTINGS_ROUTE}
          active={route === 'settings'}
          collapsed={collapsed}
          onClick={() => onNavigate('settings')}
        />
        <div
          className={styles.handle}
          role="separator"
          aria-orientation="vertical"
          aria-label="拖动调整侧栏宽度"
          onMouseDown={onHandleDown}
          onDoubleClick={toggleSidebar}
        />
      </aside>

      <main className={styles.content}>
        <div className={styles.contentInner}>{children}</div>
      </main>
    </div>
  )
}
