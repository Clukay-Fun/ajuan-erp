import type { ReactElement } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { PackagePlus, PackageMinus, ImageIcon, Download } from 'lucide-react'
import type { Overview, Product, Summary } from '@shared/types'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/Button'
import { Badge, StatusBadge, TypeBadge } from '@/components/Badge'
import { Dropdown } from '@/components/Dropdown'
import { SkeletonCard } from '@/components/Skeleton'
import { TableEmpty } from '@/components/TableEmpty'
import { useToast } from '@/components/Toast'
import { unwrap, errorMessage } from '@/lib/api'
import { formatCents, formatQty, shiftDate, todayString } from '@/lib/format'
import { useNav } from '@/app/navigation'
import { TrendChart } from '@/features/overview/TrendChart'
import { productImageUrl } from '@/features/products/ProductImage'
import table from '@/components/Table.module.css'
import f from '@/components/Filters.module.css'
import seg from '@/components/Segmented.module.css'
import styles from './OverviewPage.module.css'

type Preset = 'today' | '7d' | '30d' | 'month' | 'lastMonth' | null

function presetRange(p: Exclude<Preset, null>): { from: string; to: string } {
  const to = todayString()
  switch (p) {
    case 'today':
      return { from: to, to }
    case '7d':
      return { from: shiftDate(to, -6), to }
    case '30d':
      return { from: shiftDate(to, -29), to }
    case 'month':
      return { from: `${to.slice(0, 7)}-01`, to }
    case 'lastMonth': {
      const first = `${to.slice(0, 7)}-01`
      const lastEnd = shiftDate(first, -1)
      return { from: `${lastEnd.slice(0, 7)}-01`, to: lastEnd }
    }
  }
}

const PRESETS: [Exclude<Preset, null>, string][] = [
  ['today', '今天'],
  ['7d', '近 7 天'],
  ['30d', '近 30 天'],
  ['month', '本月'],
  ['lastMonth', '上月']
]

export function OverviewPage(): ReactElement {
  const { navigate } = useNav()
  const toast = useToast()
  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [skuId, setSkuId] = useState<number>(0)
  const [preset, setPreset] = useState<Preset>('30d')
  const [range, setRange] = useState(() => presetRange('30d'))
  const [summary, setSummary] = useState<Summary | null>(null)
  const [exporting, setExporting] = useState(false)

  const load = useCallback(async () => {
    try {
      const [o, ps] = await Promise.all([unwrap(window.ajuan.overview.get()), unwrap(window.ajuan.products.list())])
      setData(o)
      setProducts(ps.filter((p) => p.isActive))
      setError(null)
    } catch (err) {
      setError(errorMessage(err))
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!range.from || !range.to) return
    unwrap(window.ajuan.summary.get({ ...range, skuId: skuId || undefined }))
      .then(setSummary)
      .catch((err: unknown) => toast(errorMessage(err), 'error'))
  }, [range, skuId, toast])

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

  const { rows, hasOpening } = data
  const lowRows = rows.filter((r) => r.lowStock)
  const singleUnit = new Set(rows.map((r) => r.product.unit)).size === 1 ? rows[0]?.product.unit : ''
  const gross = summary ? summary.outAmountCents - summary.outCostCents : 0

  const pick = (p: Exclude<Preset, null>): void => {
    setPreset(p)
    setRange(presetRange(p))
  }
  const custom = (patch: Partial<typeof range>): void => {
    setPreset(null)
    setRange((r) => ({ ...r, ...patch }))
  }

  // 图表按区间逐日补齐；超过 62 天只画最后 62 天
  const chartDays = (() => {
    if (!summary) return []
    const byDate = new Map(summary.daily.map((d) => [d.date, d]))
    const days: typeof summary.daily = []
    let from = summary.range.from
    const span = Math.round((Date.parse(summary.range.to) - Date.parse(from)) / 86400000)
    if (span > 61) from = shiftDate(summary.range.to, -61)
    for (let d = from; d <= summary.range.to; d = shiftDate(d, 1)) {
      days.push(byDate.get(d) ?? { date: d, inQty: 0, inAmountCents: 0, outQty: 0, outAmountCents: 0, outCostCents: 0 })
    }
    return days
  })()

  async function exportCsv(): Promise<void> {
    setExporting(true)
    try {
      const p = await unwrap(window.ajuan.csv.exportSummary({ ...range, skuId: skuId || undefined }))
      if (p) toast(`已导出到 ${p}`, 'success')
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setExporting(false)
    }
  }

  return (
    <>
      <PageHeader title="概览" subtitle={today} actions={actions} />

      {/* 当前状态 */}
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
          <div className={styles.kpiLabel}>库存成本</div>
          <div className={styles.kpiValue}>¥{formatCents(data.totalCostValueCents)}</div>
          <div className={styles.kpiSub}>
            {data.totalQuantity > 0
              ? `均价 ¥${formatCents(Math.round(data.totalCostValueCents / data.totalQuantity))}`
              : '—'}
          </div>
        </div>
        <div className={styles.kpi}>
          <div className={styles.kpiLabel}>今日入库</div>
          <div className={styles.kpiValue}>
            {formatQty(data.today.inQty)}
            {singleUnit && <span className={styles.kpiUnit}>{singleUnit}</span>}
          </div>
          <div className={styles.kpiSub}>¥{formatCents(data.today.inAmountCents)}</div>
        </div>
        <div className={styles.kpi}>
          <div className={styles.kpiLabel}>今日出库</div>
          <div className={styles.kpiValue}>
            {formatQty(data.today.outQty)}
            {singleUnit && <span className={styles.kpiUnit}>{singleUnit}</span>}
          </div>
          <div className={styles.kpiSub}>¥{formatCents(data.today.outAmountCents)}</div>
        </div>
      </div>

      {/* 区间汇总 */}
      <div className={styles.sectionTitle}>出入库汇总</div>
      <div className={f.bar}>
        <Dropdown
          compact
          aria-label="商品"
          value={skuId}
          onChange={setSkuId}
          options={[
            { value: 0, label: '全部商品' },
            ...products.map((p) => ({ value: p.defaultSku.id, label: p.name, hint: p.code }))
          ]}
        />
        <input
          className={`${f.input} ${f.date}`}
          type="date"
          value={range.from}
          onChange={(e) => custom({ from: e.target.value })}
        />
        <span className={f.sep}>—</span>
        <input
          className={`${f.input} ${f.date}`}
          type="date"
          value={range.to}
          onChange={(e) => custom({ to: e.target.value })}
        />
        <div className={seg.group} role="group" aria-label="快捷区间">
          {PRESETS.map(([k, label]) => (
            <button key={k} type="button" className={seg.item} aria-pressed={preset === k} onClick={() => pick(k)}>
              {label}
            </button>
          ))}
        </div>
        <div className={f.actions}>
          <Button onClick={exportCsv} disabled={exporting || !summary || summary.daily.length === 0}>
            <Download size={16} /> {exporting ? '导出中…' : '导出 CSV'}
          </Button>
        </div>
      </div>

      <div className={styles.kpis3}>
        <div className={styles.kpi}>
          <div className={styles.kpiLabel}>入库</div>
          <div className={styles.kpiValue}>{summary ? formatQty(summary.inQty) : '—'}</div>
          <div className={styles.kpiSub}>
            {summary ? `¥${formatCents(summary.inAmountCents)} · ${summary.inDocCount} 张单` : ''}
          </div>
        </div>
        <div className={styles.kpi}>
          <div className={styles.kpiLabel}>出库</div>
          <div className={styles.kpiValue}>{summary ? formatQty(summary.outQty) : '—'}</div>
          <div className={styles.kpiSub}>
            {summary ? `¥${formatCents(summary.outAmountCents)} · ${summary.outDocCount} 张单` : ''}
          </div>
        </div>
        <div className={styles.kpi}>
          <div className={styles.kpiLabel}>出库毛利（售价 − 成本快照）</div>
          <div className={styles.kpiValue} style={{ color: gross < 0 ? 'var(--color-danger)' : 'var(--chart-profit)' }}>
            {summary ? `¥${formatCents(gross)}` : '—'}
          </div>
          <div className={styles.kpiSub}>{summary ? `出库成本 ¥${formatCents(summary.outCostCents)}` : ''}</div>
        </div>
      </div>

      <div className={styles.row}>
        <section className={`${styles.card} ${styles.chartCard}`}>
          <div className={styles.cardTitle}>逐日出入库</div>
          <TrendChart data={chartDays} fill />
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

      <div className={styles.sectionTitle}>逐日明细</div>
      <div className={table.wrap} style={{ marginBottom: 'var(--space-6)' }}>
        <table className={table.table}>
          <thead>
            <tr>
              <th>日期</th>
              <th className={table.num}>入库数量</th>
              <th className={table.num}>入库金额</th>
              <th className={table.num}>出库数量</th>
              <th className={table.num}>出库金额</th>
              <th className={table.num}>毛利</th>
            </tr>
          </thead>
          <tbody>
            {summary && summary.daily.length === 0 && (
              <TableEmpty cols={6} title="该区间没有已生效的出入库" description="确认入库 / 出库单后，这里按天汇总" />
            )}
            {summary?.daily.map((d) => (
              <tr key={d.date}>
                <td className={table.mono}>{d.date}</td>
                <td className={table.num}>{d.inQty ? formatQty(d.inQty) : <span className={table.muted}>—</span>}</td>
                <td className={table.num}>
                  {d.inQty ? `¥${formatCents(d.inAmountCents)}` : <span className={table.muted}>—</span>}
                </td>
                <td className={table.num}>{d.outQty ? formatQty(d.outQty) : <span className={table.muted}>—</span>}</td>
                <td className={table.num}>
                  {d.outQty ? `¥${formatCents(d.outAmountCents)}` : <span className={table.muted}>—</span>}
                </td>
                <td className={table.num}>
                  {d.outQty ? (
                    `¥${formatCents(d.outAmountCents - d.outCostCents)}`
                  ) : (
                    <span className={table.muted}>—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
