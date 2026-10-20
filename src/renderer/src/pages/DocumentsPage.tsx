/**
 * 描述: 单据列表页 (DocumentsPage)
 * 主要功能:
 *   - 页头「开单」分体按钮与「更多」菜单（导入 CSV、库存调整）
 *   - 筛选：类型、状态（草稿带计数）、日期范围、搜索（单号 / 订单号 / 渠道 / 备注）
 *   - 点击一行打开单据弹窗；已作废整行置灰；出库已生效显示毛利，负数标红
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MoreVertical, Upload, Scale, Search } from 'lucide-react'
import type { DocumentStatus, DocumentSummary, DocumentType } from '@shared/types'
import {
  DateRangePicker,
  DocStatusBadge,
  DocTypeBadge,
  IconButton,
  Input,
  Menu,
  SegmentedControl,
  TableEmpty,
  useDrawer,
  type DateRange
} from '@/components/ui'
import { useNav } from '@/app/navigation'
import { useEntityDrawers } from '@/app/entityDrawers'
import { unwrap, errorMessage } from '@/lib/api'
import { useDataChanged } from '@/lib/dataEvents'
import { formatCents, formatQty } from '@/lib/format'
import { NewDocumentButton } from '@/features/documents/NewDocumentButton'
import styles from './DocumentsPage.module.css'

type TypeFilter = 'all' | DocumentType
type StatusFilter = 'all' | DocumentStatus

const TYPE_OPTIONS: { value: TypeFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'inbound', label: '入库' },
  { value: 'outbound', label: '出库' },
  { value: 'adjustment', label: '调整' },
  { value: 'opening', label: '期初' }
]

export function DocumentsPage(): React.JSX.Element {
  const { location } = useNav()
  const initial = location.params.documents ?? {}
  const { currentDrawer } = useDrawer()
  const { openDocument, openAdjustment, openImport } = useEntityDrawers()
  const searchRef = useRef<HTMLInputElement>(null)

  const [type, setType] = useState<TypeFilter>(initial.type ?? 'all')
  const [status, setStatus] = useState<StatusFilter>(initial.status ?? 'all')
  const [range, setRange] = useState<DateRange>({ from: initial.from ?? '', to: initial.to ?? '' })
  const [query, setQuery] = useState('')
  const [docs, setDocs] = useState<DocumentSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  // 拉全部单据（上限 1000），类型 / 状态 / 日期 / 搜索都在本地过滤：店主一个人用，数据量很小
  const load = useCallback(async () => {
    try {
      setDocs(await unwrap(window.ajuan.documents.list({ limit: 1000 })))
      setError(null)
    } catch (err) {
      setError(errorMessage(err))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])
  useDataChanged(() => void load())

  // ⌘F 聚焦搜索框
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const draftCount = useMemo(() => docs?.filter((d) => d.status === 'draft').length ?? 0, [docs])

  const filtered = useMemo(() => {
    if (!docs) return []
    const q = query.trim().toLowerCase()
    return docs.filter((d) => {
      if (type !== 'all' && d.type !== type) return false
      if (status !== 'all' && d.status !== status) return false
      if (range.from && d.docDate < range.from) return false
      if (range.to && d.docDate > range.to) return false
      if (!q) return true
      return [d.docNo, d.externalOrderNo, d.channelName ?? '', d.note].some((v) => v.toLowerCase().includes(q))
    })
  }, [docs, type, status, range, query])

  return (
    <div className={styles.container}>
      <header className={styles.headerRow}>
        <h1 className={styles.headerTitle}>单据</h1>
        <div className={styles.headerActions}>
          <NewDocumentButton />
          <Menu
            align="end"
            trigger={<IconButton label="更多" icon={<MoreVertical size={16} />} variant="secondary" />}
            items={[
              { key: 'import', label: '导入 CSV', icon: <Upload size={14} />, onClick: openImport },
              { key: 'adjust', label: '库存调整', icon: <Scale size={14} />, onClick: () => openAdjustment() }
            ]}
          />
        </div>
      </header>

      <main className={styles.mainPanel}>
        <div className={styles.toolbar}>
          <SegmentedControl options={TYPE_OPTIONS} value={type} onChange={setType} />
          <SegmentedControl
            options={[
              { value: 'all', label: '全部' },
              { value: 'draft', label: '草稿', count: draftCount || undefined },
              { value: 'confirmed', label: '已生效' },
              { value: 'voided', label: '已作废' }
            ]}
            value={status}
            onChange={(v) => setStatus(v as StatusFilter)}
          />
          <DateRangePicker value={range} onChange={setRange} />
          <div className={styles.search}>
            <Search size={14} className={styles.searchIcon} />
            <Input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="单号 / 订单号 / 渠道 / 备注"
            />
          </div>
          <span className={styles.count}>共 {filtered.length} 张</span>
        </div>

        {error && <p className={styles.error}>读取失败：{error}</p>}

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.colDate}>日期</th>
                <th className={styles.colType}>类型</th>
                <th className={styles.colNo}>单号</th>
                <th className={styles.colStatus}>状态</th>
                <th>渠道 · 订单号</th>
                <th className={`${styles.num} ${styles.colQty}`}>数量</th>
                <th className={`${styles.num} ${styles.colMoney}`}>金额</th>
                <th className={`${styles.num} ${styles.colMoney}`}>毛利</th>
                <th className={styles.colNote}>备注</th>
              </tr>
            </thead>
            <tbody>
              {!docs ? (
                <TableEmpty cols={9} title="正在读取单据…" />
              ) : filtered.length === 0 ? (
                <TableEmpty cols={9} title="没有符合条件的单据" description="换个筛选条件，或点右上角「开单」" />
              ) : (
                filtered.map((d) => {
                  const profit =
                    d.type === 'outbound' && d.status === 'confirmed' && d.totalCostCents !== null
                      ? d.totalAmountCents - d.totalCostCents
                      : null
                  const channel = [d.channelName, d.externalOrderNo].filter(Boolean).join(' · ')
                  const selected = currentDrawer?.id === `document-${d.id}`
                  return (
                    <tr
                      key={d.id}
                      className={`${styles.row} ${d.status === 'voided' ? styles.voided : ''} ${selected ? styles.selected : ''}`}
                      onClick={() => openDocument(d.id)}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') openDocument(d.id)
                      }}
                    >
                      <td className={styles.date}>{d.docDate}</td>
                      <td>
                        <DocTypeBadge type={d.type} />
                      </td>
                      <td className={styles.docNo}>{d.docNo}</td>
                      <td>
                        <DocStatusBadge status={d.status} />
                      </td>
                      <td className={styles.secondary} title={channel}>
                        {channel || '—'}
                      </td>
                      <td className={styles.num}>{formatQty(d.totalQuantity)}</td>
                      <td className={styles.num}>¥{formatCents(d.totalAmountCents)}</td>
                      <td className={`${styles.num} ${profit !== null && profit < 0 ? styles.negative : ''}`}>
                        {profit === null ? '—' : `¥${formatCents(profit)}`}
                      </td>
                      <td className={styles.secondary} title={d.note}>
                        {d.note || '—'}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  )
}
