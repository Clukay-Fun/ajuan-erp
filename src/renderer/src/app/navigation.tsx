import type { ReactElement, ReactNode } from 'react'
import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { RouteKey } from './routes'
import type { DocumentType } from '@shared/types'

export type DocumentsView =
  | { view: 'list' }
  | { view: 'new'; type: DocumentType }
  | { view: 'edit'; id: number }
  | { view: 'detail'; id: number }

export interface RouteParams {
  documents?: DocumentsView
}

export interface Location {
  key: RouteKey
  params: RouteParams
  /** 每次 navigate 递增；页面以此为 key 重新挂载，保证重新进入时数据刷新 */
  seq: number
}

interface Nav {
  location: Location
  navigate: (key: RouteKey, params?: RouteParams) => void
}

const NavContext = createContext<Nav | null>(null)

export function NavProvider({ children }: { children: ReactNode }): ReactElement {
  const [location, setLocation] = useState<Location>({ key: 'overview', params: {}, seq: 0 })
  const navigate = useCallback(
    (key: RouteKey, params: RouteParams = {}) => setLocation((l) => ({ key, params, seq: l.seq + 1 })),
    []
  )
  const value = useMemo(() => ({ location, navigate }), [location, navigate])
  return <NavContext.Provider value={value}>{children}</NavContext.Provider>
}

export function useNav(): Nav {
  const ctx = useContext(NavContext)
  if (!ctx) throw new Error('useNav must be used within NavProvider')
  return ctx
}
