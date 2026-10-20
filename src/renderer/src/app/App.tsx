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

const isDevUiEnabled = Boolean(import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEV_UI === 'true')

const DevUiPage = isDevUiEnabled
  ? lazy(() => import('@/pages/DevUiPage').then((m) => ({ default: m.DevUiPage })))
  : null

const PAGES: Record<RouteKey, () => ReactElement> = {
  overview: OverviewPage,
  products: ProductsPage,
  documents: DocumentsPage,
  psd: PsdPage,
  settings: SettingsPage
}

function Routed(): ReactElement {
  const { location, navigate } = useNav()
  const toast = useToast()
  const drawers = useEntityDrawers()
  const { currentDrawer, closeDrawer } = useDrawer()
  const Page = PAGES[location.key]

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
    }
  }

  return (
    <Shell route={location.key} seq={location.seq} onNavigate={handleNavigate} onAction={handleAction}>
      <Page key={location.seq} />
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
