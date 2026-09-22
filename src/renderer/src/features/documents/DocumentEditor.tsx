import type { ReactElement } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import type { DocumentDetail, DocumentSummary, DocumentType, Product, SalesChannel, StockLevel } from '@shared/types'
import type { DocumentDraftInput } from '@shared/schemas'
import { Button } from '@/components/Button'
import { Field } from '@/components/Field'
import { Select } from '@/components/Select'
import { Dropdown } from '@/components/Dropdown'
import { useToast } from '@/components/Toast'
import { TYPE_LABEL } from '@/components/Badge'
import { unwrap, errorMessage } from '@/lib/api'
import { formatCents, formatQty, parseCents, todayString } from '@/lib/format'
import { useNav, useNavGuard } from '@/app/navigation'
import table from '@/components/Table.module.css'
import styles from './DocumentEditor.module.css'
import { AttachmentPanel } from '@/features/attachments/AttachmentPanel'
import { SkeletonCard } from '@/components/Skeleton'

interface Props {
  mode: { view: 'new'; type: DocumentType } | { view: 'edit'; id: number }
}

interface Line {
  key: number
  skuId: number
  quantity: string
  unitPrice: string
}

let lineSeq = 0
const newLine = (skuId: number, price: number): Line => ({
  key: ++lineSeq,
  skuId,
  quantity: '',
  unitPrice: (price / 100).toFixed(2)
})

export function DocumentEditor({ mode }: Props): ReactElement {
  const { navigate } = useNav()
  const toast = useToast()
  const [products, setProducts] = useState<Product[] | null>(null)
  const [stocks, setStocks] = useState<Map<number, StockLevel>>(new Map())
  const [channels, setChannels] = useState<SalesChannel[]>([])
  const [existing, setExisting] = useState<DocumentDetail | null>(null)
  const [type, setType] = useState<DocumentType>(mode.view === 'new' ? mode.type : 'inbound')
  const [docDate, setDocDate] = useState(todayString)
  const [channelId, setChannelId] = useState<number | null>(null)
  const [externalOrderNo, setExternalOrderNo] = useState('')
  const [note, setNote] = useState('')
  const [lines, setLines] = useState<Line[]>([])
  const [duplicate, setDuplicate] = useState<DocumentSummary | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState<'save' | 'confirm' | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const dirtyRef = useRef(false)
  useNavGuard(() => dirtyRef.current)

  useEffect(() => {
    ;(async () => {
      try {
        const [rows, cs] = await Promise.all([
          unwrap(window.ajuan.inventory.listStock()),
          unwrap(window.ajuan.channels.list())
        ])
        const active = rows.filter((r) => r.product.isActive).map((r) => r.product)
        const p = active[0]
        if (!p) throw new Error('没有启用的商品')
        setProducts(active)
        setStocks(new Map(rows.map((r) => [r.product.defaultSku.id, r.stock])))
        setChannels(cs)
        if (mode.view === 'edit') {
          const d = await unwrap(window.ajuan.documents.get(mode.id))
          setExisting(d)
          setType(d.type)
          setDocDate(d.docDate)
          setChannelId(d.channelId)
          setExternalOrderNo(d.externalOrderNo)
          setNote(d.note)
          setLines(
            d.items.map((it) => ({
              key: ++lineSeq,
              skuId: it.skuId,
              quantity: String(it.quantity),
              unitPrice: (it.unitPriceCents / 100).toFixed(2)
            }))
          )
        } else {
          const price = mode.type === 'inbound' ? p.defaultCostCents : p.defaultPriceCents
          setLines([newLine(p.defaultSku.id, price)])
        }
      } catch (err) {
        setLoadError(errorMessage(err))
      }
    })()
  }, [mode])

  // 加载完成后的任何改动都算未保存
  const loadedRef = useRef(false)
  useEffect(() => {
    if (!products) return
    if (!loadedRef.current) {
      loadedRef.current = true
      return
    }
    dirtyRef.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docDate, channelId, externalOrderNo, note, lines])

  // 重复外部订单号提示（防抖）
  useEffect(() => {
    if (type !== 'outbound' || channelId === null || !externalOrderNo.trim()) {
      setDuplicate(null)
      return
    }
    const t = window.setTimeout(async () => {
      try {
        setDuplicate(
          await unwrap(window.ajuan.documents.findDuplicate(channelId, externalOrderNo, existing?.id ?? null))
        )
      } catch {
        setDuplicate(null)
      }
    }, 300)
    return () => window.clearTimeout(t)
  }, [type, channelId, externalOrderNo, existing])

  const parsed = useMemo(() => {
    const items = lines.map((l) => {
      const qty = /^\d+$/.test(l.quantity.trim()) ? Number(l.quantity) : null
      const price = parseCents(l.unitPrice)
      return { line: l, qty, price, valid: qty !== null && qty >= 1 && price !== null }
    })
    const totalQty = items.reduce((a, i) => a + (i.qty ?? 0), 0)
    const totalAmount = items.reduce((a, i) => a + (i.qty !== null && i.price !== null ? i.qty * i.price : 0), 0)
    // 按 SKU 汇总需求量，逐个对比库存
    const need = new Map<number, number>()
    for (const i of items) need.set(i.line.skuId, (need.get(i.line.skuId) ?? 0) + (i.qty ?? 0))
    return { items, totalQty, totalAmount, need, allValid: items.length > 0 && items.every((i) => i.valid) }
  }, [lines])

  const shortages =
    type === 'outbound' ? [...parsed.need.entries()].filter(([skuId, q]) => q > (stocks.get(skuId)?.quantity ?? 0)) : []
  const insufficient = shortages.length > 0
  const productOf = (skuId: number): Product | undefined => products?.find((x) => x.defaultSku.id === skuId)
  const defaultPrice = (p: Product): number => (type === 'inbound' ? p.defaultCostCents : p.defaultPriceCents)

  const buildInput = useCallback((): DocumentDraftInput | null => {
    setTouched(true)
    if (!parsed.allValid) {
      setFormError('请检查商品明细：数量为正整数，单价为非负金额（最多两位小数）')
      return null
    }
    setFormError(null)
    return {
      type: type as 'inbound' | 'outbound',
      docDate,
      channelId: type === 'outbound' ? channelId : null,
      externalOrderNo: type === 'outbound' ? externalOrderNo.trim() : '',
      note: note.trim(),
      items: parsed.items.map((i) => ({ skuId: i.line.skuId, quantity: i.qty!, unitPriceCents: i.price! }))
    }
  }, [parsed, type, docDate, channelId, externalOrderNo, note])

  async function saveDraft(): Promise<DocumentDetail | null> {
    const input = buildInput()
    if (!input) return null
    return existing
      ? unwrap(window.ajuan.documents.updateDraft(existing.id, input))
      : unwrap(window.ajuan.documents.createDraft(input))
  }

  async function handleSave(): Promise<void> {
    setBusy('save')
    try {
      const d = await saveDraft()
      if (!d) return
      toast(`草稿已保存：${d.docNo}`, 'success')
      dirtyRef.current = false
      navigate('documents', { documents: { view: 'detail', id: d.id } })
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setBusy(null)
    }
  }

  async function handleConfirm(): Promise<void> {
    if (insufficient) {
      const [skuId, q] = shortages[0]
      setFormError(`库存不足：${productOf(skuId)?.name ?? ''} 当前 ${stocks.get(skuId)?.quantity ?? 0}，本单需要 ${q}`)
      return
    }
    setBusy('confirm')
    try {
      const d = await saveDraft()
      if (!d) return
      const c = await unwrap(window.ajuan.documents.confirm(d.id))
      toast(`${TYPE_LABEL[c.type]}已确认：${c.docNo}`, 'success')
      dirtyRef.current = false
      navigate('documents', { documents: { view: 'detail', id: c.id } })
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setBusy(null)
    }
  }

  const back = (): void =>
    navigate(
      'documents',
      existing ? { documents: { view: 'detail', id: existing.id } } : { documents: { view: 'list' } }
    )

  if (loadError) return <p className={styles.formError}>读取失败：{loadError}</p>
  if (!products)
    return (
      <>
        <SkeletonCard lines={3} style={{ marginBottom: 16 }} />
        <SkeletonCard lines={2} />
      </>
    )

  const label = TYPE_LABEL[type]
  const updateLine = (key: number, patch: Partial<Line>): void =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))

  return (
    <>
      <div className={styles.top}>
        <div>
          <button type="button" className={styles.back} onClick={back}>
            <ArrowLeft size={16} /> 返回
          </button>
          <div className={styles.title}>{existing ? `编辑${label}单 ${existing.docNo}` : `新建${label}单`}</div>
        </div>
        <div className={styles.actions}>
          <Button onClick={handleSave} disabled={busy !== null}>
            {busy === 'save' ? '保存中…' : '保存草稿'}
          </Button>
          <Button variant="primary" onClick={handleConfirm} disabled={busy !== null || insufficient}>
            {busy === 'confirm' ? '确认中…' : `确认${label}`}
          </Button>
        </div>
      </div>

      <section className={styles.section}>
        <div className={styles.sectionTitle}>基本信息</div>
        <div className={`${styles.card} ${styles.grid}`}>
          <Field label={`${label}单号`} value={existing?.docNo ?? '保存后自动生成'} readOnly />
          <Field label={`${label}日期`} type="date" value={docDate} onChange={(e) => setDocDate(e.target.value)} />
          {type === 'outbound' && (
            <>
              <Select
                label="销售渠道"
                value={channelId ?? 0}
                onChange={(v) => setChannelId(v === 0 ? null : v)}
                options={[
                  { value: 0, label: '未指定' },
                  ...channels
                    .filter((c) => c.isActive || c.id === channelId)
                    .map((c) => ({ value: c.id, label: c.name, hint: c.isActive ? undefined : '已停用' }))
                ]}
              />
              <Field
                label="外部订单号"
                value={externalOrderNo}
                onChange={(e) => setExternalOrderNo(e.target.value)}
                placeholder="平台订单号，选填"
                maxLength={64}
              />
              {duplicate && (
                <div className={styles.dup}>
                  该渠道下已有相同订单号的单据{' '}
                  <button
                    type="button"
                    onClick={() => navigate('documents', { documents: { view: 'detail', id: duplicate.id } })}
                  >
                    {duplicate.docNo}
                  </button>
                  ，请确认不是重复录入。
                </div>
              )}
            </>
          )}
          <div className={styles.full}>
            <Field label="备注" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionTitle}>
          {label}商品
          <Button
            variant="ghost"
            onClick={() => setLines((ls) => [...ls, newLine(products[0].defaultSku.id, defaultPrice(products[0]))])}
          >
            <Plus size={16} /> 添加一行
          </Button>
        </div>
        <div className={table.wrap}>
          <table className={table.table}>
            <thead>
              <tr>
                <th>商品 / SKU</th>
                <th className={table.num}>{type === 'outbound' ? '可用库存' : '当前库存'}</th>
                <th className={table.num} style={{ width: 140 }}>
                  数量
                </th>
                <th className={table.num} style={{ width: 160 }}>
                  {type === 'inbound' ? '进价' : '售价'}
                </th>
                <th className={table.num}>小计</th>
                <th style={{ width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {parsed.items.map(({ line, qty, price }) => (
                <tr key={line.key}>
                  <td>
                    <Dropdown
                      aria-label="商品"
                      value={line.skuId}
                      onChange={(skuId) => {
                        const p = productOf(skuId)
                        updateLine(line.key, {
                          skuId,
                          unitPrice: p ? (defaultPrice(p) / 100).toFixed(2) : line.unitPrice
                        })
                      }}
                      options={products.map((p) => ({ value: p.defaultSku.id, label: p.name, hint: p.code }))}
                    />
                  </td>
                  <td className={table.num}>{formatQty(stocks.get(line.skuId)?.quantity ?? 0)}</td>
                  <td className={table.num}>
                    <input
                      className={`${styles.cellInput} ${touched && (qty === null || qty < 1) ? styles.cellInvalid : ''}`}
                      inputMode="numeric"
                      value={line.quantity}
                      onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                      placeholder="0"
                      autoFocus={line.key === lines[0]?.key}
                    />
                  </td>
                  <td className={table.num}>
                    <input
                      className={`${styles.cellInput} ${touched && price === null ? styles.cellInvalid : ''}`}
                      inputMode="decimal"
                      value={line.unitPrice}
                      onChange={(e) => updateLine(line.key, { unitPrice: e.target.value })}
                      placeholder="0.00"
                    />
                  </td>
                  <td className={table.num}>{qty !== null && price !== null ? `¥${formatCents(qty * price)}` : '—'}</td>
                  <td>
                    <button
                      type="button"
                      className={styles.remove}
                      onClick={() => setLines((ls) => ls.filter((l) => l.key !== line.key))}
                      disabled={lines.length <= 1}
                      aria-label="删除此行"
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className={styles.total}>
            {insufficient && (
              <span className={styles.short}>
                库存不足：
                {shortages
                  .map(
                    ([skuId, q]) => `${productOf(skuId)?.name ?? ''} 需 ${q} / 现 ${stocks.get(skuId)?.quantity ?? 0}`
                  )
                  .join('，')}
              </span>
            )}
            <span>
              合计：<strong>{formatQty(parsed.totalQty)}</strong>
            </span>
            <span>
              金额：<strong>¥{formatCents(parsed.totalAmount)}</strong>
            </span>
          </div>
        </div>
        {formError && <p className={styles.formError}>{formError}</p>}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionTitle}>附件与备注图片</div>
        <div className={styles.card}>
          {existing ? (
            <AttachmentPanel documentId={existing.id} />
          ) : (
            <span className={styles.muted}>保存草稿后可以添加图片。</span>
          )}
        </div>
      </section>
    </>
  )
}
