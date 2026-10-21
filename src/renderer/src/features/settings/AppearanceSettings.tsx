/**
 * 描述: 设置 › 外观 (AppearanceSettings)
 * 主要功能:
 *   - 模式：跟随系统 / 浅色 / 深色，三张纯 CSS 缩略图
 *   - 主题设置：一张大卡内的行式布局（主题、强调色、背景、前景）
 *   - 浅色与深色分别保存；关闭「分别设置」后两种模式共用一套
 *   - 高级折叠：界面字号、表格字号、减少动态效果
 */

import { useEffect, useState, type ReactElement } from 'react'
import {
  applyAppearance,
  contrastRatio,
  presetPalette,
  readAppearance,
  resetPalette,
  writeAppearance,
  type AppearancePref,
  type Palette,
  type PaletteMode,
  type ReduceMotion,
  type ThemeChoice
} from '@/lib/appearance'
import { applyTheme, readThemePreference, type ThemePreference } from '@/lib/theme'
import { SegmentedControl } from '@/components/ui'
import card from './SettingsCard.module.css'
import styles from './AppearanceSettings.module.css'

const MODE_OPTIONS: Array<{ value: ThemePreference; label: string }> = [
  { value: 'system', label: '跟随系统' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' }
]

const FONT_UI_OPTIONS = [
  { value: '13', label: '小' },
  { value: '14', label: '标准' },
  { value: '15', label: '大' },
  { value: '16', label: '特大' }
]

const FONT_TABLE_OPTIONS = [
  { value: '11', label: '小' },
  { value: '12', label: '标准' },
  { value: '13', label: '大' }
]

const MOTION_OPTIONS: Array<{ value: ReduceMotion; label: string }> = [
  { value: 'system', label: '跟随系统' },
  { value: 'on', label: '开启' },
  { value: 'off', label: '关闭' }
]

function useActiveMode(pref: ThemePreference): PaletteMode {
  const [systemDark, setSystemDark] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
  )
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent): void => setSystemDark(e.matches)
    media.addEventListener('change', handler)
    return () => media.removeEventListener('change', handler)
  }, [])
  if (pref === 'light') return 'light'
  if (pref === 'dark') return 'dark'
  return systemDark ? 'dark' : 'light'
}

export function AppearanceSettings(): ReactElement {
  const [mode, setMode] = useState<ThemePreference>(readThemePreference)
  const activeMode = useActiveMode(mode)
  const [pref, setPref] = useState<AppearancePref>(readAppearance)
  const palette = pref[activeMode]
  const ratio = contrastRatio(palette.foreground, palette.background)

  function commit(next: AppearancePref): void {
    setPref(next)
    writeAppearance(next)
    applyAppearance(next)
  }

  function chooseMode(next: ThemePreference): void {
    setMode(next)
    applyTheme(next)
  }

  function updatePalette(patch: Partial<Palette>): void {
    let nextPalette: Palette = { ...palette, ...patch }
    if (patch.theme && patch.theme !== 'custom') {
      nextPalette = presetPalette(patch.theme, activeMode)
    } else if (patch.accent || patch.background || patch.foreground) {
      nextPalette.theme = 'custom'
    }
    const next: AppearancePref = { ...pref, [activeMode]: nextPalette }
    if (!pref.separate) {
      next.light = nextPalette
      next.dark = { ...nextPalette }
    }
    commit(next)
  }

  function toggleSeparate(checked: boolean): void {
    const next: AppearancePref = { ...pref, separate: checked }
    if (!checked) {
      const shared = pref[activeMode]
      next.light = { ...shared }
      next.dark = { ...shared }
    }
    commit(next)
  }

  return (
    <section className={card.card}>
      <h2 className={card.title}>外观</h2>
      <p className={card.hint}>模式、配色与字号会立即应用到整个应用，并保存在本机。</p>

      <h3 className={styles.groupTitle}>视觉风格</h3>

      {/* 模式：文字 + 三张缩略图 */}
      <div className={styles.modeCard}>
        <div className={styles.modeText}>
          <span className={styles.rowLabel}>模式</span>
          <span className={styles.rowDesc}>跟随系统会随 macOS / Windows 的外观自动切换。</span>
        </div>
        <div className={styles.modes} role="radiogroup" aria-label="模式">
          {MODE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={mode === option.value}
              className={styles.modeOption}
              onClick={() => chooseMode(option.value)}
            >
              <span className={styles.modePreview} data-preview={option.value} aria-hidden="true">
                <span className={styles.previewBar} />
                <span className={styles.previewBody}>
                  <span className={styles.previewSide} />
                  <span className={styles.previewMain}>
                    <span className={styles.previewLine} />
                    <span className={styles.previewLine} />
                    <span className={styles.previewLine} />
                  </span>
                </span>
              </span>
              <span className={styles.modeLabel}>{option.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 主题设置大卡 */}
      <div className={styles.themeCard}>
        <div className={styles.themeHead}>
          <span className={styles.rowLabel}>主题设置</span>
          <span className={styles.editing}>正在编辑：{activeMode === 'light' ? '浅色' : '深色'}</span>
        </div>

        <div className={styles.settingRow}>
          <div className={styles.settingText}>
            <span className={styles.settingLabel}>主题</span>
            <span className={styles.rowDesc}>阿卷 ERP 使用品牌色；也可以换成更中性的灰阶。</span>
          </div>
          <SegmentedControl
            options={[
              { value: 'brand', label: '阿卷 ERP' },
              { value: 'neutral', label: '柔和中性' },
              { value: 'custom', label: '自定义' }
            ]}
            value={palette.theme}
            onChange={(value) => updatePalette({ theme: value as ThemeChoice })}
          />
        </div>

        <ColorRow
          label="强调色"
          description="导航选中、主按钮、商品名和关键数字。"
          value={palette.accent}
          onChange={(accent) => updatePalette({ accent })}
        />
        <ColorRow
          label="背景"
          description="页面底色，卡片会自动提亮或加深。"
          value={palette.background}
          onChange={(background) => updatePalette({ background })}
        />
        <ColorRow
          label="前景"
          description="正文与标题文字颜色。"
          value={palette.foreground}
          onChange={(foreground) => updatePalette({ foreground })}
        />

        <div className={styles.contrastRow}>
          <span className={ratio >= 4.5 ? styles.contrastOk : styles.contrastBad}>
            正文对比度 {ratio.toFixed(1)}:1 {ratio >= 4.5 ? '（可读）' : '（低于 4.5:1，建议调深前景或调浅背景）'}
          </span>
          <button type="button" className={styles.reset} onClick={() => commit(resetPalette(pref, activeMode))}>
            恢复默认
          </button>
        </div>
      </div>

      {/* 高级折叠 */}
      <details className={styles.advanced}>
        <summary className={styles.advancedSummary}>高级</summary>
        <div className={styles.advancedBody}>
          <div className={styles.advancedCard}>
            <div className={styles.settingRow}>
              <div className={styles.settingText}>
                <span className={styles.settingLabel}>界面字号</span>
                <span className={styles.rowDesc}>导航、表单、按钮和弹窗的基准字号。</span>
              </div>
              <SegmentedControl
                options={FONT_UI_OPTIONS}
                value={String(pref.fontUi)}
                onChange={(value) => commit({ ...pref, fontUi: Number(value) })}
              />
            </div>
            <div className={styles.settingRow}>
              <div className={styles.settingText}>
                <span className={styles.settingLabel}>表格字号</span>
                <span className={styles.rowDesc}>单据、商品流水等数据表格的字号。</span>
              </div>
              <SegmentedControl
                options={FONT_TABLE_OPTIONS}
                value={String(pref.fontTable)}
                onChange={(value) => commit({ ...pref, fontTable: Number(value) })}
              />
            </div>
          </div>

          <div className={styles.advancedCard}>
            <div className={styles.settingRow}>
              <div className={styles.settingText}>
                <span className={styles.settingLabel}>减少动态效果</span>
                <span className={styles.rowDesc}>关闭过渡和动画；跟随系统时使用系统设置。</span>
              </div>
              <SegmentedControl
                options={MOTION_OPTIONS}
                value={pref.reduceMotion}
                onChange={(value) => commit({ ...pref, reduceMotion: value as ReduceMotion })}
              />
            </div>
            <div className={styles.settingRow}>
              <div className={styles.settingText}>
                <span className={styles.settingLabel}>分别设置浅色和深色模式</span>
                <span className={styles.rowDesc}>开启后两套配色独立保存；关闭后两种模式共用当前这套自定义。</span>
              </div>
              <label className={styles.switch}>
                <input type="checkbox" checked={pref.separate} onChange={(e) => toggleSeparate(e.target.checked)} />
                <span>{pref.separate ? '已开启' : '已关闭'}</span>
              </label>
            </div>
          </div>
        </div>
      </details>
    </section>
  )
}

function ColorRow({
  label,
  description,
  value,
  onChange
}: {
  label: string
  description: string
  value: string
  onChange: (value: string) => void
}): ReactElement {
  return (
    <div className={styles.settingRow}>
      <div className={styles.settingText}>
        <span className={styles.settingLabel}>{label}</span>
        <span className={styles.rowDesc}>{description}</span>
      </div>
      <div className={styles.colorControl}>
        <input
          type="color"
          className={styles.colorInput}
          value={value}
          aria-label={`${label}取色`}
          onChange={(e) => onChange(e.target.value)}
        />
        <span className={styles.hex}>{value.toUpperCase()}</span>
      </div>
    </div>
  )
}
