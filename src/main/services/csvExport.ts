import { stringify } from 'csv-stringify/sync'
import type { Db } from '../db/connection'
import { formatCents } from '@shared/money'
import type { MovementFilter, SummaryRange } from '@shared/types'
import { listMovements } from './movements'
import { getDocument } from './documents'
import { getSummary } from './reports'

/** 带 BOM 的 UTF-8，Excel 双击打开中文不乱码。 */
export const CSV_BOM = '﻿'

const KIND_LABEL = { opening: '期初', inbound: '入库', outbound: '出库', adjustment: '调整', void: '作废冲回' } as const
const money = (cents: number | null): string => (cents === null ? '' : formatCents(cents).replaceAll(',', ''))

export function buildMovementsCsv(db: Db, filter: MovementFilter): string {
  const { rows } = listMovements(db, { ...filter, page: 1, pageSize: 500 })
  // 分页拉全：导出不受页面分页限制
  const all = [...rows]
  const total = listMovements(db, { ...filter, page: 1, pageSize: 1 }).total
  for (let page = 2; all.length < total; page++) {
    const next = listMovements(db, { ...filter, page, pageSize: 500 }).rows
    if (next.length === 0) break
    all.push(...next)
  }
  const header = ['时间', '类型', '单号', '渠道', '外部订单号', '数量变动', '单价', '结转成本', '结存']
  const lines = all.map((m) => [
    m.occurredAt.replace('T', ' '),
    KIND_LABEL[m.kind],
    m.docNo,
    m.channelName ?? '',
    m.externalOrderNo,
    String(m.quantityDelta),
    money(m.unitPriceCents),
    money(m.unitCostCents),
    String(m.quantityAfter)
  ])
  return CSV_BOM + stringify([header, ...lines])
}

export function buildSummaryCsv(db: Db, range: SummaryRange): string {
  const s = getSummary(db, range)
  const header = ['日期', '入库数量', '入库金额', '出库数量', '出库金额']
  const lines = s.daily.map((d) => [
    d.date,
    String(d.inQty),
    money(d.inAmountCents),
    String(d.outQty),
    money(d.outAmountCents)
  ])
  const totalRow = [
    `合计 ${range.from} ~ ${range.to}`,
    String(s.inQty),
    money(s.inAmountCents),
    String(s.outQty),
    money(s.outAmountCents)
  ]
  return CSV_BOM + stringify([header, ...lines, totalRow])
}

export function buildDocumentCsv(db: Db, id: number): { fileName: string; content: string } {
  const d = getDocument(db, id)
  const TYPE = { inbound: '入库', outbound: '出库', opening: '期初', adjustment: '调整' } as const
  const STATUS = { draft: '草稿', confirmed: '已生效', voided: '已作废' } as const
  const head: string[][] = [
    ['单号', d.docNo],
    ['类型', TYPE[d.type]],
    ['状态', STATUS[d.status]],
    ['日期', d.docDate],
    ...(d.type === 'outbound'
      ? [
          ['销售渠道', d.channelName ?? ''],
          ['外部订单号', d.externalOrderNo]
        ]
      : []),
    ...(d.type === 'adjustment' ? [['调整方向', d.adjustDirection === 'increase' ? '盘盈增加' : '盘亏减少']] : []),
    [d.type === 'adjustment' ? '调整原因' : '备注', d.note],
    ['合计数量', String(d.totalQuantity)],
    ['合计金额', money(d.totalAmountCents)],
    ...(d.status === 'voided' ? [['作废原因', d.voidReason ?? '']] : []),
    []
  ]
  const itemsHeader = ['行号', '商品', 'SKU', '数量', d.type === 'outbound' ? '售价' : '单价', '成本快照', '小计']
  const items = d.items.map((it) => [
    String(it.lineNo),
    it.productName,
    it.skuCode,
    String(it.quantity),
    money(it.unitPriceCents),
    money(it.costSnapshotCents),
    money(it.quantity * it.unitPriceCents)
  ])
  return { fileName: `${d.docNo}.csv`, content: CSV_BOM + stringify([...head, itemsHeader, ...items]) }
}
