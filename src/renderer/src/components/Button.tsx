import type { ButtonHTMLAttributes, ReactElement } from 'react'
import styles from './Button.module.css'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost'
}

export function Button({ variant = 'secondary', className, type = 'button', ...rest }: ButtonProps): ReactElement {
  return <button type={type} className={`${styles.btn} ${styles[variant]} ${className ?? ''}`} {...rest} />
}
