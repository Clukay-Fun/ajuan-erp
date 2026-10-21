import type { ReactElement } from 'react'
import { ArrowLeft } from 'lucide-react'
import { SETTINGS_SECTIONS, type SettingsSectionKey } from '@/pages/settingsSections'
import styles from './SettingsNav.module.css'

export interface SettingsNavProps {
  active: SettingsSectionKey
  onSelect: (key: SettingsSectionKey) => void
  onBack: () => void
}

/** 进入设置后替换主导航的专属侧栏；「返回应用」回到进入设置前的业务页 */
export function SettingsNav({ active, onSelect, onBack }: SettingsNavProps): ReactElement {
  return (
    <div className={styles.wrap}>
      <button type="button" className={styles.back} onClick={onBack}>
        <ArrowLeft size={15} />
        <span>返回应用</span>
      </button>

      <nav className={styles.nav} aria-label="设置分类">
        <div className={styles.groupTitle}>设置</div>
        {SETTINGS_SECTIONS.map((section) => (
          <button
            key={section.key}
            type="button"
            className={styles.item}
            aria-current={active === section.key ? 'page' : undefined}
            onClick={() => onSelect(section.key)}
          >
            <span className={styles.label}>{section.label}</span>
            <span className={styles.hint}>{section.hint}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
