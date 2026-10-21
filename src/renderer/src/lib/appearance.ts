/**
 * 描述: 外观偏好（主题配色、字号、动效）
 * 主要功能:
 *   - localStorage `ajuan.appearance` 持久化；浅色 / 深色各自一套配色
 *   - 启动时在首帧前写入 CSS 变量（覆盖 --accent* / --bg-* / --text-* / 字号）
 *   - 计算正文对比度；强调色前景自动取可读颜色，品牌文字色不足 4.5:1 时自动加深
 *   - 「减少动态效果」通过 data-reduce-motion 覆盖系统设置
 */

export type ThemeChoice = 'brand' | 'neutral' | 'custom'
export type ReduceMotion = 'system' | 'on' | 'off'
export type PaletteMode = 'light' | 'dark'

export interface Palette {
  theme: ThemeChoice
  accent: string
  background: string
  foreground: string
}

export interface AppearancePref {
  version: 1
  /** 浅色 / 深色分别保存；关闭「分别设置」时两者同步 */
  separate: boolean
  light: Palette
  dark: Palette
  /** 界面基准字号（px） */
  fontUi: number
  /** 表格字号（px） */
  fontTable: number
  reduceMotion: ReduceMotion
}

export const THEME_OPTIONS: Array<{ value: ThemeChoice; label: string }> = [
  { value: 'brand', label: '阿卷 ERP' },
  { value: 'neutral', label: '柔和中性' },
  { value: 'custom', label: '自定义' }
]

export const BRAND_LIGHT: Palette = { theme: 'brand', accent: '#2f7357', background: '#f5f6f8', foreground: '#1b1f24' }
export const BRAND_DARK: Palette = { theme: 'brand', accent: '#7560dc', background: '#111315', foreground: '#e8eaed' }
const NEUTRAL_LIGHT: Palette = {
  theme: 'neutral',
  accent: '#5f6873',
  background: '#f3f4f6',
  foreground: '#1f2937'
}
const NEUTRAL_DARK: Palette = {
  theme: 'neutral',
  accent: '#9aa2ac',
  background: '#181a1d',
  foreground: '#e5e7eb'
}

// 主进程恢复备份时按这个键写回（src/main/backupIo.ts），改名需同步
const KEY = 'ajuan.appearance'

export function defaultAppearance(): AppearancePref {
  return {
    version: 1,
    separate: true,
    light: { ...BRAND_LIGHT },
    dark: { ...BRAND_DARK },
    fontUi: 14,
    fontTable: 12,
    reduceMotion: 'system'
  }
}

export function readAppearance(): AppearancePref {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return defaultAppearance()
    const parsed = JSON.parse(raw) as Partial<AppearancePref>
    return normalizeAppearance(parsed)
  } catch {
    return defaultAppearance()
  }
}

function normalizeAppearance(input: Partial<AppearancePref>): AppearancePref {
  const base = defaultAppearance()
  const palette = (value: Partial<Palette> | undefined, fallback: Palette): Palette => ({
    theme: value?.theme === 'neutral' || value?.theme === 'custom' ? value.theme : fallback.theme,
    accent: normalizeHex(value?.accent, fallback.accent),
    background: normalizeHex(value?.background, fallback.background),
    foreground: normalizeHex(value?.foreground, fallback.foreground)
  })
  return {
    version: 1,
    separate: input.separate !== false,
    light: palette(input.light, base.light),
    dark: palette(input.dark, base.dark),
    fontUi: clamp(Number(input.fontUi) || base.fontUi, 12, 17),
    fontTable: clamp(Number(input.fontTable) || base.fontTable, 10, 15),
    reduceMotion: input.reduceMotion === 'on' || input.reduceMotion === 'off' ? input.reduceMotion : 'system'
  }
}

/** 随备份保存的界面偏好（preferences.json）；恢复时主进程把 appearance 写回 localStorage */
export function backupPreferences(): Record<string, unknown> {
  return { appearance: { ...readAppearance() } }
}

export function writeAppearance(pref: AppearancePref): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(pref))
  } catch {
    // 私密模式等情况下忽略
  }
}

export function presetPalette(theme: ThemeChoice, mode: PaletteMode): Palette {
  if (theme === 'neutral') return { ...(mode === 'light' ? NEUTRAL_LIGHT : NEUTRAL_DARK) }
  return { ...(mode === 'light' ? BRAND_LIGHT : BRAND_DARK) }
}

/** 浅色 / 深色模式各自默认配色 */
export function resetPalette(pref: AppearancePref, mode: PaletteMode): AppearancePref {
  const light = mode === 'light' ? { ...BRAND_LIGHT } : pref.light
  const dark = mode === 'dark' ? { ...BRAND_DARK } : pref.dark
  return pref.separate ? { ...pref, light, dark } : { ...pref, light, dark: { ...light } }
}

// #region 颜色计算

export function normalizeHex(value: string | undefined, fallback: string): string {
  if (!value) return fallback
  const v = value.trim()
  if (/^#[0-9a-f]{6}$/i.test(v)) return v.toLowerCase()
  if (/^#[0-9a-f]{3}$/i.test(v)) {
    return `#${v
      .slice(1)
      .split('')
      .map((c) => c + c)
      .join('')}`.toLowerCase()
  }
  return fallback
}

function hexToRgb(hex: string): [number, number, number] {
  const h = normalizeHex(hex, '#000000').slice(1)
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

function rgbToHex(r: number, g: number, b: number): string {
  const p = (n: number): string =>
    Math.round(clamp(n, 0, 255))
      .toString(16)
      .padStart(2, '0')
  return `#${p(r)}${p(g)}${p(b)}`
}

/** a、b 混合，weight 为 b 的占比 */
export function mixColor(a: string, b: string, weight: number): string {
  const [ar, ag, ab] = hexToRgb(a)
  const [br, bg, bb] = hexToRgb(b)
  const w = clamp(weight, 0, 1)
  return rgbToHex(ar + (br - ar) * w, ag + (bg - ag) * w, ab + (bb - ab) * w)
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrastRatio(fg: string, bg: string): number {
  const a = relativeLuminance(fg)
  const b = relativeLuminance(bg)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

export function isDarkColor(hex: string): boolean {
  return relativeLuminance(hex) < 0.5
}

/** 把颜色向黑或白混合，直到与背景达到可读对比度 */
export function ensureContrast(color: string, background: string, min = 4.5): string {
  if (contrastRatio(color, background) >= min) return color
  const target = contrastRatio('#ffffff', background) >= contrastRatio('#111315', background) ? '#ffffff' : '#111315'
  for (let i = 1; i <= 10; i++) {
    const result = mixColor(color, target, i / 10)
    if (contrastRatio(result, background) >= min) return result
  }
  return target
}

export function accentForeground(accent: string): string {
  return contrastRatio('#ffffff', accent) >= contrastRatio('#111315', accent) ? '#ffffff' : '#111315'
}

// #endregion

// #region 生成并应用 CSS 变量

export function appearanceCss(pref: AppearancePref): string {
  const light = paletteCss(pref.light, false)
  const dark = paletteCss(pref.dark, true)
  const scale = pref.fontUi / 14
  const px = (base: number): number => Math.round(base * scale)
  const fonts = `:root {
  --font-size-xs: ${px(12)}px;
  --font-size-sm: ${px(13)}px;
  --font-size-base: ${pref.fontUi}px;
  --font-size-md: ${px(16)}px;
  --font-size-lg: ${px(20)}px;
  --font-size-xl: ${px(28)}px;
  --text-xs: ${px(12)}px;
  --text-sm: ${px(13)}px;
  --text-base: ${pref.fontUi}px;
  --text-md: ${px(16)}px;
  --text-lg: ${px(20)}px;
  --text-kpi: ${px(28)}px;
  --font-size-table: ${pref.fontTable}px;
}
table {
  --font-size-xs: ${pref.fontTable}px;
  --font-size-sm: ${pref.fontTable}px;
}`
  return `${fonts}
:root, :root[data-theme='light'] {
${light}
}
:root[data-theme='dark'] {
${dark}
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
${dark}
  }
}
`
}

function paletteCss(palette: Palette, dark: boolean): string {
  const accent = normalizeHex(palette.accent, dark ? BRAND_DARK.accent : BRAND_LIGHT.accent)
  const bg = normalizeHex(palette.background, dark ? BRAND_DARK.background : BRAND_LIGHT.background)
  const fg = normalizeHex(palette.foreground, dark ? BRAND_DARK.foreground : BRAND_LIGHT.foreground)
  const accentText = ensureContrast(accent, bg, 4.5)
  const surface = dark ? mixColor(bg, '#ffffff', 0.05) : mixColor(bg, '#ffffff', 0.72)
  const sidebar = dark ? mixColor(bg, '#ffffff', 0.03) : mixColor(bg, '#000000', 0.02)
  const subtle = dark ? mixColor(bg, '#ffffff', 0.08) : mixColor(bg, '#000000', 0.04)
  return `  --accent: ${accent};
  --accent-hover: ${mixColor(accent, dark ? '#ffffff' : '#000000', 0.1)};
  --accent-active: ${mixColor(accent, dark ? '#ffffff' : '#000000', 0.18)};
  --accent-subtle: ${mixColor(accent, bg, 0.86)};
  --accent-fg: ${accentForeground(accent)};
  --accent-text: ${accentText};
  --bg-app: ${bg};
  --bg-surface: ${surface};
  --bg-subtle: ${subtle};
  --bg-sidebar: ${sidebar};
  --text-primary: ${fg};
  --text-secondary: ${mixColor(fg, bg, 0.28)};
  --text-tertiary: ${mixColor(fg, bg, 0.45)};`
}

export function applyAppearance(pref: AppearancePref): void {
  const root = document.documentElement
  let el = document.getElementById('ajuan-appearance') as HTMLStyleElement | null
  if (!el) {
    el = document.createElement('style')
    el.id = 'ajuan-appearance'
    document.head.appendChild(el)
  }
  el.textContent = appearanceCss(pref)

  if (pref.reduceMotion === 'system') root.removeAttribute('data-reduce-motion')
  else root.setAttribute('data-reduce-motion', pref.reduceMotion === 'on' ? 'true' : 'false')
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}
