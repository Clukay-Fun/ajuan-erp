import type { LucideIcon } from 'lucide-react'
import { LayoutDashboard, Package, FileText, Settings } from 'lucide-react'

export type RouteKey = 'overview' | 'products' | 'documents' | 'settings'

export interface RouteDef {
  key: RouteKey
  label: string
  icon: LucideIcon
}

// 主导航：概览（含汇总）/ 商品（含库存流水）/ 单据；设置放在侧栏底部。
export const PRIMARY_ROUTES: RouteDef[] = [
  { key: 'overview', label: '概览', icon: LayoutDashboard },
  { key: 'products', label: '商品', icon: Package },
  { key: 'documents', label: '单据', icon: FileText }
]

export const SETTINGS_ROUTE: RouteDef = { key: 'settings', label: '设置', icon: Settings }
