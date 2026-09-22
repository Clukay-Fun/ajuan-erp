import type { ReactElement } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { PackagePlus, Scale } from 'lucide-react'
import type { DocumentSummary, Product, StockLevel } from '@shared/types'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/Button'
import { useToast } from '@/components/Toast'
import { unwrap, errorMessage } from '@/lib/api'
import { formatCents, formatQty } from '@/lib/format'
import { ProductEditDrawer } from '@/features/products/ProductEditDrawer'
import { OpeningStockDrawer } from '@/features/products/OpeningStockDrawer'
import { ProductImage } from '@/features/products/ProductImage'
import { AdjustmentDrawer } from '@/features/adjustments/AdjustmentDrawer'
import { useNav } from '@/app/navigation'
import { SkeletonCard } from '@/components/Skeleton'
import styles from './ProductsPage.module.css'

export function ProductsPage(): ReactElement {
  const toast = useToast()
  const { navigate } = useNav()
  const [adjustOpen, setAdjustOpen] = useState(false)
  const [product, setProduct] = useState<Product | null>(null)
  const [stock, setStock] = useState<StockLevel | null>(null)
  const [opening, setOpening] = useState<DocumentSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [openingOpen, setOpeningOpen] = useState(false)

  const load = useCallback(async () => {
    try {
      const p = await unwrap(window.ajuan.products.get())
      const [s, o] = await Promise.all([
        unwrap(window.ajuan.inventory.getStock(p.defaultSku.id)),
        unwrap(window.ajuan.opening.get(p.defaultSku.id))
      ])
      setProduct(p)
      setStock(s)
      setOpening(o)
      setError(null)
    } catch (err) {
      setError(errorMessage(err))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (error) {
    return (
      <>
        <PageHeader title="商品资料" />
        <p className={styles.error}>读取失败：{error}</p>
      </>
    )
  }
  if (!product || !stock) {
    return (
      <>
        <PageHeader title="商品资料" />
        <SkeletonCard lines={4} style={{ marginBottom: 16 }} />
        <SkeletonCard lines={2} />
      </>
    )
  }

  const lowStock = stock.quantity <= product.lowStockThreshold

  return (
    <>
      <PageHeader
        title="商品资料"
        actions={
          <>
            {opening && (
              <Button onClick={() => setAdjustOpen(true)}>
                <Scale size={16} /> 库存调整
              </Button>
            )}
            <Button onClick={() => setEditing(true)}>编辑资料</Button>
          </>
        }
      />

      <section className={styles.card}>
        <div className={styles.profile}>
          <ProductImage product={product} onChanged={setProduct} size={152} />
          <div>
            <div className={styles.name}>{product.name}</div>
            <div className={`${styles.code} selectable`}>{product.code}</div>
            <dl className={`${styles.meta} selectable`}>
              <dt>SKU</dt>
              <dd>{product.defaultSku.code}</dd>
              <dt>单位</dt>
              <dd>{product.unit}</dd>
              <dt>当前库存</dt>
              <dd>
                {formatQty(stock.quantity)} {product.unit}
                {opening && lowStock && <span className={styles.error}>（低于预警值）</span>}
              </dd>
              <dt>平均成本</dt>
              <dd>{stock.quantity > 0 ? `¥${formatCents(stock.avgCostCents)}` : '—'}</dd>
            </dl>
          </div>
        </div>
        <div className={styles.stats}>
          <div className={styles.stat}>
            <div className={styles.statLabel}>默认进价</div>
            <div className={styles.statValue}>¥{formatCents(product.defaultCostCents)}</div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statLabel}>默认售价</div>
            <div className={styles.statValue}>¥{formatCents(product.defaultPriceCents)}</div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statLabel}>库存预警值</div>
            <div className={styles.statValue}>
              {formatQty(product.lowStockThreshold)} {product.unit}
            </div>
          </div>
        </div>
      </section>

      <section className={styles.card}>
        <h2 className={styles.sectionTitle}>
          期初库存
          {!opening && (
            <Button variant="primary" onClick={() => setOpeningOpen(true)}>
              <PackagePlus size={16} /> 录入期初库存
            </Button>
          )}
        </h2>
        {opening ? (
          <div className={`${styles.openingRow} selectable`}>
            <div className={styles.stat}>
              <div className={styles.statLabel}>单号</div>
              <div className={styles.statValue}>{opening.docNo}</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statLabel}>日期</div>
              <div className={styles.statValue}>{opening.docDate}</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statLabel}>数量</div>
              <div className={styles.statValue}>
                {formatQty(opening.totalQuantity)} {product.unit}
              </div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statLabel}>成本总额</div>
              <div className={styles.statValue}>¥{formatCents(opening.totalAmountCents)}</div>
            </div>
          </div>
        ) : (
          <div className={styles.openingEmpty}>
            <strong>还没有期初库存</strong>
            <span>首次使用时，请录入当前实际库存数量和单位成本，作为库存账的起点。</span>
            <span className={styles.openingState}>当前状态：未初始化</span>
          </div>
        )}
      </section>

      <ProductEditDrawer
        open={editing}
        product={product}
        onClose={() => setEditing(false)}
        onSubmit={async (input) => {
          try {
            await unwrap(window.ajuan.products.update(input))
            toast('商品资料已保存', 'success')
            setEditing(false)
            await load()
          } catch (err) {
            toast(errorMessage(err), 'error')
          }
        }}
      />
      <AdjustmentDrawer
        open={adjustOpen}
        onClose={() => setAdjustOpen(false)}
        onCreated={(d) => {
          setAdjustOpen(false)
          navigate('documents', { documents: { view: 'detail', id: d.id } })
        }}
      />
      <OpeningStockDrawer
        open={openingOpen}
        product={product}
        onClose={() => setOpeningOpen(false)}
        onSubmit={async (input) => {
          try {
            const doc = await unwrap(window.ajuan.opening.create(input))
            toast(`期初库存已确认：${doc.docNo}`, 'success')
            setOpeningOpen(false)
            await load()
          } catch (err) {
            toast(errorMessage(err), 'error')
          }
        }}
      />
    </>
  )
}
