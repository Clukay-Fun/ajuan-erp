/**
 * 描述: 全局命令面板组件 (CommandPalette / ⌘K)
 * 主要功能:
 *   - 居中快速检索全局操作、页面跳转、商品画像与历史单据
 *   - 键盘上下键聚焦与回车触发，支持 ⌘Enter 针对选中商品直接开单
 *   - 搜索框为空时呈现常用动作与最近访问记录
 */

import React, { useState, useEffect, useRef, useMemo, type ReactNode } from 'react'
import { Dialog } from '@base-ui/react'
import {
  Search,
  Plus,
  ArrowRight,
  Layers,
  Database,
  Upload,
  Download,
  Package,
  FileText,
  Sliders,
  Settings,
  LayoutDashboard
} from 'lucide-react'
import { unwrap } from '@/lib/api'
import type { RouteKey } from '@/app/routes'
import type { Product, DocumentSummary } from '@shared/types'
import styles from './CommandPalette.module.css'

export interface CommandItem {
  id: string
  group: '操作' | '跳转' | '商品' | '单据'
  title: string
  subtitle?: string
  icon: ReactNode
  shortcut?: string
  onSelect: (modifiers?: { metaKey?: boolean }) => void
}

export interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onNavigate: (route: RouteKey) => void
  onAction?: (actionId: string, payload?: any) => void
}

// #region CommandPalette 核心组件

export function CommandPalette({
  open,
  onOpenChange,
  onNavigate,
  onAction
}: CommandPaletteProps): React.JSX.Element | null {
  const [query, setQuery] = useState('')
  const [highlightIndex, setHighlightIndex] = useState(0)
  const [products, setProducts] = useState<Product[]>([])
  const [documents, setDocuments] = useState<DocumentSummary[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  // 每次打开面板时，获取最新的商品与最近单据
  useEffect(() => {
    if (!open) {
      setQuery('')
      setHighlightIndex(0)
      return
    }

    unwrap(window.ajuan.products.list())
      .then((p) => setProducts(p))
      .catch(() => {})

    unwrap(window.ajuan.documents.list({ limit: 10 }))
      .then((d) => setDocuments(d))
      .catch(() => {})

    setTimeout(() => {
      inputRef.current?.focus()
    }, 50)
  }, [open])

  // 构建操作列表
  const actionItems: CommandItem[] = useMemo(
    () => [
      {
        id: 'new-outbound',
        group: '操作',
        title: '新建出库单',
        subtitle: '销售发货出库',
        icon: <Plus size={16} />,
        shortcut: '⌘N',
        onSelect: () => {
          onAction?.('new-outbound')
          onOpenChange(false)
        }
      },
      {
        id: 'new-inbound',
        group: '操作',
        title: '新建入库单',
        subtitle: '采购成品入库',
        icon: <Plus size={16} />,
        shortcut: '⇧⌘N',
        onSelect: () => {
          onAction?.('new-inbound')
          onOpenChange(false)
        }
      },
      {
        id: 'new-adjustment',
        group: '操作',
        title: '库存调整',
        subtitle: '盘亏或盘盈调整',
        icon: <Sliders size={16} />,
        onSelect: () => {
          onAction?.('new-adjustment')
          onOpenChange(false)
        }
      },
      {
        id: 'new-product',
        group: '操作',
        title: '新建商品',
        subtitle: '录入新 SKU 档案',
        icon: <Package size={16} />,
        onSelect: () => {
          onAction?.('new-product')
          onOpenChange(false)
        }
      },
      {
        id: 'import-csv',
        group: '操作',
        title: '导入 CSV',
        subtitle: '批量导入历史单据',
        icon: <Upload size={16} />,
        onSelect: () => {
          onAction?.('import-csv')
          onOpenChange(false)
        }
      },
      {
        id: 'export-movements',
        group: '操作',
        title: '导出全部流水',
        subtitle: '导出流水为 CSV',
        icon: <Download size={16} />,
        onSelect: () => {
          onAction?.('export-movements')
          onOpenChange(false)
        }
      },
      {
        id: 'psd-production',
        group: '操作',
        title: '开始定制生产',
        subtitle: '跳转并准备生成作业',
        icon: <Layers size={16} />,
        onSelect: () => {
          onNavigate('psd')
          onOpenChange(false)
        }
      },
      {
        id: 'backup-create',
        group: '操作',
        title: '创建备份',
        subtitle: '打包导出数据库与附件',
        icon: <Database size={16} />,
        onSelect: () => {
          onAction?.('backup-create')
          onOpenChange(false)
        }
      }
    ],
    [onAction, onNavigate, onOpenChange]
  )

  // 页面跳转列表
  const navItems: CommandItem[] = useMemo(
    () => [
      {
        id: 'nav-overview',
        group: '跳转',
        title: '概览',
        subtitle: '工作台首页与汇总',
        icon: <LayoutDashboard size={16} />,
        shortcut: '⌘1',
        onSelect: () => {
          onNavigate('overview')
          onOpenChange(false)
        }
      },
      {
        id: 'nav-products',
        group: '跳转',
        title: '商品',
        subtitle: '商品画像与库存流水',
        icon: <Package size={16} />,
        shortcut: '⌘2',
        onSelect: () => {
          onNavigate('products')
          onOpenChange(false)
        }
      },
      {
        id: 'nav-documents',
        group: '跳转',
        title: '单据',
        subtitle: '出入库与审核中心',
        icon: <FileText size={16} />,
        shortcut: '⌘3',
        onSelect: () => {
          onNavigate('documents')
          onOpenChange(false)
        }
      },
      {
        id: 'nav-psd',
        group: '跳转',
        title: '定制',
        subtitle: 'Photoshop 生产看板',
        icon: <Layers size={16} />,
        shortcut: '⌘4',
        onSelect: () => {
          onNavigate('psd')
          onOpenChange(false)
        }
      },
      {
        id: 'nav-settings',
        group: '跳转',
        title: '设置',
        subtitle: '外观、渠道与数据管理',
        icon: <Settings size={16} />,
        shortcut: '⌘5',
        onSelect: () => {
          onNavigate('settings')
          onOpenChange(false)
        }
      }
    ],
    [onNavigate, onOpenChange]
  )

  // 过滤后的全量结果集合
  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase()

    if (!q) {
      return [
        { name: '操作', items: actionItems },
        { name: '跳转', items: navItems }
      ]
    }

    const matchedActions = actionItems.filter(
      (item) => item.title.toLowerCase().includes(q) || (item.subtitle && item.subtitle.toLowerCase().includes(q))
    )

    const matchedNavs = navItems.filter(
      (item) => item.title.toLowerCase().includes(q) || (item.subtitle && item.subtitle.toLowerCase().includes(q))
    )

    const matchedProducts: CommandItem[] = products
      .filter((p) => {
        const name = (p.name || '').toLowerCase()
        const code = (p.code || '').toLowerCase()
        const sku = (p.defaultSku?.code || '').toLowerCase()
        return name.includes(q) || code.includes(q) || sku.includes(q)
      })
      .slice(0, 8)
      .map((p) => ({
        id: `prod-${p.id}`,
        group: '商品',
        title: p.name,
        subtitle: `${p.code} ${p.defaultSku?.code ? `· ${p.defaultSku.code}` : ''}`,
        icon: <Package size={16} />,
        shortcut: '↵ 查看 / ⌘↵ 开单',
        onSelect: (modifiers) => {
          if (modifiers?.metaKey) {
            onAction?.('new-outbound-for-product', p)
          } else {
            onAction?.('open-product', p.id)
          }
          onOpenChange(false)
        }
      }))

    const matchedDocs: CommandItem[] = documents
      .filter((d) => {
        const docNo = (d.docNo || '').toLowerCase()
        const ext = (d.externalOrderNo || '').toLowerCase()
        return docNo.includes(q) || ext.includes(q)
      })
      .slice(0, 8)
      .map((d) => ({
        id: `doc-${d.id}`,
        group: '单据',
        title: d.docNo,
        subtitle: `${d.type === 'inbound' ? '入库' : d.type === 'outbound' ? '出库' : '单据'} · ${d.docDate}`,
        icon: <FileText size={16} />,
        onSelect: () => {
          onAction?.('open-document', d.id)
          onOpenChange(false)
        }
      }))

    const groups: Array<{ name: string; items: CommandItem[] }> = []
    if (matchedActions.length > 0) groups.push({ name: '操作', items: matchedActions })
    if (matchedNavs.length > 0) groups.push({ name: '跳转', items: matchedNavs })
    if (matchedProducts.length > 0) groups.push({ name: '商品', items: matchedProducts })
    if (matchedDocs.length > 0) groups.push({ name: '单据', items: matchedDocs })

    return groups
  }, [query, actionItems, navItems, products, documents, onAction, onOpenChange])

  const flatItems = useMemo(() => filteredGroups.flatMap((g) => g.items), [filteredGroups])

  // 保证 highlightIndex 不溢出
  useEffect(() => {
    if (highlightIndex >= flatItems.length) {
      setHighlightIndex(Math.max(0, flatItems.length - 1))
    }
  }, [flatItems, highlightIndex])

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIndex((prev) => (prev < flatItems.length - 1 ? prev + 1 : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIndex((prev) => (prev > 0 ? prev - 1 : flatItems.length - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const target = flatItems[highlightIndex]
      if (target) {
        target.onSelect({ metaKey: e.metaKey || e.ctrlKey })
      }
    } else if (e.key === 'Escape') {
      onOpenChange(false)
    }
  }

  let globalItemIndex = 0

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className={styles.backdrop} />
        <Dialog.Popup className={styles.popup} onKeyDown={handleKeyDown}>
          <div className={styles.searchHeader}>
            <span className={styles.searchIcon}>
              <Search size={16} />
            </span>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setHighlightIndex(0)
              }}
              placeholder="搜索操作、商品、单据或快捷跳转..."
              className={styles.searchInput}
            />
            <span className={styles.escHint}>ESC</span>
          </div>

          <div className={styles.resultsList}>
            {flatItems.length === 0 ? (
              <div className={styles.empty}>未找到匹配的项目</div>
            ) : (
              filteredGroups.map((group) => (
                <div key={group.name} className={styles.group}>
                  <div className={styles.groupTitle}>{group.name}</div>
                  {group.items.map((item) => {
                    const currentIndex = globalItemIndex++
                    const isHighlighted = currentIndex === highlightIndex

                    return (
                      <div
                        key={item.id}
                        className={`${styles.item} ${isHighlighted ? styles.highlighted : ''}`}
                        onClick={(e) => item.onSelect({ metaKey: e.metaKey || e.ctrlKey })}
                        onMouseEnter={() => setHighlightIndex(currentIndex)}
                      >
                        <div className={styles.itemLeft}>
                          <span className={styles.itemIcon}>{item.icon}</span>
                          <span className={styles.itemLabel}>{item.title}</span>
                          {item.subtitle && <span className={styles.itemSublabel}>{item.subtitle}</span>}
                        </div>

                        <div className={styles.itemRight}>
                          {item.shortcut && <span className={styles.itemShortcut}>{item.shortcut}</span>}
                          <ArrowRight size={12} style={{ opacity: isHighlighted ? 0.8 : 0 }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))
            )}
          </div>

          <div className={styles.footer}>
            <div className={styles.footerHints}>
              <span>↑↓ 切换</span>
              <span>↵ 确认</span>
              <span>⌘↵ 直接开单</span>
            </div>
            <span>阿卷 ERP 命令中心</span>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

// #endregion
