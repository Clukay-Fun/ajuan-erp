import type { ReactElement } from 'react'
import { useState } from 'react'
import { Monitor, Sun, Moon } from 'lucide-react'
import { applyTheme, readThemePreference, type ThemePreference } from '@/lib/theme'
import styles from './AppearanceSettings.module.css'

const OPTIONS: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: 'system', label: '跟随系统', icon: Monitor },
  { value: 'light', label: '浅色', icon: Sun },
  { value: 'dark', label: '深色', icon: Moon }
]

export function AppearanceSettings(): ReactElement {
  const [pref, setPref] = useState<ThemePreference>(readThemePreference)
  return (
    <section className={styles.card}>
      <h2 className={styles.title}>外观</h2>
      <p className={styles.hint}>默认跟随系统的浅色 / 深色设置。</p>
      <div className={styles.group} role="radiogroup" aria-label="外观">
        {OPTIONS.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={pref === value}
            className={styles.option}
            onClick={() => {
              setPref(value)
              applyTheme(value)
            }}
          >
            <Icon size={16} strokeWidth={1.8} />
            {label}
          </button>
        ))}
      </div>
    </section>
  )
}
