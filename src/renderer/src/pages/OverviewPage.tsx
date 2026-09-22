import type { ReactElement } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { PackagePlus, PackageMinus, ImageIcon } from 'lucide-react'
import type { Overview } from '@shared/types'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/Button'
import { Badge, StatusBadge, TypeBadge } from '@/components/Badge'
import { SkeletonCard } from '@/components/Skeleton'
import { unwrap, errorMessage } from '@/lib/api'
import { formatCents, formatQty } from '@/lib/format'
import { useNav } from '@/app/navigation'
import { TrendChart } from '@/features/overview/TrendChart'
import { productImageUrl } from '@/features/products/ProductImage'
import table from '@/components/Table.module.css'
import styles from './OverviewPage.module.css'

export function OverviewPage(): ReactElement {
  const { navigate } = useNav()
  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setData(await unwrap(window.ajuan.overview.get()))
      setError(null)
    } catch (err) {
      setError(errorMessage(err))
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  const today = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
  const actions = (
    <>
      <Button variant="primary" onClick={() => navigate('documents', { documents: { view: 'new', type: 'inbound' } })}>
        <PackagePlus size={16} /> 入库
      </Button>
      <Button variant="primary" onClick={() => navigate('documents', { documents: { view: 'new', type: 'outbound' } })}>
        <PackageMinus size={16} /> 出库
      </Button>
    </>
  )

  if (error)
    return (
      <>
        <PageHeader title="概览" subtitle={today} />
        <p className={styles.error}>读取失败：{error}</p>
      </>
    )
  if (!data)
    return (
      <>
        <PageHeader title="概览" subtitle={today} actions={actions} />
        <div className={styles.kpis}>
          {[0, 1, 2, 3].map((i) => (
            <SkeletonCard key={i} lines={1} />
          ))}
        </div>
        <div className={styles.row}>
          <SkeletonCard lines={5} />
          <SkeletonCard lines={5} />
        </div>
      </>
    )

  const { rows, today: t, hasOpening } = data
  const lowRows = rows.filter((r) => r.lowStock)
  const singleUnit = new Set(rows.map((r) => r.product.unit)).size === 1 ? rows[0]?.product.unit : ''

  return (
    <>
      <PageHeader title="概览" subtitle={today} actions={actions} />

      <div className={styles.kpis}>
        <div className={styles.kpi}>
          <div className={styles.kpiLabel}>当前库存</div>
          <div className={styles.kpiValue}>
            {formatQty(data.totalQuantity)}
            {singleUnit && <span className={styles.kpiUnit}>{singleUnit}</span>}
          </div>
          <div className={`${styles.kpiSub} ${data.lowStockCount ? styles.warn : hasOpening ? styles.ok : ''}`}>
            {!hasOpening
              ? '未录入期初'
              : data.lowStockCount
                ? `${data.lowStockCount} 个商品低于预警值`
                : `${rows.length} 个商品 · 库存正常`}
          </div>
        </div>
        <div className={styles.kpi}>
          <div className={styles.kpiLabel}>今日入库</div>
          <div className={styles.kpiValue}>
            {formatQty(t.inQty)}
            {singleUnit && <span className={styles.kpiUnit}>{singleUnit}</span>}
          </div>
          <div className={styles.kpiSub}>¥{formatCents(t.inAmountCents)}</div>
        </div>
        <div className={styles.kpi}>
          <div className={styles.kpiLabel}>今日出库</div>
          <div className={styles.kpiValue}>
            {formatQty(t.outQty)}
            {singleUnit && <span className={styles.kpiUnit}>{singleUnit}</span>}
          </div>
          <div className={styles.kpiSub}>¥{formatCents(t.outAmountCents)}</div>
        </div>
        <div className={styles.kpi}>
          <div className={styles.kpiLabel}>库存成本</div>
          <div className={styles.kpiValue}>¥{formatCents(data.totalCostValueCents)}</div>
          <div className={styles.kpiSub}>
            {data.totalQuantity > 0
              ? `均价 ¥${formatCents(Math.round(data.totalCostValueCents / data.totalQuantity))}`
              : '—'}
          </div>
        </div>
      </div>

      <div className={styles.row}>
        <section className={`${styles.card} ${styles.chartCard}`}>
          <div className={styles.cardTitle}>
            近 14 天出入库
            <button type="button" className={styles.link} onClick={() => navigate('summary')}>
              查看汇总
            </button>
          </div>
          <TrendChart data={data.trend} fill />
        </section>
        <div className={styles.side}>
          <section className={styles.card}>
            <div className={styles.cardTitle}>
              最近单据
              <button
                type="button"
                className={styles.link}
                onClick={() => navigate('documents', { documents: { view: 'list' } })}
              >
                全部
              </button>
            </div>
            {data.recentDocuments.length === 0 ? (
              <p className={styles.muted}>暂无单据</p>
            ) : (
              <ul className={styles.recent}>
                {data.recentDocuments.slice(0, 4).map((d) => (
                  <li
                    key={d.id}
                    className={styles.recentItem}
                    onClick={() => navigate('documents', { documents: { view: 'detail', id: d.id } })}
                  >
                    <TypeBadge type={d.type} />
                    <div className={styles.recentMain}>
                      <div className={styles.recentNo}>{d.docNo}</div>
                      <div className={styles.recentMeta}>
                        {d.docDate}
                        {d.channelName ? ` · ${d.channelName}` : ''}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className={styles.recentQty}>{formatQty(d.totalQuantity)}</div>
                      {d.status !== 'confirmed' && <StatusBadge status={d.status} />}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className={styles.card}>
            <div className={styles.cardTitle}>低库存预警</div>
            {lowRows.length > 0 ? (
              lowRows.map((r) => (
                <div key={r.product.id} className={styles.alertRow}>
                  <Badge tone="danger">预警</Badge>
                  <span>
                    {r.product.name} 仅剩 <strong>{formatQty(r.stock.quantity)}</strong> {r.product.unit}，预警值{' '}
                    {formatQty(r.product.lowStockThreshold)}
                  </span>
                </div>
              ))
            ) : (
              <p className={styles.muted}>{hasOpening ? '暂无预警' : '录入期初后开始监控'}</p>
            )}
          </section>
        </div>
      </div>

      <div className={styles.sectionTitle}>库存状态</div>
      <div className={table.wrap}>
        <table className={`${table.table} ${table.clickable}`}>
          <thead>
            <tr>
              <th>商品</th>
              <th>SKU</th>
              <th className={table.num}>当前库存</th>
              <th className={table.num}>平均成本</th>
              <th className={table.num}>预警值</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const imgUrl = productImageUrl(r.product)
              return (
                <tr key={r.product.id} onClick={() => navigate('products')}>
                  <td>
                    <span className={styles.thumb}>
                      {imgUrl ? <img src={imgUrl} alt="" /> : <ImageIcon size={14} strokeWidth={1.5} />}
                    </span>
                    <span className={styles.accent}>{r.product.name}</span>
                  </td>
                  <td className={table.mono}>{r.product.defaultSku.code}</td>
                  <td className={table.num}>
                    {formatQty(r.stock.quantity)} {r.product.unit}
                  </td>
                  <td className={table.num}>{r.stock.quantity > 0 ? `¥${formatCents(r.stock.avgCostCents)}` : '—'}</td>
                  <td className={table.num}>
                    {formatQty(r.product.lowStockThreshold)} {r.product.unit}
                  </td>
                  <td>
                    {!r.hasOpening ? (
                      <Badge>未录入期初</Badge>
                    ) : r.lowStock ? (
                      <Badge tone="danger">库存预警</Badge>
                    ) : (
                      <Badge tone="success">库存正常</Badge>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}
