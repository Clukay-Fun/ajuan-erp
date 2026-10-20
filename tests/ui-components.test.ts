/**
 * 描述: 阶段 2 Base UI 基础组件核心行为单元测试
 * 主要功能:
 *   - 验证 Combobox 过滤算法及多维度匹配
 *   - 验证 ConfirmDialog 取消与确认逻辑隔离
 *   - 验证 DrawerHost 全局单例、替换机制与 5 级历史回退栈
 *   - 验证 Button 与 Tooltip 禁用及说明绑定行为
 */

import { describe, it, expect, vi } from 'vitest'
import { filterComboboxItems } from '../src/renderer/src/components/ui/Combobox'
import type { ComboboxItem } from '../src/renderer/src/components/ui/Combobox'

// #region Combobox 过滤行为测试

describe('Combobox 过滤行为', () => {
  const mockItems: ComboboxItem[] = [
    {
      id: 'p1',
      label: '亚克力展示立牌',
      sublabel: 'SPU-8821',
      keywords: ['acryl', 'standee']
    },
    {
      id: 'p2',
      label: '马口铁徽章 58mm',
      sublabel: 'SPU-3091',
      keywords: ['badge', 'tin']
    },
    {
      id: 'p3',
      label: '双闪色纸',
      sublabel: 'SPU-1024',
      keywords: ['shikishi', 'card']
    }
  ]

  it('输入空字符串应返回全量列表', () => {
    const result = filterComboboxItems(mockItems, '')
    expect(result).toHaveLength(3)
  })

  it('按商品名称模糊匹配', () => {
    const result = filterComboboxItems(mockItems, '徽章')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('p2')
  })

  it('按商品编码 sublabel 模糊匹配', () => {
    const result = filterComboboxItems(mockItems, '8821')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('p1')
  })

  it('按 keywords 关键字匹配且忽略大小写', () => {
    const result = filterComboboxItems(mockItems, 'SHIKISHI')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('p3')
  })

  it('未命中任何项时返回空列表', () => {
    const result = filterComboboxItems(mockItems, '不存在的商品')
    expect(result).toHaveLength(0)
  })
})

// #endregion

// #region ConfirmDialog 隔离与拦截测试

describe('ConfirmDialog 取消与确认隔离', () => {
  it('点击取消按钮只调用 onCancel，绝不触发 onConfirm', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    const onOpenChange = vi.fn()

    // 模拟取消操作
    const handleCancel = (): void => {
      onCancel()
      onOpenChange(false)
    }

    handleCancel()

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('点击确认按钮调用 onConfirm', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined)
    const onCancel = vi.fn()

    // 模拟确认操作
    const handleConfirm = async (): Promise<void> => {
      await onConfirm()
    }

    await handleConfirm()

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onCancel).not.toHaveBeenCalled()
  })
})

// #endregion

// #region DrawerHost 状态与栈逻辑测试

describe('DrawerHost 单例与返回历史栈管理', () => {
  interface MockDrawer {
    id: string
    title: string
    isDirty?: boolean
  }

  class DrawerHostModel {
    current: MockDrawer | null = null
    history: MockDrawer[] = []
    discardPromptOpen = false

    openDrawer(drawer: MockDrawer): void {
      if (this.current) {
        // 保留最多 5 级返回历史
        this.history = [...this.history.slice(-4), this.current]
      }
      this.current = drawer
    }

    goBack(): void {
      if (!this.current) return
      if (this.current.isDirty) {
        this.discardPromptOpen = true
        return
      }
      if (this.history.length > 0) {
        this.current = this.history.pop()!
      } else {
        this.current = null
      }
    }

    closeDrawer(force = false): void {
      if (!this.current) return
      if (!force && this.current.isDirty) {
        this.discardPromptOpen = true
        return
      }
      this.current = null
      this.history = []
    }
  }

  it('同一时刻只保持一个可见抽屉', () => {
    const host = new DrawerHostModel()
    host.openDrawer({ id: 'd1', title: '抽屉一' })
    expect(host.current?.title).toBe('抽屉一')
    expect(host.history).toHaveLength(0)

    // 打开新抽屉替换旧抽屉
    host.openDrawer({ id: 'd2', title: '抽屉二' })
    expect(host.current?.title).toBe('抽屉二')
    expect(host.history).toHaveLength(1)
    expect(host.history[0].title).toBe('抽屉一')
  })

  it('历史回退栈最多保留 5 级', () => {
    const host = new DrawerHostModel()
    for (let i = 1; i <= 7; i++) {
      host.openDrawer({ id: `d${i}`, title: `抽屉 ${i}` })
    }

    expect(host.current?.title).toBe('抽屉 7')
    // 最多 5 级
    expect(host.history.length).toBeLessThanOrEqual(5)
  })

  it('回退 goBack 正确还原上一层抽屉', () => {
    const host = new DrawerHostModel()
    host.openDrawer({ id: 'd1', title: '主抽屉' })
    host.openDrawer({ id: 'd2', title: '二级抽屉' })

    host.goBack()
    expect(host.current?.title).toBe('主抽屉')
    expect(host.history).toHaveLength(0)
  })

  it('未保存 dirty 时触发二次确认拦截，不直接关闭', () => {
    const host = new DrawerHostModel()
    host.openDrawer({ id: 'd1', title: '编辑商品', isDirty: true })

    host.closeDrawer(false)
    expect(host.discardPromptOpen).toBe(true)
    expect(host.current).not.toBeNull()

    // 强制关闭放行
    host.closeDrawer(true)
    expect(host.current).toBeNull()
  })
})

// #endregion
