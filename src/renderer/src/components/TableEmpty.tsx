import type { ReactElement } from 'react'
import table from './Table.module.css'

/** 放在 <tbody> 里的空状态：表头保留，正文区居中一行标题一行说明。 */
export function TableEmpty({
  cols,
  title,
  description
}: {
  cols: number
  title: string
  description?: string
}): ReactElement {
  return (
    <tr className={table.emptyRow}>
      <td colSpan={cols}>
        <div className={table.empty}>
          <div className={table.emptyTitle}>{title}</div>
          {description && <div className={table.emptyDesc}>{description}</div>}
        </div>
      </td>
    </tr>
  )
}
