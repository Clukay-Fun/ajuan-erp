import type { ReactElement, ReactNode } from 'react'
import { useEffect, useState } from 'react'
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
const SIDEBAR_WIDTH = 56

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
  onClick
}: {
  def: RouteDef
  active: boolean
  alert?: boolean
  onClick: () => void
}): ReactElement {
  const Icon = def.icon
  return (
    <button
      type="button"
      className={styles.navItem}
      aria-current={active ? 'page' : undefined}
      title={def.label}
      onClick={onClick}
    >
      <Icon size={18} strokeWidth={1.8} />
      <span className={styles.navLabel}>{def.label}</span>
      {alert && <span className={styles.dot} aria-label="库存预警" title="库存低于预警值" />}
    </button>
  )
}

export function Shell({ route, seq, onNavigate, children }: ShellProps): ReactElement {
  const [lowStock, setLowStock] = useState(false)
  const [width] = useState<number>(SIDEBAR_WIDTH)
  const [dark, setDark] = useState(isDarkNow)
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    unwrap(window.ajuan.overview.get())
      .then((o) => setLowStock(o.lowStockCount > 0))
      .catch(() => setLowStock(false))
  }, [seq])

  useEffect(() => window.ajuan.app.onState(({ maximized: next }) => setMaximized(next)), [])

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

  return (
    <div
      className={`${styles.shell} ${isMac ? styles.macNative : ''} ${maximized ? styles.maximized : ''}`}
      style={{ '--sidebar-width': `${width}px` } as React.CSSProperties}
    >
      {/* 贯通顶部的标题栏：交通灯、品牌、主题快切。整条可拖动窗口。 */}
      <header className={`${styles.titlebar} ${isMac ? styles.titlebarMac : ''}`}>
        <div className={styles.brand}>
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

      <aside className={styles.sidebar}>
        <nav className={styles.nav} aria-label="主导航">
          {PRIMARY_ROUTES.map((def) => (
            <NavItem
              key={def.key}
              def={def}
              active={route === def.key}
              alert={lowStock && (def.key === 'overview' || def.key === 'products')}
              onClick={() => onNavigate(def.key)}
            />
          ))}
        </nav>
        <div className={styles.spacer} />
        <NavItem def={SETTINGS_ROUTE} active={route === 'settings'} onClick={() => onNavigate('settings')} />
      </aside>

      <main className={styles.content}>
        <div className={styles.contentInner}>{children}</div>
      </main>
    </div>
  )
}
