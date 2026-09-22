import type { ReactElement } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { PackagePlus, PackageMinus, ImageIcon } from 'lucide-react'
import type { Overview } from '@shared/types'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/Button'
import { Badge, StatusBadge, TypeBadge } from '@/components/Badge'
import { unwrap, errorMessage } from '@/lib/api'
import { formatCents, formatQty } from '@/lib/format'
import { useNav } from '@/app/navigation'
import { TrendChart } from '@/features/overview/TrendChart'
import { SkeletonCard } from '@/components/Skeleton'
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
      <Button variant="primary" onClick={() => navigate('documents', { documents: { view: 'new', type: 'inbound' } })}><PackagePlus size={16} /> 入库</Button>
      <Button variant="primary" onClick={() => navigate('documents', { documents: { view: 'new', type: 'outbound' } })}><PackageMinus size={16} /> 出库</Button>
    </>
  )

  if (error) return <><PageHeader title="概览" subtitle={today} /><p className={styles.error}>读取失败：{error}</p></>
  if (!data)
    return (
      <>
        <PageHeader title="概览" subtitle={today} actions={actions} />
        <div className={styles.kpis}>{[0, 1, 2, 3].map((i) => <SkeletonCard key={i} lines={1} />)}</div>
        <div className={styles.row}><SkeletonCard lines={5} /><SkeletonCard lines={5} /></div>
      </>
    )

  const { product, stock, today: t, lowStock, hasOpening } = data
  const unit = product.unit

  return (
    <>
      <PageHeader title="概览" subtitle={today} actions={actions} />

      {!hasOpening && (
        <div className={styles.setup}>
          <span>还没有期初库存。先录入当前实际库存，库存账才有起点。</span>
          <Button variant="primary" onClick={() => navigate('products')}>去录入期初库存</Button>
        </div>
      )}

      <div className={styles.kpis}>
        <div className={styles.kpi}>
          <div className={styles.kpiLabel}>当前库存</div>
          <div className={styles.kpiValue}>{formatQty(stock.quantity)}</div>
          <div className={`${styles.kpiSub} ${lowStock ? styles.warn : styles.ok}`}>
            {!hasOpening ? '未录入期初' : lowStock ? `低于预警值 ${formatQty(product.lowStockThreshold)} ${unit}` : '库存正常'}
          </div>
        </div>
        <div className={styles.kpi}>
          <div className={styles.kpiLabel}>今日入库</div>
          <div className={styles.kpiValue}>{formatQty(t.inQty)}</div>
          <div className={styles.kpiSub}>¥{formatCents(t.inAmountCents)}</div>
        </div>
        <div className={styles.kpi}>
          <div className={styles.kpiLabel}>今日出库</div>
          <div className={styles.kpiValue}>{formatQty(t.outQty)}</div>
          <div className={styles.kpiSub}>¥{formatCents(t.outAmountCents)}</div>
        </div>
        <div className={styles.kpi}>
          <div className={styles.kpiLabel}>库存成本</div>
          <div className={styles.kpiValue}>¥{formatCents(stock.costValueCents)}</div>
          <div className={styles.kpiSub}>{stock.quantity > 0 ? `均价 ¥${formatCents(stock.avgCostCents)}` : '—'}</div>
        </div>
      </div>

      <div className={styles.row}>
        <section className={styles.card}>
          <div className={styles.cardTitle}>
            近 14 天出入库
            <button type="button" className={styles.link} onClick={() => navigate('summary')}>查看汇总</button>
          </div>
          <TrendChart data={data.trend} />
        </section>
        <section className={styles.card}>
          <div className={styles.cardTitle}>
            最近单据
            <button type="button" className={styles.link} onClick={() => navigate('documents', { documents: { view: 'list' } })}>全部</button>
          </div>
          {data.recentDocuments.length === 0 ? (
            <p className={styles.muted}>还没有单据</p>
          ) : (
            <ul className={styles.recent}>
              {data.recentDocuments.map((d) => (
                <li key={d.id} className={styles.recentItem} onClick={() => navigate('documents', { documents: { view: 'detail', id: d.id } })}>
                  <TypeBadge type={d.type} />
                  <div className={styles.recentMain}>
                    <div className={styles.recentNo}>{d.docNo}</div>
                    <div className={styles.recentMeta}>{d.docDate}{d.channelName ? ` · ${d.channelName}` : ''}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className={styles.recentQty}>{formatQty(d.totalQuantity)} {unit}</div>
                    {d.status !== 'confirmed' ? <StatusBadge status={d.status} /> : <div className={styles.recentMeta}>¥{formatCents(d.totalAmountCents)}</div>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className={styles.card}>
        <div className={styles.cardTitle}>库存状态</div>
        <div className={styles.status}>
          <div className={styles.thumb}><ImageIcon size={20} strokeWidth={1.5} /></div>
          <div className={styles.statusMain}>
            <span className={styles.statusName}>{product.name}</span>
            <span className={styles.statusCode}>{product.code}</span>
          </div>
          <div className={styles.statusQty}>{formatQty(stock.quantity)} {unit}</div>
          {hasOpening ? (lowStock ? <Badge tone="danger">库存预警</Badge> : <Badge tone="success">库存正常</Badge>) : <Badge>未录入期初</Badge>}
        </div>
      </section>
    </>
  )
}
