export { formatCents, parseCents } from '@shared/money'

export function formatQty(n: number): string {
  return n.toLocaleString('zh-CN')
}

export function todayString(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
