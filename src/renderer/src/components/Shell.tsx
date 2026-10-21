/**
 * 描述: 工作台全局外壳组件 (Shell)
 * 主要功能:
 *   - 固定宽度主侧栏（不提供收起）；进入设置后整体替换为设置专属导航
 *   - macOS 沉浸式标题栏与安全红绿灯拖拽避让区
 *   - 「开单」分体按钮，支持出库单 (⌘N)、入库单 (⇧⌘N)、库存调整与 CSV 导入
 *   - 单据草稿数 (琥珀色) 与定制失败数 (红色) 实时角标统计
 *   - 集成 ⌘K 全局命令中心与统一键盘快捷键流
 */

import React, { useState, useEffect, type ReactNode } from 'react'
import { LayoutDashboard, Package, FileText, Layers, Settings, Plus, ChevronDown } from 'lucide-react'
import { unwrap } from '@/lib/api'
import { Menu, type MenuItemOption } from '@/components/ui'
import { CommandPalette } from '@/components/CommandPalette'
import { SettingsNav } from '@/components/SettingsNav'
import type { RouteKey } from '@/app/routes'
import type { SettingsSectionKey } from '@/pages/settingsSections'
import styles from './Shell.module.css'

export interface ShellProps {
  route: RouteKey
  seq: number
  onNavigate: (key: RouteKey) => void
  onAction?: (actionId: string, payload?: any) => void
  settingsSection?: SettingsSectionKey
  onSelectSettingsSection?: (key: SettingsSectionKey) => void
  onBackToApp?: () => void
  children: ReactNode
}

// #region Shell 核心外壳组件

/**
 * 用处: 桌面应用顶层统一工作台外壳
 * 参数:
 *   - route: 当前激活的一级页面
 *   - onNavigate: 页面路由切换函数
 *   - onAction: 全局动作分发钩子（如开单、导入等）
 * 功能:
 *   - 红绿灯占位与全局命令面板
 */
export function Shell({
  route,
  seq,
  onNavigate,
  onAction,
  settingsSection = 'appearance',
  onSelectSettingsSection,
  onBackToApp,
  children
}: ShellProps): React.JSX.Element {
  const [draftCount, setDraftCount] = useState<number>(0)
  const [failedJobsCount, setFailedJobsCount] = useState<number>(0)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const isSettings = route === 'settings'

  // 拉取单据草稿数与定制生产失败任务数
  useEffect(() => {
    unwrap(window.ajuan.documents.list({ status: 'draft' }))
      .then((docs) => setDraftCount(docs.length))
      .catch(() => setDraftCount(0))

    unwrap(window.ajuan.psd.getBoard())
      .then((board) => {
        const failed = (board.jobs || []).filter((j) => j.status === 'failed').length
        setFailedJobsCount(failed)
      })
      .catch(() => setFailedJobsCount(0))
  }, [seq, route])

  // 全局快捷键监听 (⌘K, ⌘1~5, ⌘N, ⇧⌘N)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      const isCmdOrCtrl = e.metaKey || e.ctrlKey
      const target = e.target as HTMLElement | null
      const isInput =
        target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)

      // 输入框聚焦时只响应组合键
      if (isInput && !isCmdOrCtrl) return

      // ⌘K 命令面板
      if (isCmdOrCtrl && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCommandPaletteOpen((prev) => !prev)
        return
      }

      // ⌘N 新建出库单 / ⇧⌘N 新建入库单
      if (isCmdOrCtrl && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        if (e.shiftKey) {
          onAction?.('new-inbound')
        } else {
          onAction?.('new-outbound')
        }
        return
      }

      // ⌘1 ~ ⌘5 页面快速切换
      if (isCmdOrCtrl && !e.shiftKey && !e.altKey) {
        if (e.key === '1') {
          e.preventDefault()
          onNavigate('overview')
        } else if (e.key === '2') {
          e.preventDefault()
          onNavigate('products')
        } else if (e.key === '3') {
          e.preventDefault()
          onNavigate('documents')
        } else if (e.key === '4') {
          e.preventDefault()
          onNavigate('psd')
        } else if (e.key === '5') {
          e.preventDefault()
          onNavigate('settings')
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onNavigate, onAction])

  // 开单菜单选项
  const actionMenuItems: Array<MenuItemOption | 'separator'> = [
    {
      key: 'outbound',
      label: '出库单',
      shortcut: '⌘N',
      onClick: () => onAction?.('new-outbound')
    },
    {
      key: 'inbound',
      label: '入库单',
      shortcut: '⇧⌘N',
      onClick: () => onAction?.('new-inbound')
    },
    'separator',
    {
      key: 'adjustment',
      label: '库存调整',
      onClick: () => onAction?.('new-adjustment')
    },
    {
      key: 'csv-import',
      label: '导入 CSV',
      onClick: () => onAction?.('import-csv')
    }
  ]

  const renderNavItem = (
    key: RouteKey,
    label: string,
    icon: React.ReactNode,
    badgeCount?: number,
    badgeVariant?: 'draft' | 'error'
  ): React.JSX.Element => {
    const isActive = route === key

    return (
      <button
        type="button"
        className={`${styles.navItem} ${isActive ? styles.active : ''}`}
        onClick={() => onNavigate(key)}
        aria-current={isActive ? 'page' : undefined}
      >
        <span className={styles.navIcon}>{icon}</span>
        <span className={styles.navLabel}>{label}</span>
        {badgeCount !== undefined && badgeCount > 0 && (
          <span className={`${styles.badge} ${badgeVariant === 'error' ? styles.badgeError : styles.badgeDraft}`}>
            {badgeCount}
          </span>
        )}
      </button>
    )
  }

  return (
    <div className={styles.shell}>
      {/* 统一桌面侧栏；设置模式下整体替换为设置导航 */}
      <aside className={`${styles.sidebar} ${isSettings ? styles.settingsSidebar : ''}`}>
        {isSettings ? (
          <>
            <div className={styles.dragArea} />
            <SettingsNav
              active={settingsSection}
              onSelect={(key) => onSelectSettingsSection?.(key)}
              onBack={() => onBackToApp?.()}
            />
          </>
        ) : (
          <>
            {/* macOS 红绿灯留白区 */}
            <div className={styles.dragArea} />

            {/* 开单分体按钮 */}
            <div className={styles.actionArea}>
              <div className={styles.splitButton}>
                <button
                  type="button"
                  className={styles.splitMain}
                  onClick={() => onAction?.('new-outbound')}
                  title="新建出库单 (⌘N)"
                >
                  <Plus size={14} />
                  <span>新建出库单</span>
                </button>

                <Menu
                  side="bottom"
                  align="end"
                  trigger={
                    <button type="button" className={styles.splitTrigger} aria-label="更多开单选项">
                      <ChevronDown size={14} />
                    </button>
                  }
                  items={actionMenuItems}
                />
              </div>
            </div>

            {/* 主导航区 */}
            <nav className={styles.nav} aria-label="应用主导航">
              {renderNavItem('overview', '概览', <LayoutDashboard size={18} />)}
              {renderNavItem('products', '商品', <Package size={18} />)}
              {renderNavItem('documents', '单据', <FileText size={18} />, draftCount, 'draft')}
              {renderNavItem('psd', '定制', <Layers size={18} />, failedJobsCount, 'error')}
            </nav>

            <div className={styles.footerArea}>{renderNavItem('settings', '设置', <Settings size={18} />)}</div>
          </>
        )}
      </aside>

      {/* 主视图内容视口：页面层各自滚动，切换时保留滚动位置 */}
      <main className={styles.content}>
        <div className={styles.contentInner}>{children}</div>
      </main>

      {/* ⌘K 全局命令面板 */}
      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        onNavigate={onNavigate}
        onAction={onAction}
      />
    </div>
  )
}

// #endregion
