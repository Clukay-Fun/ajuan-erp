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

  // Windows 平台同步更新原生控制按钮 overlay 颜色
  try {
    const isDark = pref === 'dark' || (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    window.ajuan?.app?.setTitleBarOverlay?.({
      color: isDark ? '#121417' : '#f8fafc',
      symbolColor: isDark ? '#9ba1a6' : '#64748b',
      height: 40
    })
  } catch {
    /* 忽略非桌面环境异常 */
  }
}
