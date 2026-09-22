import type { FormEvent, ReactElement } from 'react'
import { useEffect, useState } from 'react'
import type { AdjustDirection, DocumentDetail, Product, StockLevel } from '@shared/types'
import { Drawer } from '@/components/Drawer'
import { Field } from '@/components/Field'
import { Button } from '@/components/Button'
import { useToast } from '@/components/Toast'
import { unwrap, errorMessage } from '@/lib/api'
import { formatCents, formatQty, parseCents, todayString } from '@/lib/format'
import styles from './AdjustmentDrawer.module.css'

interface Props {
  open: boolean
  onClose: () => void
  onCreated: (doc: DocumentDetail) => void
}

export function AdjustmentDrawer({ open, onClose, onCreated }: Props): ReactElement {
  const toast = useToast()
  const [product, setProduct] = useState<Product | null>(null)
  const [stock, setStock] = useState<StockLevel | null>(null)
  const [direction, setDirection] = useState<AdjustDirection>('decrease')
  const [quantity, setQuantity] = useState('')
  const [unitCost, setUnitCost] = useState('')
  const [docDate, setDocDate] = useState(todayString)
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState<{ quantity?: string; unitCost?: string; reason?: string }>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setDirection('decrease')
    setQuantity('')
    setDocDate(todayString())
    setReason('')
    setErrors({})
    ;(async () => {
      try {
        const p = await unwrap(window.ajuan.products.get())
        const s = await unwrap(window.ajuan.inventory.getStock(p.defaultSku.id))
        setProduct(p)
        setStock(s)
        setUnitCost(formatCents(s.quantity > 0 ? s.avgCostCents : p.defaultCostCents).replaceAll(',', ''))
      } catch (err) {
        toast(errorMessage(err), 'error')
      }
    })()
  }, [open, toast])

  const qty = /^\d+$/.test(quantity.trim()) ? Number(quantity) : null
  const cost = parseCents(unitCost)
  const after = stock && qty !== null ? (direction === 'increase' ? stock.quantity + qty : stock.quantity - qty) : null
  const tooMany = direction === 'decrease' && stock !== null && qty !== null && qty > stock.quantity

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault()
    if (!product || !stock) return
    const next: typeof errors = {}
    if (qty === null || qty < 1) next.quantity = '请输入至少为 1 的整数'
    else if (tooMany) next.quantity = `最多减少 ${formatQty(stock.quantity)}`
    if (direction === 'increase' && cost === null) next.unitCost = '请输入非负金额，最多两位小数'
    if (!reason.trim()) next.reason = '请填写调整原因'
    setErrors(next)
    if (Object.keys(next).length) return
    setSaving(true)
    try {
      const doc = await unwrap(
        window.ajuan.adjustments.create({
          skuId: product.defaultSku.id,
          direction,
          quantity: qty!,
          unitCostCents: direction === 'increase' ? cost : null,
          docDate,
          reason: reason.trim()
        })
      )
      toast(`库存调整已生效：${doc.docNo}`, 'success')
      onCreated(doc)
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Drawer
      open={open}
      title="库存调整"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>
            取消
          </Button>
          <Button variant="primary" type="submit" form="adjust-form" disabled={saving || !product}>
            {saving ? '写入中…' : '确认调整'}
          </Button>
        </>
      }
    >
      <p className={styles.notice}>调整会直接生效并写入流水，用于盘点差异和期初纠错。错了可以作废冲回，不能修改。</p>
      <form id="adjust-form" onSubmit={handleSubmit} style={{ display: 'contents' }}>
        <div className={styles.segment} role="radiogroup" aria-label="调整方向">
          <button
            type="button"
            role="radio"
            aria-checked={direction === 'decrease'}
            className={styles.seg}
            onClick={() => setDirection('decrease')}
          >
            盘亏减少
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={direction === 'increase'}
            className={styles.seg}
            onClick={() => setDirection('increase')}
          >
            盘盈增加
          </button>
        </div>
        {product && stock && (
          <Field label="商品" value={`${product.name} · 当前 ${formatQty(stock.quantity)} ${product.unit}`} readOnly />
        )}
        <Field
          label={direction === 'increase' ? '增加数量' : '减少数量'}
          suffix={product?.unit ?? '件'}
          inputMode="numeric"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          error={errors.quantity}
          autoFocus
        />
        {direction === 'increase' ? (
          <Field
            label="计入单位成本"
            prefix="¥"
            inputMode="decimal"
            value={unitCost}
            onChange={(e) => setUnitCost(e.target.value)}
            error={errors.unitCost}
            hint="默认为当前平均成本；会影响调整后的均价"
          />
        ) : (
          stock && (
            <Field
              label="结转成本"
              value={`¥${formatCents(stock.avgCostCents)} / ${product?.unit ?? '件'}（当前平均成本）`}
              readOnly
            />
          )
        )}
        <Field label="调整日期" type="date" value={docDate} onChange={(e) => setDocDate(e.target.value)} />
        <Field
          label="调整原因"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          error={errors.reason}
          maxLength={200}
          placeholder="必填，例如：月末盘点少 3 件 / 期初录多了"
        />
      </form>
      <div className={styles.total}>
        <span>调整后库存</span>
        <strong className={tooMany ? styles.bad : ''}>
          {after === null ? '—' : `${formatQty(after)} ${product?.unit ?? ''}`}
        </strong>
      </div>
    </Drawer>
  )
}
