import type { InputHTMLAttributes, ReactElement, ReactNode } from 'react'
import { useId } from 'react'
import styles from './Field.module.css'

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  label: string
  error?: string
  hint?: string
  prefix?: ReactNode
  suffix?: ReactNode
}

export function Field({ label, error, hint, prefix, suffix, id, ...rest }: FieldProps): ReactElement {
  const autoId = useId()
  const inputId = id ?? autoId
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={inputId}>
        {label}
      </label>
      <div className={`${styles.control} ${error ? styles.invalid : ''}`}>
        {prefix && <span className={styles.prefix}>{prefix}</span>}
        <input id={inputId} className={styles.input} aria-invalid={!!error} {...rest} />
        {suffix && <span className={styles.suffix}>{suffix}</span>}
      </div>
      {error ? <span className={styles.error}>{error}</span> : hint ? <span className={styles.hint}>{hint}</span> : null}
    </div>
  )
}
