import type { ReactElement } from 'react'
import { FileText } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'

export function DocumentsPage(): ReactElement {
  return (
    <>
      <PageHeader title="单据" subtitle="入库单、出库单与期初库存" />
      <EmptyState icon={FileText} title="还没有单据" description="M2" />
    </>
  )
}
