import type { ReactElement, ReactNode } from 'react'
import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import styles from './Toast.module.css'

type Kind = 'info' | 'success' | 'error'
interface Toast {
  id: number
  kind: Kind
  text: string
  leaving?: boolean
}

const ToastContext = createContext<(text: string, kind?: Kind) => void>(() => {})

export function useToast(): (text: string, kind?: Kind) => void {
  return useContext(ToastContext)
}

let seq = 0

export function ToastProvider({ children }: { children: ReactNode }): ReactElement {
  const [items, setItems] = useState<Toast[]>([])
  const push = useCallback((text: string, kind: Kind = 'info') => {
    const id = ++seq
    setItems((xs) => [...xs, { id, kind, text }])
    // 退出比进入快：先标记 leaving 播 160ms 淡出，再移除
    window.setTimeout(() => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, leaving: true } : x))), 2800)
    window.setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 2800 + 160)
  }, [])
  const value = useMemo(() => push, [push])
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className={styles.host} aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`${styles.toast} ${styles[t.kind]}`} data-leaving={t.leaving || undefined}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
