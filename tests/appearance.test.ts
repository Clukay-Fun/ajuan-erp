import { describe, expect, it } from 'vitest'
import {
  accentForeground,
  appearanceCss,
  contrastRatio,
  defaultAppearance,
  ensureContrast,
  presetPalette,
  resetPalette
} from '../src/renderer/src/lib/appearance'

describe('外观偏好与对比度', () => {
  it('默认浅色墨绿、深色紫罗兰', () => {
    const pref = defaultAppearance()
    expect(pref.light.accent).toBe('#2f7357')
    expect(pref.dark.accent).toBe('#7560dc')
    expect(pref.separate).toBe(true)
    expect(pref.fontUi).toBe(14)
    expect(pref.fontTable).toBe(12)
  })

  it('对比度计算与自动修正', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1)
    const fixed = ensureContrast('#dddddd', '#ffffff', 4.5)
    expect(contrastRatio(fixed, '#ffffff')).toBeGreaterThanOrEqual(4.5)
    expect(accentForeground('#111315')).toBe('#ffffff')
    expect(accentForeground('#f5f6f8')).toBe('#111315')
  })

  it('预设与恢复默认', () => {
    expect(presetPalette('neutral', 'light').theme).toBe('neutral')
    const custom = defaultAppearance()
    custom.light = { theme: 'custom', accent: '#123456', background: '#ffffff', foreground: '#000000' }
    const reset = resetPalette(custom, 'light')
    expect(reset.light.accent).toBe('#2f7357')
    expect(reset.dark.accent).toBe('#7560dc')
  })

  it('生成的 CSS 覆盖强调色、背景、文字与字号', () => {
    const pref = defaultAppearance()
    pref.fontUi = 16
    pref.fontTable = 13
    pref.light.accent = '#123456'
    const css = appearanceCss(pref)
    expect(css).toContain('--accent: #123456;')
    expect(css).toContain('--font-size-base: 16px;')
    expect(css).toContain('--font-size-table: 13px;')
    expect(css).toContain(":root[data-theme='dark']")
    expect(css).toContain('@media (prefers-color-scheme: dark)')
    expect(css).toContain('table {')
  })
})
