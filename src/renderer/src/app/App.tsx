import type { ReactElement } from 'react'
import { lazy, Suspense, useEffect, useState } from 'react'
import { Shell } from '@/components/Shell'
import { ToastProvider } from '@/components/Toast'
import { NavProvider, useNav } from './navigation'
import { useShortcuts } from './useShortcuts'
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
  useShortcuts()
  const Page = PAGES[location.key]

  const handleAction = (actionId: string, payload?: any): void => {
    if (actionId === 'new-outbound') {
      navigate('documents', { documents: { view: 'new', type: 'outbound' } })
    } else if (actionId === 'new-inbound') {
      navigate('documents', { documents: { view: 'new', type: 'inbound' } })
    } else if (actionId === 'open-document' && typeof payload === 'number') {
      navigate('documents', { documents: { view: 'detail', id: payload } })
    } else if (actionId === 'open-product') {
      navigate('products')
    } else if (actionId === 'new-product') {
      navigate('products')
    } else if (actionId === 'import-csv') {
      navigate('documents')
    } else if (actionId === 'new-outbound-for-product') {
      navigate('documents', { documents: { view: 'new', type: 'outbound' } })
    }
  }

  return (
    <Shell route={location.key} seq={location.seq} onNavigate={(key) => navigate(key)} onAction={handleAction}>
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
        <Routed />
      </NavProvider>
    </ToastProvider>
  )
}
