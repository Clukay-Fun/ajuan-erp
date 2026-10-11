import { useEffect } from 'react'
import { useNav } from './navigation'
import { PRIMARY_ROUTES } from './routes'

const isMac = navigator.platform.toUpperCase().includes('MAC')

/**
 * 全局快捷键（⌘ / Ctrl）：
 * N 新建入库 · ⇧N 新建出库 · 1–4 切换主导航 · , 设置
 * 键盘触发的切换不带动效感知问题：页面本身就是重新挂载。
 */
export function useShortcuts(): void {
  const { navigate } = useNav()
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const mod = isMac ? e.metaKey : e.ctrlKey
      if (!mod || e.altKey) return
      const key = e.key.toLowerCase()
      if (key === 'n') {
        e.preventDefault()
        navigate('documents', { documents: { view: 'new', type: e.shiftKey ? 'outbound' : 'inbound' } })
      } else if (key === ',') {
        e.preventDefault()
        navigate('settings')
      } else if (/^[1-4]$/.test(key) && !e.shiftKey) {
        const route = PRIMARY_ROUTES[Number(key) - 1]
        if (route) {
          e.preventDefault()
          navigate(route.key)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate])
}
