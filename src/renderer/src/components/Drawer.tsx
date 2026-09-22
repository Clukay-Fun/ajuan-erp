import type { ReactElement, ReactNode } from 'react'
import { useEffect, useRef } from 'react'
import { useFocusTrap } from '@/lib/useFocusTrap'
import { X } from 'lucide-react'
import styles from './Drawer.module.css'

interface DrawerProps {
  open: boolean
  title: string
  onClose: () => void
  footer?: ReactNode
  children: ReactNode
}

export function Drawer({ open, title, onClose, footer, children }: DrawerProps): ReactElement | null {
  const panelRef = useRef<HTMLElement>(null)
  useFocusTrap(panelRef, open)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <>
      <div className={styles.backdrop} onClick={onClose} />
      <aside ref={panelRef} className={styles.panel} role="dialog" aria-modal="true" aria-label={title}>
        <header className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
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
