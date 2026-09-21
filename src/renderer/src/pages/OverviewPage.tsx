import type { ReactElement } from 'react'
import { LayoutDashboard } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'

export function OverviewPage(): ReactElement {
  return (
    <>
      <PageHeader title="概览" subtitle="今天的库存状态" />
      <EmptyState icon={LayoutDashboard} title="还没有库存数据" description="完成商品建档和期初库存后，这里会显示当前库存、今日出入库和库存金额。" />
    </>
  )
}
