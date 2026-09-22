import type { FormEvent, ReactElement } from 'react'
import { useEffect, useState } from 'react'
import type { Product } from '@shared/types'
import type { OpeningStockInput } from '@shared/schemas'
import { Drawer } from '@/components/Drawer'
import { Field } from '@/components/Field'
import { Button } from '@/components/Button'
import { formatCents, parseCents, todayString } from '@/lib/format'
import styles from './OpeningStockDrawer.module.css'

interface Props {
  open: boolean
  product: Product
  onClose: () => void
  onSubmit: (input: OpeningStockInput) => Promise<void>
}

export function OpeningStockDrawer({ open, product, onClose, onSubmit }: Props): ReactElement {
  const [quantity, setQuantity] = useState('')
  const [unitCost, setUnitCost] = useState('')
  const [docDate, setDocDate] = useState(todayString)
  const [note, setNote] = useState('')
  const [errors, setErrors] = useState<{ quantity?: string; unitCost?: string; docDate?: string }>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setQuantity('')
      setUnitCost(formatCents(product.defaultCostCents).replaceAll(',', ''))
      setDocDate(todayString())
      setNote('')
      setErrors({})
    }
  }, [open, product])

  const qty = /^\d+$/.test(quantity.trim()) ? Number(quantity) : null
  const cost = parseCents(unitCost)
  const total = qty !== null && cost !== null ? qty * cost : null

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault()
    const next: typeof errors = {}
    if (qty === null || qty < 1) next.quantity = '请输入至少为 1 的整数'
    if (cost === null) next.unitCost = '请输入非负金额，最多两位小数'
    if (!/^\d{4}-\d{2}-\d{2}$/.test(docDate)) next.docDate = '请选择日期'
    setErrors(next)
    if (Object.keys(next).length) return
    setSaving(true)
    try {
      await onSubmit({ skuId: product.defaultSku.id, quantity: qty!, unitCostCents: cost!, docDate, note })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Drawer
      open={open}
      title="录入期初库存"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>
            取消
          </Button>
          <Button variant="primary" type="submit" form="opening-form" disabled={saving}>
            {saving ? '写入中…' : '确认期初'}
          </Button>
        </>
      }
    >
      <p className={styles.notice}>期初库存只能录入一次，确认后生成不可删除的期初记录。后续纠错请通过库存调整完成。</p>
      <form id="opening-form" onSubmit={handleSubmit} style={{ display: 'contents' }}>
        <Field label="商品" value={`${product.name} · ${product.code}`} readOnly />
        <Field
          label="期初数量"
          suffix={product.unit}
          inputMode="numeric"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          error={errors.quantity}
          autoFocus
        />
        <Field
          label="单位成本"
          prefix="¥"
          inputMode="decimal"
          value={unitCost}
          onChange={(e) => setUnitCost(e.target.value)}
          error={errors.unitCost}
          hint="作为初始移动加权平均成本"
        />
        <Field
          label="期初日期"
          type="date"
          value={docDate}
          onChange={(e) => setDocDate(e.target.value)}
          error={errors.docDate}
        />
        <Field label="备注" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
      </form>
      <div className={styles.total}>
        <span>期初库存成本</span>
        <strong>{total === null ? '—' : `¥${formatCents(total)}`}</strong>
      </div>
    </Drawer>
  )
}
