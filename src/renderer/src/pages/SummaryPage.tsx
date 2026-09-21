import type { ReactElement } from 'react'
import { BarChart3 } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'

export function SummaryPage(): ReactElement {
  return (
    <>
      <PageHeader title="汇总" subtitle="按日期范围统计出入库数量与金额" />
      <EmptyState icon={BarChart3} title="暂无可汇总的数据" description="有流水后可按日期范围查看汇总并导出" />
    </>
  )
}
