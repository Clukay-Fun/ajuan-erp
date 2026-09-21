import type { ReactElement } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { BarChart3, Download } from 'lucide-react'
import type { Summary } from '@shared/types'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/Button'
import { useToast } from '@/components/Toast'
import { unwrap, errorMessage } from '@/lib/api'
import { formatCents, formatQty, shiftDate, todayString } from '@/lib/format'
import table from '@/components/Table.module.css'
import f from '@/components/Filters.module.css'
import styles from './SummaryPage.module.css'

type Preset = 'today' | '7d' | '30d' | 'month' | null

function presetRange(p: Exclude<Preset, null>): { from: string; to: string } {
  const to = todayString()
  switch (p) {
    case 'today': return { from: to, to }
    case '7d': return { from: shiftDate(to, -6), to }
    case '30d': return { from: shiftDate(to, -29), to }
    case 'month': return { from: `${to.slice(0, 7)}-01`, to }
  }
}

export function SummaryPage(): ReactElement {
  const toast = useToast()
  const [exporting, setExporting] = useState(false)
  const [preset, setPreset] = useState<Preset>('30d')
  const [range, setRange] = useState(() => presetRange('30d'))
  const [data, setData] = useState<Summary | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!range.from || !range.to) return
    try {
      setData(await unwrap(window.ajuan.summary.get(range)))
      setError(null)
    } catch (err) {
      setError(errorMessage(err))
    }
  }, [range])
  useEffect(() => {
    void load()
  }, [load])

  const pick = (p: Exclude<Preset, null>): void => { setPreset(p); setRange(presetRange(p)) }
  const custom = (patch: Partial<typeof range>): void => { setPreset(null); setRange((r) => ({ ...r, ...patch })) }
  const gross = data ? data.outAmountCents - data.outCostCents : 0

  async function exportCsv(): Promise<void> {
    setExporting(true)
    try {
      const p = await unwrap(window.ajuan.csv.exportSummary(range))
      if (p) toast(`已导出到 ${p}`, 'success')
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setExporting(false)
    }
  }

  return (
    <>
      <PageHeader
        title="汇总"
        subtitle="按日期范围统计已生效的出入库数量与金额"
        actions={<Button onClick={exportCsv} disabled={exporting || !data || data.daily.length === 0}><Download size={16} /> {exporting ? '导出中…' : '导出 CSV'}</Button>}
      />
      <div className={styles.range}>
        <input className={`${f.input} ${f.date}`} type="date" value={range.from} onChange={(e) => custom({ from: e.target.value })} />
        <span className={f.sep}>—</span>
        <input className={`${f.input} ${f.date}`} type="date" value={range.to} onChange={(e) => custom({ to: e.target.value })} />
        <div className={styles.presets}>
          {([['today', '今天'], ['7d', '近 7 天'], ['30d', '近 30 天'], ['month', '本月']] as const).map(([k, label]) => (
            <button key={k} type="button" className={styles.preset} aria-pressed={preset === k} onClick={() => pick(k)}>{label}</button>
          ))}
        </div>
      </div>

      {error && <p className={styles.error}>{error}</p>}
      {data && (
        <>
          <div className={styles.cards}>
            <div className={styles.card}>
              <div className={styles.label}>入库</div>
              <div className={styles.value}>{formatQty(data.inQty)}</div>
              <div className={styles.sub}>¥{formatCents(data.inAmountCents)} · {data.inDocCount} 张单</div>
            </div>
            <div className={styles.card}>
              <div className={styles.label}>出库</div>
              <div className={styles.value}>{formatQty(data.outQty)}</div>
              <div className={styles.sub}>¥{formatCents(data.outAmountCents)} · {data.outDocCount} 张单</div>
            </div>
            <div className={styles.card}>
              <div className={styles.label}>出库毛利（售价 − 成本快照）</div>
              <div className={styles.value} style={{ color: gross < 0 ? 'var(--color-danger)' : undefined }}>¥{formatCents(gross)}</div>
              <div className={styles.sub}>出库成本 ¥{formatCents(data.outCostCents)}</div>
            </div>
          </div>

          <div className={styles.sectionTitle}>逐日明细</div>
          {data.daily.length === 0 ? (
            <EmptyState icon={BarChart3} title="该区间没有已生效的出入库" />
          ) : (
            <div className={table.wrap}>
              <table className={table.table}>
                <thead>
                  <tr>
                    <th>日期</th>
                    <th className={table.num}>入库数量</th>
                    <th className={table.num}>入库金额</th>
                    <th className={table.num}>出库数量</th>
                    <th className={table.num}>出库金额</th>
                  </tr>
                </thead>
                <tbody>
                  {data.daily.map((d) => (
                    <tr key={d.date}>
                      <td className={table.mono}>{d.date}</td>
                      <td className={table.num}>{d.inQty ? formatQty(d.inQty) : <span className={table.muted}>—</span>}</td>
                      <td className={table.num}>{d.inQty ? `¥${formatCents(d.inAmountCents)}` : <span className={table.muted}>—</span>}</td>
                      <td className={table.num}>{d.outQty ? formatQty(d.outQty) : <span className={table.muted}>—</span>}</td>
                      <td className={table.num}>{d.outQty ? `¥${formatCents(d.outAmountCents)}` : <span className={table.muted}>—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  )
}
