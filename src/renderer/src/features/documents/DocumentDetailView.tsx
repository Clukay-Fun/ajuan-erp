import type { ReactElement } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { Pencil, Trash2, Check, Ban, Download } from 'lucide-react'
import type { DocumentDetail } from '@shared/types'
import { Button } from '@/components/Button'
import { Field } from '@/components/Field'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { StatusBadge, TypeBadge, TYPE_LABEL } from '@/components/Badge'
import { useToast } from '@/components/Toast'
import { unwrap, errorMessage } from '@/lib/api'
import { formatCents, formatQty } from '@/lib/format'
import table from '@/components/Table.module.css'
import styles from './DocumentDetailView.module.css'
import { AttachmentPanel } from '@/features/attachments/AttachmentPanel'
import { SkeletonCard } from '@/components/Skeleton'

/** 用户在保存对话框里取消：不算成功也不算失败 */
class ApiCancel extends Error {}

interface Props {
  id: number
  /** 单据状态变化 / 删除后通知父级刷新列表；删除时传 null */
  onChanged?: (id: number | null) => void
  onEdit?: (id: number) => void
}

export function DocumentDetailView({ id, onChanged, onEdit }: Props): ReactElement {
  const toast = useToast()
  const [doc, setDoc] = useState<DocumentDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dialog, setDialog] = useState<'delete' | 'confirm' | 'void' | null>(null)
  const [voidReason, setVoidReason] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setDoc(await unwrap(window.ajuan.documents.get(id)))
      setError(null)
    } catch (err) {
      setError(errorMessage(err))
    }
  }, [id])
  useEffect(() => {
    void load()
  }, [load])

  async function run(action: () => Promise<void>, success: string): Promise<void> {
    setBusy(true)
    try {
      await action()
      toast(success, 'success')
      setDialog(null)
    } catch (err) {
      if (!(err instanceof ApiCancel)) toast(errorMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  if (error) return <p className={styles.error}>读取失败：{error}</p>
  if (!doc)
    return (
      <>
        <SkeletonCard lines={2} style={{ marginBottom: 16 }} />
        <SkeletonCard lines={3} />
      </>
    )

  const label = TYPE_LABEL[doc.type]
  const showCost = doc.type === 'outbound' && doc.status !== 'draft'

  return (
    <>
      <div className={styles.top}>
        <div>
          <div className={styles.titleRow}>
            <span className={`${styles.title} selectable`}>{doc.docNo}</span>
            <TypeBadge type={doc.type} />
            <StatusBadge status={doc.status} />
          </div>
        </div>
        <div className={styles.actions}>
          {doc.status !== 'draft' && (
            <Button
              onClick={() =>
                run(async () => {
                  const p = await unwrap(window.ajuan.csv.exportDocument(doc.id))
                  if (!p) throw new ApiCancel()
                }, '单据已导出')
              }
            >
              <Download size={16} /> 导出
            </Button>
          )}
          {doc.status === 'draft' && (
            <>
              <Button onClick={() => setDialog('delete')}>
                <Trash2 size={16} /> 删除草稿
              </Button>
              <Button onClick={() => onEdit?.(doc.id)}>
                <Pencil size={16} /> 编辑
              </Button>
              <Button variant="primary" onClick={() => setDialog('confirm')}>
                <Check size={16} /> 确认{label}
              </Button>
            </>
          )}
          {doc.status === 'confirmed' && doc.type !== 'opening' && (
            <Button
              onClick={() => {
                setVoidReason('')
                setDialog('void')
              }}
            >
              <Ban size={16} /> 作废
            </Button>
          )}
        </div>
      </div>

      <section className={styles.card}>
        <dl className={`${styles.meta} selectable`}>
          <dt>{label}日期</dt>
          <dd>{doc.docDate}</dd>
          {doc.type === 'outbound' && (
            <>
              <dt>销售渠道</dt>
              <dd>{doc.channelName ?? '—'}</dd>
              <dt>外部订单号</dt>
              <dd>{doc.externalOrderNo || '—'}</dd>
            </>
          )}
          {doc.type === 'adjustment' && (
            <>
              <dt>调整方向</dt>
              <dd>{doc.adjustDirection === 'increase' ? '盘盈增加' : '盘亏减少'}</dd>
            </>
          )}
          <dt>{doc.type === 'adjustment' ? '调整原因' : '备注'}</dt>
          <dd>{doc.note || '—'}</dd>
          {doc.confirmedAt && (
            <>
              <dt>生效时间</dt>
              <dd>{new Date(doc.confirmedAt).toLocaleString('zh-CN')}</dd>
            </>
          )}
          {doc.status === 'voided' && (
            <>
              <dt>作废时间</dt>
              <dd>{doc.voidedAt ? new Date(doc.voidedAt).toLocaleString('zh-CN') : '—'}</dd>
              <dt>作废原因</dt>
              <dd>{doc.voidReason}</dd>
            </>
          )}
        </dl>
      </section>

      <div className={table.wrap}>
        <table className={table.table}>
          <thead>
            <tr>
              <th>#</th>
              <th>商品 / SKU</th>
              <th className={table.num}>数量</th>
              <th className={table.num}>
                {doc.type === 'outbound' ? '售价' : doc.type === 'adjustment' ? '计入成本' : '单价'}
              </th>
              {showCost && <th className={table.num}>成本快照</th>}
              <th className={table.num}>小计</th>
            </tr>
          </thead>
          <tbody>
            {doc.items.map((it) => (
              <tr key={it.id}>
                <td className={table.muted}>{it.lineNo}</td>
                <td>
                  {it.productName} <span className={table.muted}>· {it.skuCode}</span>
                </td>
                <td className={table.num}>{formatQty(it.quantity)}</td>
                <td className={table.num}>¥{formatCents(it.unitPriceCents)}</td>
                {showCost && (
                  <td className={table.num}>
                    {it.costSnapshotCents === null ? '—' : `¥${formatCents(it.costSnapshotCents)}`}
                  </td>
                )}
                <td className={table.num}>¥{formatCents(it.quantity * it.unitPriceCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className={styles.total}>
          <span>
            合计：<strong>{formatQty(doc.totalQuantity)}</strong>
          </span>
          <span>
            金额：<strong>¥{formatCents(doc.totalAmountCents)}</strong>
          </span>
        </div>
      </div>

      <section className={styles.card} style={{ marginTop: 'var(--space-4)' }}>
        <div className={styles.sectionTitle}>附件与备注图片</div>
        <AttachmentPanel documentId={doc.id} readOnly={doc.status === 'voided'} />
      </section>

      <ConfirmDialog
        open={dialog === 'delete'}
        danger
        title="删除这张草稿？"
        confirmText="删除"
        busy={busy}
        description={`${doc.docNo} 将被永久删除。草稿尚未影响库存。`}
        onCancel={() => setDialog(null)}
        onConfirm={() =>
          run(async () => {
            await unwrap(window.ajuan.documents.deleteDraft(doc.id))
            onChanged?.(null)
          }, '草稿已删除')
        }
      />
      <ConfirmDialog
        open={dialog === 'confirm'}
        title={`确认${label}？`}
        confirmText={`确认${label}`}
        busy={busy}
        description={`确认后库存${doc.type === 'inbound' ? '增加' : '减少'} ${formatQty(doc.totalQuantity)}，单据生效后不能再修改，只能作废。`}
        onCancel={() => setDialog(null)}
        onConfirm={() =>
          run(async () => {
            setDoc(await unwrap(window.ajuan.documents.confirm(doc.id)))
            onChanged?.(doc.id)
          }, `${label}已确认`)
        }
      />
      <ConfirmDialog
        open={dialog === 'void'}
        danger
        title={`作废 ${doc.docNo}？`}
        confirmText="作废并冲回库存"
        busy={busy}
        disabled={!voidReason.trim()}
        description="作废会生成反向流水冲回库存，原单据与原流水永久保留，不可撤销。"
        onCancel={() => setDialog(null)}
        onConfirm={() =>
          run(async () => {
            setDoc(await unwrap(window.ajuan.documents.void(doc.id, voidReason)))
            onChanged?.(doc.id)
          }, '单据已作废')
        }
      >
        <Field
          label="作废原因"
          value={voidReason}
          onChange={(e) => setVoidReason(e.target.value)}
          maxLength={200}
          autoFocus
          placeholder="必填，例如：发错货 / 重复录入"
        />
      </ConfirmDialog>
    </>
  )
}
