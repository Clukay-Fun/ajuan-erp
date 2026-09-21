import type { ReactElement } from 'react'
import { LayoutDashboard, PackagePlus, PackageMinus } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/Button'
import { useNav } from '@/app/navigation'

export function OverviewPage(): ReactElement {
  const { navigate } = useNav()
  return (
    <>
      <PageHeader
        title="概览"
        subtitle="今天的库存状态"
        actions={
          <>
            <Button variant="primary" onClick={() => navigate('documents', { documents: { view: 'new', type: 'inbound' } })}>
              <PackagePlus size={16} /> 入库
            </Button>
            <Button variant="primary" onClick={() => navigate('documents', { documents: { view: 'new', type: 'outbound' } })}>
              <PackageMinus size={16} /> 出库
            </Button>
          </>
        }
      />
      <EmptyState icon={LayoutDashboard} title="概览指标将在 M3 提供" description="届时显示当前库存、今日出入库、库存金额、预警和近期趋势。" />
    </>
  )
}
