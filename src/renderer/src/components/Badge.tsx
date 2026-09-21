import type { ReactElement, ReactNode } from 'react'
import type { DocumentStatus, DocumentType } from '@shared/types'
import styles from './Badge.module.css'

type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }): ReactElement {
  return <span className={`${styles.badge} ${styles[tone]}`}>{children}</span>
}

export const STATUS_LABEL: Record<DocumentStatus, string> = { draft: '草稿', confirmed: '已生效', voided: '已作废' }
const STATUS_TONE: Record<DocumentStatus, Tone> = { draft: 'warning', confirmed: 'success', voided: 'neutral' }
export const TYPE_LABEL: Record<DocumentType, string> = { inbound: '入库', outbound: '出库', opening: '期初' }
const TYPE_TONE: Record<DocumentType, Tone> = { inbound: 'info', outbound: 'danger', opening: 'neutral' }

export function StatusBadge({ status }: { status: DocumentStatus }): ReactElement {
  return <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
}
export function TypeBadge({ type }: { type: DocumentType }): ReactElement {
  return <Badge tone={TYPE_TONE[type]}>{TYPE_LABEL[type]}</Badge>
}
