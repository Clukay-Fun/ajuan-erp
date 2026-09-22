import type { ReactElement } from 'react'
import { useId } from 'react'
import styles from './Field.module.css'
import { Dropdown, type DropdownOption } from './Dropdown'

interface SelectProps<T extends string | number> {
  label: string
  value: T
  options: DropdownOption<T>[]
  onChange: (value: T) => void
  placeholder?: string
  error?: string
  hint?: string
}

/** 带标签的下拉，表单里与 Field 并排使用。 */
export function Select<T extends string | number>({ label, error, hint, ...rest }: SelectProps<T>): ReactElement {
  const id = useId()
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <Dropdown id={id} aria-label={label} {...rest} />
      {error ? (
        <span className={styles.error}>{error}</span>
      ) : hint ? (
        <span className={styles.hint}>{hint}</span>
      ) : null}
    </div>
  )
}
