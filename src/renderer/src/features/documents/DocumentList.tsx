import type { ReactElement } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { FileText, PackagePlus, PackageMinus, Upload } from 'lucide-react'
import type { DocumentStatus, DocumentSummary, DocumentType } from '@shared/types'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/Button'
import { EmptyState } from '@/components/EmptyState'
import { StatusBadge, TypeBadge } from '@/components/Badge'
import { unwrap, errorMessage } from '@/lib/api'
import { formatCents, formatQty } from '@/lib/format'
import { useNav } from '@/app/navigation'
import table from '@/components/Table.module.css'
import styles from './DocumentList.module.css'
import { ImportDialog } from '@/features/csv/ImportDialog'
import { SkeletonTable } from '@/components/Skeleton'

type TypeFilter = 'all' | DocumentType
type StatusFilter = 'all' | DocumentStatus

const TYPE_TABS: { key: TypeFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'inbound', label: '入库' },
  { key: 'outbound', label: '出库' },
  { key: 'opening', label: '期初' }
]
const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: '全部状态' },
  { key: 'draft', label: '草稿' },
  { key: 'confirmed', label: '已生效' },
  { key: 'voided', label: '已作废' }
]

export function DocumentList(): ReactElement {
  const { navigate } = useNav()
  const [type, setType] = useState<TypeFilter>('all')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [docs, setDocs] = useState<DocumentSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [importOpen, setImportOpen] = useState(false)

  const load = useCallback(async () => {
    try {
      setDocs(
        await unwrap(
          window.ajuan.documents.list({
            type: type === 'all' ? undefined : type,
            status: status === 'all' ? undefined : status
          })
        )
      )
      setError(null)
    } catch (err) {
      setError(errorMessage(err))
    }
  }, [type, status])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <>
      <PageHeader
        title="单据"
        subtitle="入库单、出库单与期初库存"
        actions={
          <>
            <Button onClick={() => setImportOpen(true)}>
              <Upload size={16} /> 导入 CSV
            </Button>
            <Button variant="primary" onClick={() => navigate('documents', { documents: { view: 'new', type: 'inbound' } })}>
              <PackagePlus size={16} /> 入库
            </Button>
            <Button variant="primary" onClick={() => navigate('documents', { documents: { view: 'new', type: 'outbound' } })}>
              <PackageMinus size={16} /> 出库
            </Button>
          </>
        }
      />
      <div className={styles.filters}>
        <div className={styles.tabs} role="tablist">
          {TYPE_TABS.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={type === t.key} className={styles.tab} onClick={() => setType(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
        <div className={styles.tabs} role="tablist">
          {STATUS_TABS.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={status === t.key} className={styles.tab} onClick={() => setStatus(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className={styles.error}>读取失败：{error}</p>}
      {!docs && !error && <SkeletonTable cols={8} />}
      {docs && docs.length === 0 && (
        <EmptyState icon={FileText} title="没有符合条件的单据" description="点击右上角「入库」或「出库」新建一张单据。" />
      )}
      {docs && docs.length > 0 && (
        <div className={table.wrap}>
          <table className={`${table.table} ${table.clickable}`}>
            <thead>
              <tr>
                <th>日期</th>
                <th>类型</th>
                <th>单号</th>
                <th>状态</th>
                <th>渠道 / 订单号</th>
                <th className={table.num}>数量</th>
                <th className={table.num}>金额</th>
                <th>备注</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id} onClick={() => navigate('documents', { documents: { view: 'detail', id: d.id } })}>
                  <td>{d.docDate}</td>
                  <td><TypeBadge type={d.type} /></td>
                  <td className={table.mono}>{d.docNo}</td>
                  <td><StatusBadge status={d.status} /></td>
                  <td className={d.channelName ? '' : table.muted}>
                    {d.channelName ?? '—'}
                    {d.externalOrderNo && <span className={table.mono}> · {d.externalOrderNo}</span>}
                  </td>
                  <td className={table.num}>{formatQty(d.totalQuantity)}</td>
                  <td className={table.num}>¥{formatCents(d.totalAmountCents)}</td>
                  <td className={table.muted}>{d.note || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} onImported={() => void load()} />
    </>
  )
}
