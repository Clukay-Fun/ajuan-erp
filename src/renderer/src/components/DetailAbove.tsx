import type { ReactElement, ReactNode } from 'react'
import { X } from 'lucide-react'
import styles from './DetailAbove.module.css'

interface Props {
  /** 为 null 时不显示详情面板 */
  detail: ReactNode | null
  onClose: () => void
  list: ReactNode
}

/** 点击列表行后，在列表上方展开详情面板；关闭后列表回到满宽。 */
export function DetailAbove({ detail, onClose, list }: Props): ReactElement {
  return (
    <div className={styles.wrap}>
      {detail !== null && (
        <section className={styles.panel} aria-label="详情">
          <button type="button" className={styles.close} onClick={onClose} aria-label="收起详情" title="收起 (Esc)">
            <X size={16} />
          </button>
          {detail}
        </section>
      )}
      {list}
    </div>
  )
}
