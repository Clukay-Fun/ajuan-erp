/**
 * 描述: 商品管理工作台列表页面 (ProductsPage)
 * 主要功能:
 *   - 列表整块面板撑满视口高度，内嵌搜索与停用过滤
 *   - 严格呈现商品名称、编码、SKU、库存、可售天数、成本、售价与健康徽标
 *   - 预警值单元格双击支持就地编辑，按 Enter 保存，按 Esc 取消
 *   - 全面收敛为右侧抽屉流（查看、编辑、新建、期初、库存调整），杜绝居中弹窗套弹窗
 *   - 支持导出全部流水与 CSV 导入
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Plus, MoreVertical, Upload, Download, ImageIcon } from 'lucide-react'
import type { StockRow, Product } from '@shared/types'
import type { ProductHealthItem } from '@shared/schemas'
import {
  Button,
  IconButton,
  Input,
  NumberInput,
  StockBadge,
  isStockAlert,
  Menu,
  TableEmpty,
  useDrawer
} from '@/components/ui'
import { useToast } from '@/components/Toast'
import { unwrap, errorMessage } from '@/lib/api'
import { formatCents, formatQty } from '@/lib/format'
import { productImageUrl } from '@/features/products/ProductImage'
import { useEntityDrawers } from '@/app/entityDrawers'
import { useDataChanged } from '@/lib/dataEvents'
import { usePageActive } from '@/app/usePageActive'
import styles from './ProductsPage.module.css'

// #region ProductsPage 组件实现

/**
 * 用处: 商品档案与库存全景列表页
 * 功能:
 *   - 集中掌控全量商品库存健康、流转成本与资料维护
 */
export function ProductsPage(): React.JSX.Element {
  const toast = useToast()
  const { activation } = usePageActive('products')
  const { currentDrawer } = useDrawer()
  const { openProduct, newProduct, openImport } = useEntityDrawers()

  const [rows, setRows] = useState<StockRow[] | null>(null)
  const [healthItems, setHealthItems] = useState<ProductHealthItem[]>([])
  const [loadError, setLoadError] = useState<boolean>(false)
  const [loading, setLoading] = useState<boolean>(true)
  const [search, setSearch] = useState<string>('')
  const [showInactive, setShowInactive] = useState<boolean>(false)
  const [exporting, setExporting] = useState<boolean>(false)

  // 预警值就地行内编辑
  const [editingThresholdId, setEditingThresholdId] = useState<number | null>(null)
  const [thresholdDraft, setThresholdDraft] = useState<number>(0)

  // #region 数据载入与刷新

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [stockList, healthList] = await Promise.all([
        unwrap(window.ajuan.inventory.listStock()),
        unwrap(window.ajuan.stats.getProductHealth())
      ])
      setRows(stockList)
      setHealthItems(healthList)
      setLoadError(false)
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  // 从别的页面切回来时刷新库存与健康度
  useEffect(() => {
    if (activation > 0) void loadData()
  }, [activation, loadData])

  // #endregion

  // #region 抽屉唤起交互

  // 抽屉里写入成功后（编辑、调整、期初、导入）刷新列表
  useDataChanged(() => void loadData())

  // #endregion

  // #region 预警值双击就地保存

  const handleStartEditThreshold = (e: React.MouseEvent, p: Product): void => {
    e.stopPropagation()
    setEditingThresholdId(p.id)
    setThresholdDraft(p.lowStockThreshold)
  }

  const handleSaveThreshold = async (p: Product): Promise<void> => {
    try {
      await unwrap(
        window.ajuan.products.update(p.id, {
          code: p.code,
          name: p.name,
          unit: p.unit,
          defaultCostCents: p.defaultCostCents,
          defaultPriceCents: p.defaultPriceCents,
          lowStockThreshold: thresholdDraft,
          isActive: p.isActive
        })
      )
      toast(`预警值已更新为 ${thresholdDraft}`, 'success')
      setEditingThresholdId(null)
      await loadData()
    } catch (err) {
      toast(errorMessage(err), 'error')
    }
  }

  // #endregion

  // #region 过滤与数据计算

  const filteredRows = useMemo(() => {
    if (!rows) return []
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (!showInactive && !r.product.isActive) return false
      if (!q) return true
      return (
        r.product.name.toLowerCase().includes(q) ||
        r.product.code.toLowerCase().includes(q) ||
        r.product.defaultSku.code.toLowerCase().includes(q)
      )
    })
  }, [rows, search, showInactive])

  // 导出全量变动流水
  const handleExportAllMovements = async (): Promise<void> => {
    setExporting(true)
    try {
      const p = await unwrap(window.ajuan.csv.exportMovements({}))
      if (p) toast(`已导出全部流水到: ${p}`, 'success')
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setExporting(false)
    }
  }

  const moreMenuItems = [
    {
      key: 'import-csv',
      label: '导入 CSV',
      icon: <Upload size={14} />,
      onClick: openImport
    },
    {
      key: 'export-all-movements',
      label: exporting ? '正在导出…' : '导出全部流水 CSV',
      icon: <Download size={14} />,
      disabled: exporting,
      onClick: handleExportAllMovements
    }
  ]

  // #endregion

  return (
    <div className={styles.container}>
      {/* 顶部页头与核心操作 */}
      <header className={styles.headerRow}>
        <h1 className="srOnly">商品</h1>
        <div className={styles.headerActions}>
          <Button variant="primary" onClick={newProduct}>
            <Plus size={16} /> 新建商品
          </Button>
          <Menu
            trigger={<IconButton label="更多选项" icon={<MoreVertical size={16} />} variant="secondary" />}
            items={moreMenuItems}
          />
        </div>
      </header>

      {/* 主面板撑满视口高度 */}
      <main className={styles.mainPanel}>
        {/* 工具行 */}
        <div className={styles.toolbar}>
          <div className={styles.searchBox}>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索商品名称 / 编码 / SKU" />
          </div>

          <div className={styles.toolRight}>
            <span className={styles.countText}>共 {filteredRows.length} 个商品</span>
            <label className={styles.switchLabel}>
              <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
              <span>显示已停用</span>
            </label>
          </div>
        </div>

        {loadError && (
          <div className={styles.loadError} role="alert">
            <span>
              <strong>读取失败</strong>商品与库存数据未能加载。
            </span>
            <Button size="sm" variant="secondary" onClick={() => void loadData()} disabled={loading}>
              {loading ? '重试中…' : '重试'}
            </Button>
          </div>
        )}

        {/* 表格视口 */}
        <div className={styles.tableWrap}>
          <table className={styles.productTable}>
            <colgroup>
              <col className={styles.colProduct} />
              <col className={styles.colSku} />
              <col className={styles.colStock} />
              <col className={styles.colDays} />
              <col className={styles.colCost} />
              <col className={styles.colPrice} />
              <col className={styles.colThreshold} />
              <col className={styles.colStatus} />
            </colgroup>
            <thead>
              <tr>
                <th>商品</th>
                <th>SKU</th>
                <th className={styles.num}>当前库存</th>
                <th className={styles.num}>可售天数</th>
                <th className={styles.num}>平均成本</th>
                <th className={styles.num}>售价</th>
                <th className={styles.num}>预警值</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              {!rows ? (
                <TableEmpty
                  cols={8}
                  title={loadError ? '读取失败' : '正在读取商品…'}
                  description={loadError ? '请重试以重新加载商品与库存数据。' : undefined}
                />
              ) : filteredRows.length === 0 ? (
                <TableEmpty cols={8} title="暂无符合条件的商品记录" />
              ) : (
                filteredRows.map((r) => {
                  const p = r.product
                  const h = healthItems.find((item) => item.productId === p.id)
                  const url = productImageUrl(p)
                  const isSelected = currentDrawer?.id === `product-${p.id}`
                  const isCritical = h?.status === 'out' || h?.status === 'critical'
                  const isWarning = h?.status === 'low'
                  const isEditingThreshold = editingThresholdId === p.id

                  const rowClass = [
                    styles.tableRow,
                    isSelected ? styles.selected : '',
                    isCritical ? styles.isCritical : isWarning ? styles.isWarning : '',
                    !p.isActive ? styles.inactive : ''
                  ]
                    .filter(Boolean)
                    .join(' ')

                  return (
                    <tr
                      key={p.id}
                      className={rowClass}
                      onClick={() => void openProduct(p.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                          e.preventDefault()
                          void openProduct(p.id)
                        }
                      }}
                    >
                      {/* 商品列（缩略图 + 品牌色名称 + 编码） */}
                      <td>
                        <div className={styles.productCell}>
                          <span className={styles.thumb}>
                            {url ? (
                              <img src={url} alt="" />
                            ) : (
                              <ImageIcon size={14} className={styles.thumbPlaceholder} />
                            )}
                          </span>
                          <span className={styles.nameMeta}>
                            <span className={styles.productName} title={p.name}>
                              {p.name}
                            </span>
                            <span className={styles.productCode}>{p.code}</span>
                          </span>
                        </div>
                      </td>

                      {/* SKU */}
                      <td className={styles.skuCell}>{p.defaultSku.code}</td>

                      {/* 当前库存 */}
                      <td className={styles.num}>
                        {formatQty(r.stock.quantity)} {p.unit}
                      </td>

                      {/* 可售天数 */}
                      <td className={styles.num}>
                        {h?.daysOfSupply !== null && h?.daysOfSupply !== undefined ? `约 ${h.daysOfSupply} 天` : '—'}
                      </td>

                      {/* 平均成本 */}
                      <td className={styles.num}>
                        {r.stock.quantity > 0 ? `¥${formatCents(r.stock.avgCostCents)}` : '—'}
                      </td>

                      {/* 售价 */}
                      <td className={styles.num}>
                        {p.defaultPriceCents > 0 ? `¥${formatCents(p.defaultPriceCents)}` : '—'}
                      </td>

                      {/* 预警值（双击就地编辑） */}
                      <td className={styles.num} onClick={(e) => e.stopPropagation()}>
                        {isEditingThreshold ? (
                          <NumberInput
                            value={thresholdDraft}
                            autoFocus
                            onChange={(val) => setThresholdDraft(val ?? 0)}
                            min={0}
                            step={1}
                            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                              if (e.key === 'Enter' && !e.repeat) {
                                e.preventDefault()
                                e.stopPropagation()
                                void handleSaveThreshold(p)
                              }
                              if (e.key === 'Escape') {
                                e.preventDefault()
                                e.stopPropagation()
                                setThresholdDraft(p.lowStockThreshold)
                                setEditingThresholdId(null)
                              }
                            }}
                          />
                        ) : (
                          <span
                            className={styles.editableThreshold}
                            onDoubleClick={(e) => handleStartEditThreshold(e, p)}
                            title="双击就地修改预警值"
                          >
                            {formatQty(p.lowStockThreshold)} {p.unit}
                          </span>
                        )}
                      </td>

                      {/* 状态徽标（异常时显示，正常留空） */}
                      <td>
                        {!p.isActive ? (
                          <StockBadge status="inactive" />
                        ) : h && isStockAlert(h.status) ? (
                          <StockBadge status={h.status} />
                        ) : null}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  )
}

// #endregion
