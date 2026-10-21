/**
 * 描述: 应用根组件
 * 主要功能:
 *   - 业务页常驻挂载（keep-alive），设置与业务页之间来回切换不丢筛选、滚动和未提交输入
 *   - 设置页使用专属侧栏，返回时回到进入设置前的业务页
 *   - 全局抽屉 / Toast / 导航守卫与数据变更广播仍由这里组装
 */

import type { ReactElement } from 'react'
import { lazy, Suspense, useEffect, useState } from 'react'
import { Shell } from '@/components/Shell'
import { ToastProvider, useToast } from '@/components/Toast'
import { DrawerHost, useDrawer } from '@/components/ui'
import { NavProvider, useNav } from './navigation'
import { useEntityDrawers } from './entityDrawers'
import { unwrap, errorMessage } from '@/lib/api'
import type { Product } from '@shared/types'
import type { RouteKey } from './routes'
import { OverviewPage } from '@/pages/OverviewPage'
import { ProductsPage } from '@/pages/ProductsPage'
import { DocumentsPage } from '@/pages/DocumentsPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { PsdPage } from '@/pages/PsdPage'
import { isSettingsSection, type SettingsSectionKey } from '@/pages/settingsSections'
import styles from './App.module.css'

const isDevUiEnabled = Boolean(import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEV_UI === 'true')

const DevUiPage = isDevUiEnabled
  ? lazy(() => import('@/pages/DevUiPage').then((m) => ({ default: m.DevUiPage })))
  : null

const PAGES: Record<Exclude<RouteKey, 'settings'>, () => ReactElement> = {
  overview: OverviewPage,
  products: ProductsPage,
  documents: DocumentsPage,
  psd: PsdPage
}

const PAGE_KEYS: RouteKey[] = [...(Object.keys(PAGES) as Array<Exclude<RouteKey, 'settings'>>), 'settings']

function Routed(): ReactElement {
  const { location, navigate } = useNav()
  const toast = useToast()
  const drawers = useEntityDrawers()
  const { currentDrawer, closeDrawer } = useDrawer()

  // 页面常驻：访问过的页面保留在 DOM 里，只切换显示状态
  const [visited, setVisited] = useState<Set<RouteKey>>(() => new Set(['overview']))
  useEffect(() => {
    setVisited((prev) => (prev.has(location.key) ? prev : new Set(prev).add(location.key)))
  }, [location.key])

  // 记住进入设置前的业务页；返回应用时回到那里
  const [lastBusinessRoute, setLastBusinessRoute] = useState<RouteKey>('overview')
  useEffect(() => {
    if (location.key !== 'settings') setLastBusinessRoute(location.key)
  }, [location.key])

  // 设置分类也常驻在 App 状态里，离开再回来仍是上次的分类
  const [settingsSection, setSettingsSection] = useState<SettingsSectionKey>('appearance')
  useEffect(() => {
    const requested = location.params.settings?.section
    if (location.key === 'settings' && isSettingsSection(requested)) setSettingsSection(requested)
  }, [location.key, location.params.settings?.section])

  // 切换页面时收起抽屉；抽屉里有未保存内容时先走抽屉自己的放弃确认，不切页
  const handleNavigate = (key: RouteKey): void => {
    if (currentDrawer?.isDirty) return closeDrawer(false)
    if (currentDrawer) closeDrawer(true)
    navigate(key)
  }

  // 侧栏「开单」、命令面板、全局快捷键共用的动作分发
  const handleAction = (actionId: string, payload?: unknown): void => {
    switch (actionId) {
      case 'new-outbound':
        return drawers.newDocument('outbound')
      case 'new-inbound':
        return drawers.newDocument('inbound')
      case 'new-outbound-for-product':
        return drawers.newDocument('outbound', { productId: (payload as Product | undefined)?.id })
      case 'new-adjustment':
        return drawers.openAdjustment()
      case 'new-product':
        return drawers.newProduct()
      case 'import-csv':
        return drawers.openImport()
      case 'open-product':
        if (typeof payload === 'number') void drawers.openProduct(payload)
        return
      case 'open-document':
        if (typeof payload === 'number') drawers.openDocument(payload)
        return
      case 'export-movements':
        void unwrap(window.ajuan.csv.exportMovements({}))
          .then((p) => p && toast(`已导出全部流水到: ${p}`, 'success'))
          .catch((err) => toast(errorMessage(err), 'error'))
        return
      case 'backup-create':
        void unwrap(window.ajuan.backup.create())
          .then((p) => p && toast(`备份已保存到: ${p}`, 'success'))
          .catch((err) => toast(errorMessage(err), 'error'))
        return
      case 'psd-production':
        return navigate('psd')
      case 'settings-section':
        if (currentDrawer) closeDrawer(true)
        return navigate('settings', { settings: { section: String(payload) } })
    }
  }

  return (
    <Shell
      route={location.key}
      seq={location.seq}
      onNavigate={handleNavigate}
      onAction={handleAction}
      settingsSection={settingsSection}
      onSelectSettingsSection={setSettingsSection}
      onBackToApp={() => handleNavigate(lastBusinessRoute)}
    >
      <div className={styles.pageStack}>
        {PAGE_KEYS.filter((key) => visited.has(key)).map((key) => {
          const Page = key === 'settings' ? null : PAGES[key]
          return (
            <div key={key} className={styles.pageLayer} hidden={key !== location.key}>
              {key === 'settings' ? (
                <SettingsPage section={settingsSection} onSectionChange={setSettingsSection} />
              ) : Page ? (
                <Page />
              ) : null}
            </div>
          )
        })}
      </div>
    </Shell>
  )
}

export function App(): ReactElement {
  const [isDevUi, setIsDevUi] = useState(() => isDevUiEnabled && window.location.hash === '#/dev/ui')

  useEffect(() => {
    if (!isDevUiEnabled) return
    const handleHash = (): void => {
      setIsDevUi(window.location.hash === '#/dev/ui')
    }
    window.addEventListener('hashchange', handleHash)
    return () => window.removeEventListener('hashchange', handleHash)
  }, [])

  if (isDevUiEnabled && isDevUi && DevUiPage) {
    return (
      <Suspense fallback={null}>
        <DevUiPage />
      </Suspense>
    )
  }

  return (
    <ToastProvider>
      <NavProvider>
        <DrawerHost>
          <Routed />
        </DrawerHost>
      </NavProvider>
    </ToastProvider>
  )
}
