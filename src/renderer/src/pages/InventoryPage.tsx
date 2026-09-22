import type { ReactElement } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Download, Upload, ImageIcon } from 'lucide-react'
import type { MovementKind, MovementRow, Page, SalesChannel, StockRow } from '@shared/types'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { Dropdown } from '@/components/Dropdown'
import { SplitView } from '@/components/SplitView'
import { SkeletonTable } from '@/components/Skeleton'
import { TableEmpty } from '@/components/TableEmpty'
import { useToast } from '@/components/Toast'
import { ImportDialog } from '@/features/csv/ImportDialog'
import { productImageUrl } from '@/features/products/ProductImage'
import { unwrap, errorMessage } from '@/lib/api'
import { formatCents, formatOccurred, formatQty, shiftDate, signedQty, todayString } from '@/lib/format'
import { useNav } from '@/app/navigation'
import table from '@/components/Table.module.css'
import f from '@/components/Filters.module.css'
import styles from './InventoryPage.module.css'

const KIND_LABEL: Record<MovementKind, string> = {
  opening: '期初',
  inbound: '入库',
  outbound: '出库',
  adjustment: '调整',
  void: '作废冲回'
}
const KIND_TONE: Record<MovementKind, 'neutral' | 'in' | 'out' | 'warning'> = {
  opening: 'neutral',
  inbound: 'in',
  outbound: 'out',
  adjustment: 'warning',
  void: 'neutral'
}
const PAGE_SIZE = 50
const ALL = 0

export function InventoryPage(): ReactElement {
  const { navigate } = useNav()
  const toast = useToast()
  const [rows, setRows] = useState<StockRow[] | null>(null)
  const [selectedSku, setSelectedSku] = useState<number>(ALL)
  const [importOpen, setImportOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [kind, setKind] = useState<'' | MovementKind>('')
  const [channelId, setChannelId] = useState<number | ''>('')
  const [from, setFrom] = useState(() => shiftDate(todayString(), -30))
  const [to, setTo] = useState(todayString)
  const [docNo, setDocNo] = useState('')
  const [page, setPage] = useState(1)
  const [channels, setChannels] = useState<SalesChannel[]>([])
  const [data, setData] = useState<Page<MovementRow> | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    unwrap(window.ajuan.channels.list())
      .then(setChannels)
      .catch(() => {})
  }, [])

  const loadStock = useCallback(async () => {
    try {
      setRows(await unwrap(window.ajuan.inventory.listStock()))
    } catch (err) {
      setError(errorMessage(err))
    }
  }, [])
  useEffect(() => {
    void loadStock()
  }, [loadStock])

  const filter = {
    skuId: selectedSku || undefined,
    kind: kind || undefined,
    channelId: channelId || undefined,
    from: from || undefined,
    to: to || undefined,
    docNo: docNo || undefined
  }

  const load = useCallback(async () => {
    try {
      setData(await unwrap(window.ajuan.inventory.listMovements({ ...filter, page, pageSize: PAGE_SIZE })))
      setError(null)
    } catch (err) {
      setError(errorMessage(err))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSku, kind, channelId, from, to, docNo, page])

  useEffect(() => {
    const t = window.setTimeout(() => void load(), docNo ? 250 : 0)
    return () => window.clearTimeout(t)
  }, [load, docNo])

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1
  const resetPage =
    <T,>(setter: (v: T) => void) =>
    (v: T) => {
      setter(v)
      setPage(1)
    }

  async function exportCsv(): Promise<void> {
    setExporting(true)
    try {
      const p = await unwrap(window.ajuan.csv.exportMovements(filter))
      if (p) toast(`已导出到 ${p}`, 'success')
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setExporting(false)
    }
  }

  const totalQty = rows?.reduce((a, r) => a + r.stock.quantity, 0) ?? 0
  const totalCost = rows?.reduce((a, r) => a + r.stock.costValueCents, 0) ?? 0
  const selectedRow = rows?.find((r) => r.product.defaultSku.id === selectedSku) ?? null

  const master = (
    <div className={table.wrap}>
      <table className={`${table.table} ${table.clickable} ${table.fixed}`}>
        <colgroup>
          <col />
          <col style={{ width: 80 }} />
          <col style={{ width: 100 }} />
          <col style={{ width: 84 }} />
        </colgroup>
        <thead>
          <tr>
            <th>商品</th>
            <th className={table.num}>库存</th>
            <th className={table.num}>成本额</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          <tr onClick={() => resetPage(setSelectedSku)(ALL)} className={selectedSku === ALL ? table.selected : ''}>
            <td>
              <span className={styles.allLabel}>全部商品</span>
            </td>
            <td className={table.num}>{formatQty(totalQty)}</td>
            <td className={table.num}>¥{formatCents(totalCost)}</td>
            <td />
          </tr>
          {rows?.map((r) => {
            const url = productImageUrl(r.product)
            const sku = r.product.defaultSku.id
            return (
              <tr
                key={sku}
                onClick={() => resetPage(setSelectedSku)(sku)}
                className={selectedSku === sku ? table.selected : ''}
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
                <td className={table.num}>{formatQty(r.stock.quantity)}</td>
                <td className={table.num}>¥{formatCents(r.stock.costValueCents)}</td>
                <td>
                  {!r.product.isActive ? (
                    <Badge>停用</Badge>
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

  const detail = (
    <>
      <div className={styles.detailTitle}>
        {selectedRow ? (
          <>
            <span className={styles.detailName}>{selectedRow.product.name}</span>
            <span className={styles.detailMeta}>
              均价 {selectedRow.stock.quantity > 0 ? `¥${formatCents(selectedRow.stock.avgCostCents)}` : '—'} · 预警值{' '}
              {formatQty(selectedRow.product.lowStockThreshold)} {selectedRow.product.unit}
            </span>
          </>
        ) : (
          <span className={styles.detailName}>全部商品的流水</span>
        )}
      </div>
      <div className={f.bar}>
        <Dropdown
          compact
          aria-label="类型"
          value={kind}
          onChange={(v) => resetPage(setKind)(v)}
          options={[
            { value: '' as const, label: '全部类型' },
            ...(Object.keys(KIND_LABEL) as MovementKind[]).map((k) => ({ value: k, label: KIND_LABEL[k] }))
          ]}
        />
        <Dropdown
          compact
          aria-label="渠道"
          value={channelId === '' ? 0 : channelId}
          onChange={(v) => resetPage(setChannelId)(v === 0 ? '' : v)}
          options={[{ value: 0, label: '全部渠道' }, ...channels.map((c) => ({ value: c.id, label: c.name }))]}
        />
        <input
          className={`${f.input} ${f.date}`}
          type="date"
          value={from}
          onChange={(e) => resetPage(setFrom)(e.target.value)}
        />
        <span className={f.sep}>—</span>
        <input
          className={`${f.input} ${f.date}`}
          type="date"
          value={to}
          onChange={(e) => resetPage(setTo)(e.target.value)}
        />
        <input
          className={f.input}
          placeholder="搜索单号 / 订单号"
          value={docNo}
          onChange={(e) => resetPage(setDocNo)(e.target.value)}
        />
        <span className={f.spacer} />
        {data && <span className={f.count}>共 {formatQty(data.total)} 条</span>}
      </div>
      {error && <p className={styles.error}>读取失败：{error}</p>}
      {!data && !error && <SkeletonTable cols={6} />}
      {data && (
        <>
          <div className={table.wrap}>
            <table className={`${table.table} ${table.clickable} ${table.fixed}`}>
              <colgroup>
                <col style={{ width: 104 }} />
                <col style={{ width: 96 }} />
                {selectedSku === ALL && <col />}
                <col style={{ width: 150 }} />
                <col style={{ width: 72 }} />
                <col style={{ width: 84 }} />
                <col style={{ width: 72 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>时间</th>
                  <th>类型</th>
                  {selectedSku === ALL && <th>商品</th>}
                  <th>单号</th>
                  <th className={table.num}>数量</th>
                  <th className={table.num}>成本</th>
                  <th className={table.num}>结存</th>
                </tr>
              </thead>
              <tbody>
                {data.total === 0 && (
                  <TableEmpty
                    cols={selectedSku === ALL ? 7 : 6}
                    title="没有符合条件的流水"
                    description="调整筛选条件，或先确认一张入库 / 出库单"
                  />
                )}
                {data.rows.map((m) => (
                  <tr
                    key={m.id}
                    onClick={() => navigate('documents', { documents: { view: 'detail', id: m.documentId } })}
                    title={`${m.docNo}${m.channelName ? ` · ${m.channelName}` : ''}${m.externalOrderNo ? ` · ${m.externalOrderNo}` : ''}`}
                  >
                    <td className={table.mono}>{formatOccurred(m.occurredAt)}</td>
                    <td>
                      <Badge tone={KIND_TONE[m.kind]}>{KIND_LABEL[m.kind]}</Badge>
                    </td>
                    {selectedSku === ALL && <td>{m.productName}</td>}
                    <td className={table.mono}>{m.docNo}</td>
                    <td
                      className={table.num}
                      style={{ color: m.quantityDelta < 0 ? 'var(--color-danger)' : 'var(--color-success)' }}
                    >
                      {signedQty(m.quantityDelta)}
                    </td>
                    <td className={`${table.num} ${table.muted}`}>¥{formatCents(m.unitCostCents)}</td>
                    <td className={table.num}>{formatQty(m.quantityAfter)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className={f.pager}>
              <Button variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="上一页">
                <ChevronLeft size={16} />
              </Button>
              <span>
                {page} / {totalPages}
              </span>
              <Button
                variant="ghost"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                aria-label="下一页"
              >
                <ChevronRight size={16} />
              </Button>
            </div>
          )}
        </>
      )}
    </>
  )

  return (
    <>
      <PageHeader
        title="库存"
        actions={
          <>
            <Button onClick={() => setImportOpen(true)}>
              <Upload size={16} /> 导入 CSV
            </Button>
            <Button onClick={exportCsv} disabled={exporting || !data || data.total === 0}>
              <Download size={16} /> {exporting ? '导出中…' : '导出流水'}
            </Button>
          </>
        }
      />
      {!rows ? <SkeletonTable cols={4} /> : <SplitView master={master} detail={detail} />}
      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => {
          void loadStock()
          void load()
        }}
      />
    </>
  )
}
