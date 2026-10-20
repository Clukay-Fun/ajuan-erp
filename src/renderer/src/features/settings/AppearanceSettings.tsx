import type { ReactElement } from 'react'
import { useState } from 'react'
import { Monitor, Sun, Moon } from 'lucide-react'
import { applyTheme, readThemePreference, type ThemePreference } from '@/lib/theme'
import card from './SettingsCard.module.css'
import styles from './AppearanceSettings.module.css'

const OPTIONS: { value: ThemePreference; label: string; desc: string; icon: typeof Sun }[] = [
  { value: 'system', label: '跟随系统', desc: '随 macOS / Windows 外观切换', icon: Monitor },
  { value: 'light', label: '浅色', desc: '冷白灰 · 墨绿', icon: Sun },
  { value: 'dark', label: '深色', desc: '墨黑 · 紫罗兰', icon: Moon }
]

export function AppearanceSettings(): ReactElement {
  const [pref, setPref] = useState<ThemePreference>(readThemePreference)
  return (
    <section className={card.card}>
      <h2 className={card.title}>外观</h2>
      <p className={card.hint}>两套主题结构与操作完全一致，只换视觉语言。</p>
      <div className={styles.options} role="radiogroup" aria-label="外观">
        {OPTIONS.map(({ value, label, desc, icon: Icon }) => (
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
            <span className={styles.optionIcon}>
              <Icon size={16} strokeWidth={1.8} />
            </span>
            <span className={styles.optionText}>
              <span className={styles.optionLabel}>{label}</span>
              <span className={styles.optionDesc}>{desc}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}
