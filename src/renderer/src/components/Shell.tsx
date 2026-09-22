import type { ReactElement, ReactNode } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { unwrap } from '@/lib/api'
import styles from './Shell.module.css'
import { PRIMARY_ROUTES, SETTINGS_ROUTE, type RouteDef, type RouteKey } from '@/app/routes'
import logoLight from '@/assets/logo.png'
import logoDark from '@/assets/logo-dark.png'

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
  const dragStart = useRef<{ x: number; w: number } | null>(null)
  const collapsed = width === COLLAPSED

  useEffect(() => {
    unwrap(window.ajuan.overview.get())
      .then((o) => setLowStock(o.lowStock))
      .catch(() => setLowStock(false))
  }, [seq])

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

  const toggle = (): void => {
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
      <aside className={`${styles.sidebar} ${isMac ? '' : styles.sidebarWin} ${collapsed ? styles.collapsed : ''}`}>
        <div className={styles.titlebarSpace} />
        <div className={styles.brand} onDoubleClick={toggle} title={collapsed ? '双击展开侧栏' : '双击收起侧栏'}>
          {collapsed ? (
            <>
              <img className={`${styles.logo} ${styles.logoLight}`} src={logoLight} alt="阿卷 ERP" draggable={false} />
              <img className={`${styles.logo} ${styles.logoDark}`} src={logoDark} alt="阿卷 ERP" draggable={false} />
            </>
          ) : (
            <span className={styles.brandText}>
              阿卷<em>ERP</em>
            </span>
          )}
        </div>
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
          onDoubleClick={toggle}
        />
      </aside>
      <div className={`${styles.main} ${isMac ? '' : styles.mainWin}`}>
        <div className={styles.titlebar} />
        <main className={styles.content}>
          <div className={styles.contentInner}>{children}</div>
        </main>
      </div>
    </div>
  )
}
