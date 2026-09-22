import type { FormEvent, ReactElement } from 'react'
import { useEffect, useState } from 'react'
import type { Product } from '@shared/types'
import { productUpdateSchema, type ProductUpdateInput } from '@shared/schemas'
import { Drawer } from '@/components/Drawer'
import { Field } from '@/components/Field'
import { Button } from '@/components/Button'
import { formatCents, parseCents } from '@/lib/format'
import styles from './ProductEditDrawer.module.css'

interface Props {
  open: boolean
  /** 为 null 时是新建 */
  product: Product | null
  onClose: () => void
  onSubmit: (input: ProductUpdateInput) => Promise<void>
}

interface FormState {
  code: string
  name: string
  unit: string
  defaultCost: string
  defaultPrice: string
  lowStockThreshold: string
  isActive: boolean
}

type Errors = Partial<Record<keyof FormState, string>>

function fromProduct(p: Product | null): FormState {
  if (!p)
    return { code: '', name: '', unit: '件', defaultCost: '', defaultPrice: '', lowStockThreshold: '0', isActive: true }
  return {
    code: p.code,
    name: p.name,
    unit: p.unit,
    defaultCost: formatCents(p.defaultCostCents).replaceAll(',', ''),
    defaultPrice: formatCents(p.defaultPriceCents).replaceAll(',', ''),
    lowStockThreshold: String(p.lowStockThreshold),
    isActive: p.isActive
  }
}

export function ProductEditDrawer({ open, product, onClose, onSubmit }: Props): ReactElement {
  const [form, setForm] = useState<FormState>(() => fromProduct(product))
  const [errors, setErrors] = useState<Errors>({})
  const [saving, setSaving] = useState(false)
  const creating = product === null

  useEffect(() => {
    if (open) {
      setForm(fromProduct(product))
      setErrors({})
    }
  }, [open, product])

  const set = (k: keyof FormState) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault()
    const next: Errors = {}
    const cost = parseCents(form.defaultCost)
    const price = parseCents(form.defaultPrice)
    const threshold = /^\d+$/.test(form.lowStockThreshold.trim()) ? Number(form.lowStockThreshold) : NaN
    if (cost === null) next.defaultCost = '请输入非负金额，最多两位小数'
    if (price === null) next.defaultPrice = '请输入非负金额，最多两位小数'
    if (Number.isNaN(threshold)) next.lowStockThreshold = '请输入非负整数'
    const parsed = productUpdateSchema.safeParse({
      code: form.code,
      name: form.name,
      unit: form.unit,
      isActive: form.isActive,
      defaultCostCents: cost ?? 0,
      defaultPriceCents: price ?? 0,
      lowStockThreshold: Number.isNaN(threshold) ? 0 : threshold
    })
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const k = issue.path[0] as string
        if (k === 'code' || k === 'name' || k === 'unit') next[k] = issue.message
      }
    }
    setErrors(next)
    if (Object.keys(next).length || !parsed.success) return
    setSaving(true)
    try {
      await onSubmit(parsed.data)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Drawer
      open={open}
      title={creating ? '新建商品' : '编辑商品资料'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>
            取消
          </Button>
          <Button variant="primary" type="submit" form="product-edit-form" disabled={saving}>
            {saving ? '保存中…' : creating ? '创建' : '保存'}
          </Button>
        </>
      }
    >
      <form id="product-edit-form" onSubmit={handleSubmit} style={{ display: 'contents' }}>
        <Field
          label="商品编码"
          value={form.code}
          onChange={set('code')}
          error={errors.code}
          autoFocus
          placeholder="例如 FG002"
          hint={creating ? '默认 SKU 编码为「编码-DEFAULT」' : undefined}
        />
        <Field label="商品名称" value={form.name} onChange={set('name')} error={errors.name} />
        <Field label="单位" value={form.unit} onChange={set('unit')} error={errors.unit} />
        <Field
          label="默认进价"
          prefix="¥"
          inputMode="decimal"
          value={form.defaultCost}
          onChange={set('defaultCost')}
          error={errors.defaultCost}
        />
        <Field
          label="默认售价"
          prefix="¥"
          inputMode="decimal"
          value={form.defaultPrice}
          onChange={set('defaultPrice')}
          error={errors.defaultPrice}
        />
        <Field
          label="库存预警值"
          suffix={form.unit || '件'}
          inputMode="numeric"
          value={form.lowStockThreshold}
          onChange={set('lowStockThreshold')}
          error={errors.lowStockThreshold}
          hint="库存低于该值时在概览页提示"
        />
        {!creating && (
          <label className={styles.switch}>
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
            />
            <span>
              <strong>启用</strong>
              <em>停用后不能开新单，历史单据与库存保留</em>
            </span>
          </label>
        )}
      </form>
    </Drawer>
  )
}
