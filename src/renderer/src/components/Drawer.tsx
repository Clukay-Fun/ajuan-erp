import type { ReactElement, ReactNode } from 'react'
import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import styles from './Drawer.module.css'
import { useFocusTrap } from '@/lib/useFocusTrap'
import { usePresence } from '@/lib/usePresence'

interface DrawerProps {
  open: boolean
  /** 标题；也可以传节点（如单号 + 徽标） */
  title: ReactNode
  onClose: () => void
  footer?: ReactNode
  /** 宽版：用于详情 */
  wide?: boolean
  children: ReactNode
}

/** 居中弹窗。名字沿用 Drawer 以免大面积改引用。 */
export function Drawer({ open, title, onClose, footer, wide, children }: DrawerProps): ReactElement | null {
  const panelRef = useRef<HTMLElement>(null)
  const { mounted, closing } = usePresence(open)
  useFocusTrap(panelRef, open)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!mounted) return null
  return (
    <>
      <div className={styles.backdrop} data-closing={closing || undefined} onClick={onClose} />
      <aside
        ref={panelRef}
        className={`${styles.panel} ${wide ? styles.wide : ''}`}
        data-closing={closing || undefined}
        role="dialog"
        aria-modal="true"
      >
        <header className={styles.header}>
          <div className={styles.title}>{title}</div>
          <button type="button" className={styles.close} onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </header>
        <div className={styles.body}>{children}</div>
        {footer && <footer className={styles.footer}>{footer}</footer>}
      </aside>
    </>
  )
}
