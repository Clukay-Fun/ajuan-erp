import type { ReactElement } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { PackagePlus, Plus, Scale, ImageIcon, Pencil } from 'lucide-react'
import type { DocumentSummary, Product, StockRow } from '@shared/types'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { SplitView } from '@/components/SplitView'
import { SkeletonTable } from '@/components/Skeleton'
import { TableEmpty } from '@/components/TableEmpty'
import { useToast } from '@/components/Toast'
import { unwrap, errorMessage } from '@/lib/api'
import { formatCents, formatQty } from '@/lib/format'
import { ProductEditDrawer } from '@/features/products/ProductEditDrawer'
import { OpeningStockDrawer } from '@/features/products/OpeningStockDrawer'
import { ProductImage, productImageUrl } from '@/features/products/ProductImage'
import { AdjustmentDrawer } from '@/features/adjustments/AdjustmentDrawer'
import { useNav } from '@/app/navigation'
import table from '@/components/Table.module.css'
import styles from './ProductsPage.module.css'

export function ProductsPage(): ReactElement {
  const toast = useToast()
  const { navigate } = useNav()
  const [rows, setRows] = useState<StockRow[] | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [opening, setOpening] = useState<DocumentSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<'create' | 'edit' | null>(null)
  const [openingOpen, setOpeningOpen] = useState(false)
  const [adjustOpen, setAdjustOpen] = useState(false)

  const load = useCallback(async () => {
    try {
      const list = await unwrap(window.ajuan.inventory.listStock())
      setRows(list)
      setSelectedId((cur) =>
        cur !== null && list.some((r) => r.product.id === cur) ? cur : (list[0]?.product.id ?? null)
      )
      setError(null)
    } catch (err) {
      setError(errorMessage(err))
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  const selected = rows?.find((r) => r.product.id === selectedId) ?? null

  useEffect(() => {
    if (!selected) return
    let alive = true
    unwrap(window.ajuan.opening.get(selected.product.defaultSku.id))
      .then((o) => alive && setOpening(o))
      .catch(() => alive && setOpening(null))
    return () => {
      alive = false
    }
  }, [selected])

  const patchProduct = (p: Product): void =>
    setRows((rs) => rs?.map((r) => (r.product.id === p.id ? { ...r, product: p } : r)) ?? rs)

  if (error)
    return (
      <>
        <PageHeader title="商品" />
        <p className={styles.error}>读取失败：{error}</p>
      </>
    )

  const master = (
    <div className={table.wrap}>
      <table className={`${table.table} ${table.clickable} ${table.fixed}`}>
        <colgroup>
          <col />
          <col style={{ width: 100 }} />
          <col style={{ width: 96 }} />
        </colgroup>
        <thead>
          <tr>
            <th>商品</th>
            <th className={table.num}>库存</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          {rows && rows.length === 0 && <TableEmpty cols={3} title="还没有商品" description="点击右上角「新建商品」" />}
          {rows?.map((r) => {
            const url = productImageUrl(r.product)
            return (
              <tr
                key={r.product.id}
                onClick={() => setSelectedId(r.product.id)}
                aria-selected={r.product.id === selectedId}
                className={r.product.id === selectedId ? table.selected : ''}
              >
                <td>
                  <div className={styles.cell}>
                    <span className={styles.thumb}>
                      {url ? <img src={url} alt="" /> : <ImageIcon size={14} strokeWidth={1.5} />}
                    </span>
                    <span className={styles.cellText}>
                      <span className={`${styles.cellName} ${r.product.isActive ? '' : styles.inactive}`}>
                        {r.product.name}
                      </span>
                      <span className={styles.cellCode}>{r.product.code}</span>
                    </span>
                  </div>
                </td>
                <td className={table.num}>
                  {formatQty(r.stock.quantity)} {r.product.unit}
                </td>
                <td>
                  {!r.product.isActive ? (
                    <Badge>已停用</Badge>
                  ) : !r.hasOpening ? (
                    <Badge>未期初</Badge>
                  ) : r.lowStock ? (
                    <Badge tone="danger">预警</Badge>
                  ) : (
                    <Badge tone="success">正常</Badge>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )

  const detail = selected ? (
    <>
      <section className={styles.card}>
        <div className={styles.detailHead}>
          <div className={styles.profile}>
            <ProductImage product={selected.product} onChanged={patchProduct} size={120} />
            <div>
              <div className={styles.name}>
                {selected.product.name}
                {!selected.product.isActive && <Badge>已停用</Badge>}
              </div>
              <div className={`${styles.code} selectable`}>{selected.product.code}</div>
              <dl className={`${styles.meta} selectable`}>
                <dt>SKU</dt>
                <dd>{selected.product.defaultSku.code}</dd>
                <dt>单位</dt>
                <dd>{selected.product.unit}</dd>
                <dt>当前库存</dt>
                <dd>
                  {formatQty(selected.stock.quantity)} {selected.product.unit}
                  {selected.lowStock && <span className={styles.error}>（低于预警值）</span>}
                </dd>
                <dt>平均成本</dt>
                <dd>{selected.stock.quantity > 0 ? `¥${formatCents(selected.stock.avgCostCents)}` : '—'}</dd>
              </dl>
            </div>
          </div>
          <div className={styles.detailActions}>
            <Button onClick={() => setEditing('edit')}>
              <Pencil size={16} /> 编辑
            </Button>
            {selected.hasOpening && selected.product.isActive && (
              <Button onClick={() => setAdjustOpen(true)}>
                <Scale size={16} /> 库存调整
              </Button>
            )}
          </div>
        </div>
        <div className={styles.stats}>
          <div className={styles.stat}>
            <div className={styles.statLabel}>默认进价</div>
            <div className={styles.statValue}>¥{formatCents(selected.product.defaultCostCents)}</div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statLabel}>默认售价</div>
            <div className={styles.statValue}>¥{formatCents(selected.product.defaultPriceCents)}</div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statLabel}>库存预警值</div>
            <div className={styles.statValue}>
              {formatQty(selected.product.lowStockThreshold)} {selected.product.unit}
            </div>
          </div>
        </div>
      </section>

      <section className={styles.card}>
        <h2 className={styles.sectionTitle}>
          期初库存
          {!selected.hasOpening && selected.product.isActive && (
            <Button variant="primary" onClick={() => setOpeningOpen(true)}>
              <PackagePlus size={16} /> 录入期初库存
            </Button>
          )}
        </h2>
        {selected.hasOpening && opening ? (
          <div className={`${styles.openingRow} selectable`}>
            <div className={styles.stat}>
              <div className={styles.statLabel}>单号</div>
              <div className={styles.statValue}>
                <button
                  type="button"
                  className={styles.link}
                  onClick={() => navigate('documents', { documents: { view: 'detail', id: opening.id } })}
                >
                  {opening.docNo}
                </button>
              </div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statLabel}>日期</div>
              <div className={styles.statValue}>{opening.docDate}</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statLabel}>数量</div>
              <div className={styles.statValue}>
                {formatQty(opening.totalQuantity)} {selected.product.unit}
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
          </div>
        )}
      </section>
    </>
  ) : null

  return (
    <>
      <PageHeader
        title="商品"
        actions={
          <Button variant="primary" onClick={() => setEditing('create')}>
            <Plus size={16} /> 新建商品
          </Button>
        }
      />
      {!rows ? (
        <SkeletonTable cols={3} />
      ) : (
        <SplitView master={master} detail={detail} placeholder="从左侧选择一个商品" />
      )}

      <ProductEditDrawer
        open={editing !== null}
        product={editing === 'edit' ? (selected?.product ?? null) : null}
        onClose={() => setEditing(null)}
        onSubmit={async (input) => {
          try {
            if (editing === 'create') {
              const p = await unwrap(window.ajuan.products.create(input))
              toast(`商品 ${p.code} 已创建`, 'success')
              setEditing(null)
              await load()
              setSelectedId(p.id)
            } else if (selected) {
              await unwrap(window.ajuan.products.update(selected.product.id, input))
              toast('商品资料已保存', 'success')
              setEditing(null)
              await load()
            }
          } catch (err) {
            toast(errorMessage(err), 'error')
          }
        }}
      />
      {selected && (
        <>
          <OpeningStockDrawer
            open={openingOpen}
            product={selected.product}
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
          <AdjustmentDrawer
            open={adjustOpen}
            product={selected.product}
            onClose={() => setAdjustOpen(false)}
            onCreated={async (d) => {
              setAdjustOpen(false)
              toast(`库存调整已生效：${d.docNo}`, 'success')
              await load()
            }}
          />
        </>
      )}
    </>
  )
}
