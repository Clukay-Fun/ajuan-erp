import type { ReactElement } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { PackagePlus, PackageMinus, Upload, Scale } from 'lucide-react'
import type { DocumentStatus, DocumentSummary, DocumentType } from '@shared/types'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/Button'
import { StatusBadge, TypeBadge } from '@/components/Badge'
import { unwrap, errorMessage } from '@/lib/api'
import { formatQty } from '@/lib/format'
import { useNav } from '@/app/navigation'
import table from '@/components/Table.module.css'
import styles from './DocumentList.module.css'
import seg from '@/components/Segmented.module.css'
import { TableEmpty } from '@/components/TableEmpty'
import { ImportDialog } from '@/features/csv/ImportDialog'
import { AdjustmentDrawer } from '@/features/adjustments/AdjustmentDrawer'
import { DocumentDetailView } from '@/features/documents/DocumentDetailView'
import { SplitView } from '@/components/SplitView'
import { SkeletonTable } from '@/components/Skeleton'

type TypeFilter = 'all' | DocumentType
type StatusFilter = 'all' | DocumentStatus

const TYPE_TABS: { key: TypeFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'inbound', label: '入库' },
  { key: 'outbound', label: '出库' },
  { key: 'adjustment', label: '调整' },
  { key: 'opening', label: '期初' }
]
const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'draft', label: '草稿' },
  { key: 'confirmed', label: '已生效' },
  { key: 'voided', label: '已作废' }
]

export function DocumentList({ initialSelectedId = null }: { initialSelectedId?: number | null }): ReactElement {
  const { navigate } = useNav()
  const [type, setType] = useState<TypeFilter>('all')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [docs, setDocs] = useState<DocumentSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(initialSelectedId)
  const [adjustOpen, setAdjustOpen] = useState(false)

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
        actions={
          <>
            <Button onClick={() => setImportOpen(true)}>
              <Upload size={16} /> 导入 CSV
            </Button>
            <Button onClick={() => setAdjustOpen(true)}>
              <Scale size={16} /> 库存调整
            </Button>
            <span style={{ width: 8 }} aria-hidden />
            <Button
              variant="primary"
              onClick={() => navigate('documents', { documents: { view: 'new', type: 'inbound' } })}
            >
              <PackagePlus size={16} /> 入库
            </Button>
            <Button
              variant="primary"
              onClick={() => navigate('documents', { documents: { view: 'new', type: 'outbound' } })}
            >
              <PackageMinus size={16} /> 出库
            </Button>
          </>
        }
      />
      <div className={styles.filters}>
        <div className={styles.filterGroup}>
          <div className={seg.group} role="tablist">
            {TYPE_TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={type === t.key}
                className={seg.item}
                onClick={() => setType(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className={styles.filterGroup}>
          <div className={seg.group} role="tablist">
            {STATUS_TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={status === t.key}
                className={seg.item}
                onClick={() => setStatus(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && <p className={styles.error}>读取失败：{error}</p>}
      {!docs && !error && <SkeletonTable cols={8} />}
      {docs && (
        <SplitView
          master={
            <div className={table.wrap}>
              <table className={`${table.table} ${table.clickable} ${table.fixed}`}>
                <colgroup>
                  <col style={{ width: 96 }} />
                  <col style={{ width: 64 }} />
                  <col />
                  <col style={{ width: 76 }} />
                  <col style={{ width: 64 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>日期</th>
                    <th>类型</th>
                    <th>单号 / 渠道</th>
                    <th>状态</th>
                    <th className={table.num}>数量</th>
                  </tr>
                </thead>
                <tbody>
                  {docs.length === 0 && (
                    <TableEmpty cols={5} title="没有符合条件的单据" description="点击右上角「入库」或「出库」新建" />
                  )}
                  {docs.map((d) => (
                    <tr
                      key={d.id}
                      onClick={() => setSelectedId(d.id)}
                      className={d.id === selectedId ? table.selected : ''}
                    >
                      <td className={table.mono}>{d.docDate.slice(5)}</td>
                      <td>
                        <TypeBadge type={d.type} />
                      </td>
                      <td>
                        <div className={styles.cellText}>
                          <span className={table.mono}>{d.docNo}</span>
                          <span className={styles.cellSub}>
                            {d.channelName ?? (d.note ? d.note : '—')}
                            {d.externalOrderNo ? ` · ${d.externalOrderNo}` : ''}
                          </span>
                        </div>
                      </td>
                      <td>
                        <StatusBadge status={d.status} />
                      </td>
                      <td className={table.num}>{formatQty(d.totalQuantity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          }
          detail={
            selectedId !== null ? (
              <DocumentDetailView
                key={selectedId}
                id={selectedId}
                onChanged={(id) => {
                  if (id === null) setSelectedId(null)
                  void load()
                }}
              />
            ) : null
          }
          placeholder="从左侧选择一张单据查看详情"
        />
      )}
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} onImported={() => void load()} />
      <AdjustmentDrawer
        open={adjustOpen}
        product={null}
        onClose={() => setAdjustOpen(false)}
        onCreated={(d) => {
          setAdjustOpen(false)
          setSelectedId(d.id)
          void load()
        }}
      />
    </>
  )
}
