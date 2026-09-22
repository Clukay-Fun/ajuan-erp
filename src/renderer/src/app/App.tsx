import type { ReactElement } from 'react'
import { Shell } from '@/components/Shell'
import { ToastProvider } from '@/components/Toast'
import { NavProvider, useNav } from './navigation'
import { useShortcuts } from './useShortcuts'
import type { RouteKey } from './routes'
import { OverviewPage } from '@/pages/OverviewPage'
import { ProductsPage } from '@/pages/ProductsPage'
import { InventoryPage } from '@/pages/InventoryPage'
import { DocumentsPage } from '@/pages/DocumentsPage'
import { SummaryPage } from '@/pages/SummaryPage'
import { SettingsPage } from '@/pages/SettingsPage'

const PAGES: Record<RouteKey, () => ReactElement> = {
  overview: OverviewPage,
  products: ProductsPage,
  inventory: InventoryPage,
  documents: DocumentsPage,
  summary: SummaryPage,
  settings: SettingsPage
}

function Routed(): ReactElement {
  const { location, navigate } = useNav()
  useShortcuts()
  const Page = PAGES[location.key]
  return (
    <Shell route={location.key} seq={location.seq} onNavigate={(key) => navigate(key)}>
      <Page key={location.seq} />
    </Shell>
  )
}

export function App(): ReactElement {
  return (
    <ToastProvider>
      <NavProvider>
        <Routed />
      </NavProvider>
    </ToastProvider>
  )
}
