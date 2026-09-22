import type { Db } from '../db/connection'
import { e4ToCents } from '@shared/money'
import type { DailyFlow, Overview, Summary, SummaryRange } from '@shared/types'
import { ServiceError } from './errors'
import { getProduct } from './products'
import { getStock } from './inventory'
import { listDocuments } from './documents'
import { getOpening } from './opening'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function localToday(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
}

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`)
  d.setDate(d.getDate() + days)
  return localToday(d)
}

interface DailyRow {
  date: string
  type: 'inbound' | 'outbound'
  qty: number
  amount: number
}

/** 按已生效单据的单据日期汇总（作废单不计）。 */
function dailyFlows(db: Db, from: string, to: string): Map<string, DailyFlow> {
  const rows = db
    .prepare(
      `SELECT d.doc_date AS date, d.type, SUM(i.quantity) AS qty, SUM(i.quantity * i.unit_price_cents) AS amount
       FROM documents d JOIN document_items i ON i.document_id = d.id
       WHERE d.status = 'confirmed' AND d.type IN ('inbound', 'outbound') AND d.doc_date BETWEEN ? AND ?
       GROUP BY d.doc_date, d.type`
    )
    .all(from, to) as unknown as DailyRow[]
  const map = new Map<string, DailyFlow>()
  for (const r of rows) {
    const day = map.get(r.date) ?? { date: r.date, inQty: 0, inAmountCents: 0, outQty: 0, outAmountCents: 0 }
    if (r.type === 'inbound') {
      day.inQty += Number(r.qty)
      day.inAmountCents += Number(r.amount)
    } else {
      day.outQty += Number(r.qty)
      day.outAmountCents += Number(r.amount)
    }
    map.set(r.date, day)
  }
  return map
}

export function getOverview(db: Db, today = localToday()): Overview {
  const product = getProduct(db)
  const stock = getStock(db, product.defaultSku.id)
  const from = shiftDate(today, -13)
  const flows = dailyFlows(db, from, today)
  const trend: DailyFlow[] = []
  for (let i = 0; i < 14; i++) {
    const date = shiftDate(from, i)
    trend.push(flows.get(date) ?? { date, inQty: 0, inAmountCents: 0, outQty: 0, outAmountCents: 0 })
  }
  const t = flows.get(today)
  const hasOpening = getOpening(db, product.defaultSku.id) !== null
  return {
    product,
    stock,
    hasOpening,
    lowStock: hasOpening && stock.quantity <= product.lowStockThreshold,
    today: {
      inQty: t?.inQty ?? 0,
      inAmountCents: t?.inAmountCents ?? 0,
      outQty: t?.outQty ?? 0,
      outAmountCents: t?.outAmountCents ?? 0
    },
    trend,
    recentDocuments: listDocuments(db, { limit: 6 })
  }
}

export function getSummary(db: Db, range: SummaryRange): Summary {
  if (!DATE_RE.test(range.from) || !DATE_RE.test(range.to))
    throw new ServiceError('VALIDATION', '日期格式应为 YYYY-MM-DD')
  if (range.from > range.to) throw new ServiceError('VALIDATION', '开始日期不能晚于结束日期')
  const flows = dailyFlows(db, range.from, range.to)
  const daily = [...flows.values()].sort((a, b) => (a.date < b.date ? 1 : -1))
  const counts = db
    .prepare(
      `SELECT type, COUNT(*) AS c FROM documents
       WHERE status = 'confirmed' AND type IN ('inbound', 'outbound') AND doc_date BETWEEN ? AND ? GROUP BY type`
    )
    .all(range.from, range.to) as unknown as { type: 'inbound' | 'outbound'; c: number }[]
  const cost = db
    .prepare(
      `SELECT COALESCE(SUM(i.quantity * i.cost_snapshot_e4), 0) AS v FROM documents d JOIN document_items i ON i.document_id = d.id
       WHERE d.status = 'confirmed' AND d.type = 'outbound' AND d.doc_date BETWEEN ? AND ?`
    )
    .get(range.from, range.to) as { v: number | bigint }
  return {
    range,
    inQty: daily.reduce((a, d) => a + d.inQty, 0),
    inAmountCents: daily.reduce((a, d) => a + d.inAmountCents, 0),
    outQty: daily.reduce((a, d) => a + d.outQty, 0),
    outAmountCents: daily.reduce((a, d) => a + d.outAmountCents, 0),
    outCostCents: e4ToCents(BigInt(cost.v)),
    inDocCount: counts.find((c) => c.type === 'inbound')?.c ?? 0,
    outDocCount: counts.find((c) => c.type === 'outbound')?.c ?? 0,
    daily
  }
}
