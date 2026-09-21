import type { LucideIcon } from 'lucide-react'
import { LayoutDashboard, Package, ArrowLeftRight, FileText, BarChart3, Settings } from 'lucide-react'

export type RouteKey = 'overview' | 'products' | 'inventory' | 'documents' | 'summary' | 'settings'

export interface RouteDef {
  key: RouteKey
  label: string
  icon: LucideIcon
}

// 主导航：概览 / 商品 / 库存 / 单据 / 汇总；设置放在侧栏底部。
export const PRIMARY_ROUTES: RouteDef[] = [
  { key: 'overview', label: '概览', icon: LayoutDashboard },
  { key: 'products', label: '商品', icon: Package },
  { key: 'inventory', label: '库存', icon: ArrowLeftRight },
  { key: 'documents', label: '单据', icon: FileText },
  { key: 'summary', label: '汇总', icon: BarChart3 }
]

export const SETTINGS_ROUTE: RouteDef = { key: 'settings', label: '设置', icon: Settings }
