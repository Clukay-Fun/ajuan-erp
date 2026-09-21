import { useState, type ReactElement } from 'react'
import { Shell } from '@/components/Shell'
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

export function App(): ReactElement {
  const [route, setRoute] = useState<RouteKey>('overview')
  const Page = PAGES[route]
  return (
    <Shell route={route} onNavigate={setRoute}>
      <Page />
    </Shell>
  )
}
