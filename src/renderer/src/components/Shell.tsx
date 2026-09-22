import type { ReactElement, ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { unwrap } from '@/lib/api'
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
    <button type="button" className={styles.navItem} aria-current={active ? 'page' : undefined} onClick={onClick}>
      <Icon size={18} strokeWidth={1.8} />
      <span>{def.label}</span>
      {alert && <span className={styles.dot} aria-label="库存预警" title="库存低于预警值" />}
    </button>
  )
}

export function Shell({ route, seq, onNavigate, children }: ShellProps): ReactElement {
  const [lowStock, setLowStock] = useState(false)
  useEffect(() => {
    unwrap(window.ajuan.overview.get())
      .then((o) => setLowStock(o.lowStock))
      .catch(() => setLowStock(false))
  }, [seq])
  return (
    <div className={styles.shell}>
      <aside className={`${styles.sidebar} ${isMac ? '' : styles.sidebarWin}`}>
        <div className={styles.titlebarSpace} />
        <div className={styles.brand}>
          阿卷<em>ERP</em>
        </div>
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
      <div className={`${styles.main} ${isMac ? '' : styles.mainWin}`}>
        <div className={styles.titlebar} />
        <main className={styles.content}>
          <div className={styles.contentInner}>{children}</div>
        </main>
      </div>
    </div>
  )
}
