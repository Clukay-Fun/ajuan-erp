import type { ReactElement, SelectHTMLAttributes } from 'react'
import { useId } from 'react'
import { ChevronDown } from 'lucide-react'
import styles from './Field.module.css'
import own from './Select.module.css'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string
  error?: string
  hint?: string
}

export function Select({ label, error, hint, id, children, ...rest }: SelectProps): ReactElement {
  const autoId = useId()
  const selectId = id ?? autoId
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={selectId}>
        {label}
      </label>
      <div className={`${styles.control} ${own.wrap} ${error ? styles.invalid : ''}`}>
        <select id={selectId} className={`${styles.input} ${own.select}`} {...rest}>
          {children}
        </select>
        <ChevronDown size={16} className={own.chevron} />
      </div>
      {error ? <span className={styles.error}>{error}</span> : hint ? <span className={styles.hint}>{hint}</span> : null}
    </div>
  )
}
