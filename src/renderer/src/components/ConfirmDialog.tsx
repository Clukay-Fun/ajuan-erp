import type { ReactElement, ReactNode } from 'react'
import { useEffect, useRef } from 'react'
import { useFocusTrap } from '@/lib/useFocusTrap'
import { Button } from './Button'
import styles from './ConfirmDialog.module.css'

interface Props {
  open: boolean
  title: string
  description?: ReactNode
  confirmText?: string
  danger?: boolean
  busy?: boolean
  disabled?: boolean
  onConfirm: () => void
  onCancel: () => void
  children?: ReactNode
}

export function ConfirmDialog({ open, title, description, confirmText = '确认', danger, busy, disabled, onConfirm, onCancel, children }: Props): ReactElement | null {
  const ref = useRef<HTMLDivElement>(null)
  useFocusTrap(ref, open)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onCancel])
  if (!open) return null
  return (
    <div className={styles.backdrop} onClick={onCancel}>
      <div ref={ref} className={styles.dialog} role="alertdialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className={styles.title}>{title}</div>
        {description && <div className={styles.desc}>{description}</div>}
        {children}
        <div className={styles.actions}>
          <Button onClick={onCancel} disabled={busy}>取消</Button>
          <Button variant="primary" className={danger ? styles.danger : ''} onClick={onConfirm} disabled={busy || disabled} autoFocus>
            {busy ? '处理中…' : confirmText}
          </Button>
        </div>
      </div>
    </div>
  )
}
