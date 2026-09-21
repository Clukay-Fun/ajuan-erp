import type { ReactElement } from 'react'
import { ArrowLeftRight } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'

export function InventoryPage(): ReactElement {
  return (
    <>
      <PageHeader title="库存流水" subtitle="每一次库存增减的不可变记录" />
      <EmptyState icon={ArrowLeftRight} title="还没有流水" description="确认入库或出库后，流水会出现在这里。" />
    </>
  )
}
