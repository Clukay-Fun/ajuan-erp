import type { ReactElement } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { PackagePlus, PackageMinus, Upload, Scale } from 'lucide-react'
import type { DocumentStatus, DocumentSummary, DocumentType } from '@shared/types'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/Button'
import { StatusBadge, TypeBadge } from '@/components/Badge'
import { unwrap, errorMessage } from '@/lib/api'
import { formatCents, formatQty } from '@/lib/format'
import table from '@/components/Table.module.css'
import styles from './DocumentList.module.css'
import seg from '@/components/Segmented.module.css'
import { TableEmpty } from '@/components/TableEmpty'
import { ImportDialog } from '@/features/csv/ImportDialog'
import { AdjustmentDrawer } from '@/features/adjustments/AdjustmentDrawer'
import { DocumentDetailView } from '@/features/documents/DocumentDetailView'
import { DocumentEditor } from '@/features/documents/DocumentEditor'
import { Drawer } from '@/components/Drawer'
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

type EditorMode = { view: 'new'; type: DocumentType } | { view: 'edit'; id: number }

export function DocumentList({
  initialSelectedId = null,
  initialEditor = null
}: {
  initialSelectedId?: number | null
  initialEditor?: EditorMode | null
}): ReactElement {
  const [type, setType] = useState<TypeFilter>('all')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [docs, setDocs] = useState<DocumentSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(initialSelectedId)
  const [editor, setEditor] = useState<EditorMode | null>(initialEditor)
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
            <Button variant="primary" onClick={() => setEditor({ view: 'new', type: 'inbound' })}>
              <PackagePlus size={16} /> 入库
            </Button>
            <Button variant="primary" onClick={() => setEditor({ view: 'new', type: 'outbound' })}>
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
        <>
          <div className={table.wrap}>
            <table className={`${table.table} ${table.clickable} ${table.fixed}`}>
              <colgroup>
                <col style={{ width: 112 }} />
                <col style={{ width: 84 }} />
                <col style={{ width: 170 }} />
                <col style={{ width: 96 }} />
                <col />
                <col style={{ width: 80 }} />
                <col style={{ width: 110 }} />
                <col style={{ width: '20%' }} />
              </colgroup>
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
                {docs.length === 0 && (
                  <TableEmpty cols={8} title="没有符合条件的单据" description="点击右上角「入库」或「出库」新建" />
                )}
                {docs.map((d) => (
                  <tr
                    key={d.id}
                    onClick={() => setSelectedId(d.id)}
                    className={d.id === selectedId ? table.selected : ''}
                  >
                    <td>{d.docDate}</td>
                    <td>
                      <TypeBadge type={d.type} />
                    </td>
                    <td className={table.mono}>{d.docNo}</td>
                    <td>
                      <StatusBadge status={d.status} />
                    </td>
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
          <Drawer
            open={selectedId !== null && editor === null}
            wide
            title="单据详情"
            onClose={() => setSelectedId(null)}
          >
            {selectedId !== null && (
              <DocumentDetailView
                key={selectedId}
                id={selectedId}
                onChanged={(id) => {
                  if (id === null) setSelectedId(null)
                  void load()
                }}
                onEdit={(id) => setEditor({ view: 'edit', id })}
              />
            )}
          </Drawer>
        </>
      )}
      {editor && (
        <DocumentEditor
          key={editor.view === 'edit' ? `edit-${editor.id}` : `new-${editor.type}`}
          mode={editor}
          onClose={() => setEditor(null)}
          onSaved={(d) => {
            setEditor(null)
            setSelectedId(d.id)
            void load()
          }}
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
