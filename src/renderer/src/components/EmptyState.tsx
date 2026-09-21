import type { ReactElement } from 'react'
import type { LucideIcon } from 'lucide-react'
import styles from './EmptyState.module.css'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
}

export function EmptyState({ icon: Icon, title, description }: EmptyStateProps): ReactElement {
  return (
    <div className={styles.empty}>
      <Icon className={styles.icon} size={36} strokeWidth={1.5} />
      <div className={styles.title}>{title}</div>
      {description && <p>{description}</p>}
    </div>
  )
}
