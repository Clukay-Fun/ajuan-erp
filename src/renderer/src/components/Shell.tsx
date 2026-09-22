import type { ReactElement, ReactNode } from 'react'
import styles from './Shell.module.css'
import { PRIMARY_ROUTES, SETTINGS_ROUTE, type RouteDef, type RouteKey } from '@/app/routes'

interface ShellProps {
  route: RouteKey
  onNavigate: (key: RouteKey) => void
  children: ReactNode
}

const isMac = navigator.platform.toUpperCase().includes('MAC')

function NavItem({ def, active, onClick }: { def: RouteDef; active: boolean; onClick: () => void }): ReactElement {
  const Icon = def.icon
  return (
    <button type="button" className={styles.navItem} aria-current={active ? 'page' : undefined} onClick={onClick}>
      <Icon size={18} strokeWidth={1.8} />
      <span>{def.label}</span>
    </button>
  )
}

export function Shell({ route, onNavigate, children }: ShellProps): ReactElement {
  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={`${styles.brand} ${isMac ? styles.brandMac : ''}`}>
          <span className={styles.brandMark} aria-hidden />
          阿卷库存
        </div>
        <nav className={styles.nav} aria-label="主导航">
          {PRIMARY_ROUTES.map((def) => (
            <NavItem key={def.key} def={def} active={route === def.key} onClick={() => onNavigate(def.key)} />
          ))}
        </nav>
        <div className={styles.spacer} />
        <NavItem def={SETTINGS_ROUTE} active={route === 'settings'} onClick={() => onNavigate('settings')} />
      </aside>
      <div className={styles.main}>
        <div className={styles.titlebar} />
        <main className={styles.content}>
          <div className={styles.contentInner}>{children}</div>
        </main>
      </div>
    </div>
  )
}
