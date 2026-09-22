import type { ReactElement, ReactNode } from 'react'
import styles from './SplitView.module.css'

interface Props {
  master: ReactNode
  detail: ReactNode | null
  placeholder?: string
}

export function SplitView({ master, detail, placeholder = '从左侧选择一项查看详情' }: Props): ReactElement {
  return (
    <div className={styles.split}>
      <div className={styles.master}>{master}</div>
      <div className={styles.detail}>{detail ?? <div className={styles.placeholder}>{placeholder}</div>}</div>
    </div>
  )
}
