import type { ReactElement } from 'react'
import { Package } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'

export function ProductsPage(): ReactElement {
  return (
    <>
      <PageHeader title="商品资料" subtitle="商品编码、价格与库存预警" />
      <EmptyState icon={Package} title="还没有商品" description="M1" />
    </>
  )
}
