import type { ReactElement } from 'react'
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'
import styles from './Dropdown.module.css'

export interface DropdownOption<T extends string | number> {
  value: T
  label: string
  disabled?: boolean
  hint?: string
}

interface Props<T extends string | number> {
  value: T
  options: DropdownOption<T>[]
  onChange: (value: T) => void
  placeholder?: string
  /** 紧凑：用于筛选栏，宽度随内容 */
  compact?: boolean
  className?: string
  'aria-label'?: string
  id?: string
}

/**
 * 自绘下拉：菜单挂在触发器正下方、宽度与触发器一致、从顶部展开（origin-aware）。
 * 原生 <select> 在 macOS 上弹的是系统菜单，位置和宽度都不可控。
 */
export function Dropdown<T extends string | number>({
  value,
  options,
  onChange,
  placeholder = '请选择',
  compact,
  className,
  id,
  ...rest
}: Props<T>): ReactElement {
  const autoId = useId()
  const listId = `${id ?? autoId}-list`
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const [open, setOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  const [rect, setRect] = useState<{ top: number; left: number; width: number; up: boolean } | null>(null)
  const selectedIndex = options.findIndex((o) => o.value === value)
  const [active, setActive] = useState(Math.max(0, selectedIndex))

  const place = useCallback(() => {
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const estimated = Math.min(options.length, 8) * 36 + 8
    const up = r.bottom + estimated + 8 > window.innerHeight && r.top > estimated
    setRect({ top: up ? r.top - 4 : r.bottom + 4, left: r.left, width: r.width, up })
  }, [options.length])

  const close = useCallback(() => {
    if (!open) return
    setClosing(true)
    window.setTimeout(() => {
      setOpen(false)
      setClosing(false)
    }, 120)
  }, [open])

  useLayoutEffect(() => {
    if (open) place()
  }, [open, place])

  useEffect(() => {
    if (!open) return
    setActive(Math.max(0, selectedIndex))
    const onDown = (e: MouseEvent): void => {
      const t = e.target as Node
      if (!triggerRef.current?.contains(t) && !listRef.current?.contains(t)) close()
    }
    const onScroll = (): void => place()
    window.addEventListener('mousedown', onDown)
    window.addEventListener('resize', onScroll)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('resize', onScroll)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open, close, place, selectedIndex])

  useEffect(() => {
    if (!open) return
    const el = listRef.current?.children[active] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  function pick(i: number): void {
    const o = options[i]
    if (!o || o.disabled) return
    onChange(o.value)
    close()
    triggerRef.current?.focus()
  }

  function onKey(e: React.KeyboardEvent): void {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        setOpen(true)
      }
      return
    }
    const step = (d: number): void => {
      let i = active
      for (let n = 0; n < options.length; n++) {
        i = (i + d + options.length) % options.length
        if (!options[i].disabled) break
      }
      setActive(i)
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      step(1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      step(-1)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      pick(active)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      close()
    } else if (e.key === 'Home') {
      setActive(0)
    } else if (e.key === 'End') {
      setActive(options.length - 1)
    }
  }

  const selected = options[selectedIndex]

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        className={`${styles.trigger} ${compact ? styles.compact : ''} ${open ? styles.open : ''} ${className ?? ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={onKey}
        {...rest}
      >
        <span className={selected ? styles.value : styles.placeholder}>{selected?.label ?? placeholder}</span>
        <ChevronDown size={16} className={styles.chevron} />
      </button>
      {open &&
        rect &&
        createPortal(
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            className={`${styles.menu} ${rect.up ? styles.menuUp : ''}`}
            data-closing={closing || undefined}
            style={{ top: rect.top, left: rect.left, minWidth: rect.width, width: compact ? undefined : rect.width }}
            onKeyDown={onKey}
          >
            {options.map((o, i) => (
              <li
                key={String(o.value)}
                role="option"
                aria-selected={o.value === value}
                aria-disabled={o.disabled || undefined}
                data-active={i === active || undefined}
                className={styles.item}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(i)}
              >
                <span className={styles.itemLabel}>
                  {o.label}
                  {o.hint && <span className={styles.itemHint}>{o.hint}</span>}
                </span>
                {o.value === value && <Check size={14} className={styles.check} />}
              </li>
            ))}
          </ul>,
          document.body
        )}
    </>
  )
}
