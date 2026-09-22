export type ThemePreference = 'system' | 'light' | 'dark'

const KEY = 'ajuan.theme'

export function readThemePreference(): ThemePreference {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

/** 写到 <html data-theme>，tokens.css 据此切换；system 时移除属性交给 prefers-color-scheme。 */
export function applyTheme(pref: ThemePreference): void {
  const root = document.documentElement
  if (pref === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', pref)
  try {
    localStorage.setItem(KEY, pref)
  } catch {
    /* 私密模式等情况下忽略 */
  }
}
