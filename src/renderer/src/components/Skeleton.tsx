import type { CSSProperties, ReactElement } from 'react'
import styles from './Skeleton.module.css'

/** 骨架占位：在内容位置显示形状，而不是居中转圈。 */
export function Skeleton({ width = '100%', height = 14, style }: { width?: number | string; height?: number; style?: CSSProperties }): ReactElement {
  return <span className={styles.line} style={{ width, height, ...style }} aria-hidden />
}

export function SkeletonCard({ lines = 3, style }: { lines?: number; style?: CSSProperties }): ReactElement {
  return (
    <div className={styles.block} style={style} aria-busy>
      <Skeleton width="40%" height={12} />
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} width={`${90 - i * 15}%`} />
      ))}
    </div>
  )
}

export function SkeletonTable({ rows = 6, cols = 6 }: { rows?: number; cols?: number }): ReactElement {
  return (
    <div className={styles.block} style={{ gap: 14 }} aria-busy>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 16 }}>
          {Array.from({ length: cols }, (_, c) => (
            <Skeleton key={c} width={c === 0 ? '70%' : '55%'} />
          ))}
        </div>
      ))}
    </div>
  )
}
