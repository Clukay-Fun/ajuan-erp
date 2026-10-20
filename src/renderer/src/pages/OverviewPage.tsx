/**
 * 描述: 概览工作台看板页面 (OverviewPage)
 * 主要功能:
 *   - 顶部智能时间范围选择器与近 30 天无业务智能适配
 *   - 待处理事项条 (Pending Bar) 集中呈现待办草稿与告急库存
 *   - 4 组核心财务 KPI 磁贴 (出库额、毛利、库存成本、最短可售)
 *   - 出入库趋势双柱图与逐日明细无缝切换，支持快捷 CSV 导出
 *   - 紧凑库存状态列表，支持动态库存进度条与低库存置顶标红
 *   - 最近单据流与零商品新手引导空状态
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Download, AlertTriangle, FileEdit, CheckCircle2, ChevronRight, ImageIcon, Sparkles } from 'lucide-react'
import type { Product, DocumentSummary } from '@shared/types'
import type { StatsSummaryResult, DailySeriesItem, ProductHealthItem, PendingSummaryResult } from '@shared/schemas'
import {
  IconButton,
  StatCard,
  Panel,
  DocTypeBadge,
  DocStatusBadge,
  StockBadge,
  isStockAlert,
  SegmentedControl,
  DateRangePicker,
  EmptyState,
  ConfirmDialog,
  Select
} from '@/components/ui'
import { useEntityDrawers } from '@/app/entityDrawers'
import { useDataChanged } from '@/lib/dataEvents'
import { useToast } from '@/components/Toast'
import { unwrap, errorMessage } from '@/lib/api'
import { formatCents, formatQty, shiftDate, todayString } from '@/lib/format'
import { useNav } from '@/app/navigation'
import { TrendChart } from '@/features/overview/TrendChart'
import { productImageUrl } from '@/features/products/ProductImage'
import styles from './OverviewPage.module.css'

// #region 时间范围与预设辅助函数

type RangePreset = 'today' | '7d' | '30d' | 'month' | 'lastMonth' | 'custom'

interface DateRange {
  from: string
  to: string
}

function calcPresetRange(preset: Exclude<RangePreset, 'custom'>): DateRange {
  const today = todayString()
  switch (preset) {
    case 'today':
      return { from: today, to: today }
    case '7d':
      return { from: shiftDate(today, -6), to: today }
    case '30d':
      return { from: shiftDate(today, -29), to: today }
    case 'month':
      return { from: `${today.slice(0, 7)}-01`, to: today }
    case 'lastMonth': {
      const firstDayThisMonth = `${today.slice(0, 7)}-01`
      const lastDayPrevMonth = shiftDate(firstDayThisMonth, -1)
      const firstDayPrevMonth = `${lastDayPrevMonth.slice(0, 7)}-01`
      return { from: firstDayPrevMonth, to: lastDayPrevMonth }
    }
  }
}

const PRESET_OPTIONS: { value: RangePreset; label: string }[] = [
  { value: 'today', label: '今天' },
  { value: '7d', label: '7天' },
  { value: '30d', label: '30天' },
  { value: 'month', label: '本月' },
  { value: 'lastMonth', label: '上月' },
  { value: 'custom', label: '自定义' }
]

// #endregion

// #region OverviewPage 概览主页面

/** 本次会话内记住的时间范围与商品筛选；重启应用后重新走默认逻辑 */
let sessionView: {
  preset: RangePreset
  range: DateRange
  shift: { originalFrom: string; originalTo: string } | null
  productId: number
} | null = null

/**
 * 用处: 桌面端首页综合看板
 * 功能:
 *   - 先处理事（草稿/告急）、再看数（财务KPI、出入库、库存健康）
 */
export function OverviewPage(): React.JSX.Element {
  const { navigate } = useNav()
  const toast = useToast()
  const { openProduct, openDocument, newProduct, newDocument, openImport } = useEntityDrawers()

  // 1. 时间范围状态
  const [preset, setPreset] = useState<RangePreset>(() => sessionView?.preset ?? '30d')
  const [range, setRange] = useState<DateRange>(() => sessionView?.range ?? calcPresetRange('30d'))
  const [smartShiftInfo, setSmartShiftInfo] = useState<{ originalFrom: string; originalTo: string } | null>(
    () => sessionView?.shift ?? null
  )
  const [filterProductId, setFilterProductId] = useState<number>(() => sessionView?.productId ?? 0)
  useEffect(() => {
    sessionView = { preset, range, shift: smartShiftInfo, productId: filterProductId }
  }, [preset, range, smartShiftInfo, filterProductId])

  // 2. 业务数据状态
  const [summary, setSummary] = useState<StatsSummaryResult | null>(null)
  const [dailySeries, setDailySeries] = useState<DailySeriesItem[]>([])
  const [productHealth, setProductHealth] = useState<ProductHealthItem[]>([])
  const [pending, setPending] = useState<PendingSummaryResult | null>(null)
  const [recentDocs, setRecentDocs] = useState<DocumentSummary[]>([])
  const [products, setProducts] = useState<Product[]>([])

  // 3. 交互与筛选状态
  const [viewMode, setViewMode] = useState<'chart' | 'table'>('chart')
  const [loading, setLoading] = useState<boolean>(true)
  const [exporting, setExporting] = useState<boolean>(false)
  const [seedConfirmOpen, setSeedConfirmOpen] = useState<boolean>(false)

  // #region 数据载入逻辑

  // 全量刷新核心数据
  const loadData = useCallback(async () => {
    try {
      const [ps, health, pendingData, docsList] = await Promise.all([
        unwrap(window.ajuan.products.list()),
        unwrap(window.ajuan.stats.getProductHealth()),
        unwrap(window.ajuan.documents.getPendingSummary()),
        unwrap(window.ajuan.documents.list({}))
      ])

      setProducts(ps.filter((p) => p.isActive))
      setProductHealth(health)
      setPending(pendingData)
      setRecentDocs(docsList.slice(0, 5))
    } catch (err) {
      toast(errorMessage(err), 'error')
    }
  }, [toast])

  // 智能时间范围检测：若近 30 天无单据且最近单据早于 30 天前，自动设置范围（本次会话只检测一次）
  useEffect(() => {
    if (sessionView) return
    let active = true
    async function checkSmartDate(): Promise<void> {
      try {
        const latestDate = await unwrap(window.ajuan.stats.getLatestActivityDate())
        if (!active || !latestDate) return

        const today = todayString()
        const thirtyDaysAgo = shiftDate(today, -29)

        if (latestDate < thirtyDaysAgo) {
          const newFrom = shiftDate(latestDate, -29)
          setRange({ from: newFrom, to: latestDate })
          setSmartShiftInfo({ originalFrom: newFrom, originalTo: latestDate })
        }
      } catch {
        // 忽略智能检测失败
      }
    }

    void checkSmartDate()
    return () => {
      active = false
    }
  }, [])

  // 抽屉里写入后刷新列表与区间统计
  const [refreshKey, setRefreshKey] = useState(0)
  useDataChanged(() => {
    void loadData()
    setRefreshKey((k) => k + 1)
  })

  // 初始全量数据载入
  useEffect(() => {
    let active = true
    setLoading(true)
    loadData().finally(() => {
      if (active) setLoading(false)
    })
    return () => {
      active = false
    }
  }, [loadData])

  // 当时间范围或商品筛选改变时，刷新区间统计与时序
  useEffect(() => {
    let active = true
    if (!range.from || !range.to) return

    Promise.all([
      unwrap(window.ajuan.stats.getSummary(range)),
      unwrap(
        window.ajuan.stats.getDailySeries({
          from: range.from,
          to: range.to,
          productId: filterProductId || undefined
        })
      )
    ])
      .then(([summaryRes, seriesRes]) => {
        if (!active) return
        setSummary(summaryRes)
        setDailySeries(seriesRes)
      })
      .catch((err) => {
        if (active) toast(errorMessage(err), 'error')
      })

    return () => {
      active = false
    }
  }, [range, filterProductId, refreshKey, toast])

  // #endregion

  // #region 交互处理函数

  // 切换预设区间
  const handleSelectPreset = (p: RangePreset): void => {
    setPreset(p)
    if (p !== 'custom') {
      setRange(calcPresetRange(p))
      setSmartShiftInfo(null)
    }
  }

  // 自定义区间变更
  const handleCustomRangeChange = (newRange: { from: string; to: string }): void => {
    setRange(newRange)
    setSmartShiftInfo(null)
  }

  // 还原到默认真实近 30 天
  const handleResetToReal30Days = (): void => {
    setPreset('30d')
    setRange(calcPresetRange('30d'))
    setSmartShiftInfo(null)
  }

  // 导出逐日 CSV
  const handleExportCsv = async (): Promise<void> => {
    setExporting(true)
    try {
      const p = await unwrap(
        window.ajuan.csv.exportSummary({
          from: range.from,
          to: range.to,
          skuId: products.find((item) => item.id === filterProductId)?.defaultSku.id
        })
      )
      if (p) toast(`已导出逐日汇总到: ${p}`, 'success')
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setExporting(false)
    }
  }

  // 载入示例数据
  const handleConfirmSeed = async (): Promise<void> => {
    try {
      await unwrap(window.ajuan.demo.seed())
      toast('示例数据载入成功', 'success')
      setSeedConfirmOpen(false)
      await loadData()
    } catch (err) {
      toast(errorMessage(err), 'error')
    }
  }

  const handleOpenProduct = (productId: number): void => void openProduct(productId)
  const handleOpenDocument = openDocument

  // #endregion

  // #region 衍生指标与列表排序

  // 需要处理的商品（缺货、告急、低于预警）
  const criticalProducts = useMemo(() => productHealth.filter((p) => isStockAlert(p.status)), [productHealth])

  // 最短可售天数计算
  const shortestSupplyItem = useMemo(() => {
    const valid = productHealth.filter((p) => p.status !== 'inactive' && p.daysOfSupply !== null)
    if (valid.length === 0) return null
    return [...valid].sort((a, b) => (a.daysOfSupply ?? 999999) - (b.daysOfSupply ?? 999999))[0]
  }, [productHealth])

  // 库存卡片：只列启用中的商品，异常优先置顶，其次按库存量从大到小
  const sortedStockItems = useMemo(() => {
    return productHealth
      .filter((p) => p.status !== 'inactive')
      .sort((a, b) => {
        const alertA = isStockAlert(a.status)
        const alertB = isStockAlert(b.status)
        if (alertA !== alertB) return alertA ? -1 : 1
        return b.stock - a.stock
      })
  }, [productHealth])

  // 当前全局总库存量与总库存成本
  const totalStockQty = useMemo(() => productHealth.reduce((acc, cur) => acc + cur.stock, 0), [productHealth])
  const totalCostValueCents = useMemo(
    () => productHealth.reduce((acc, cur) => acc + cur.costValueCents, 0),
    [productHealth]
  )

  // #endregion

  // #region 首开空状态 (Zero Products Empty State)

  if (!loading && products.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.headerRow}>
          <h1 className={styles.headerTitle}>概览</h1>
        </div>
        <EmptyState
          icon={<PackageIconPlaceholder />}
          title="还没有商品，从这里开始"
          description="建立你的第一份商品画像，或者快速载入示例数据体验工作台完整能力。"
          actions={[
            {
              label: '新建第一个商品',
              variant: 'primary',
              onClick: newProduct
            },
            {
              label: '导入 CSV',
              variant: 'secondary',
              onClick: openImport
            },
            {
              label: '载入示例数据',
              variant: 'secondary',
              onClick: () => setSeedConfirmOpen(true)
            }
          ]}
        />
        <ConfirmDialog
          open={seedConfirmOpen}
          onOpenChange={setSeedConfirmOpen}
          title="载入示例数据"
          description="载入示例数据将生成预设商品、期初库存以及真实的出入库单据记录。确认载入吗？"
          confirmText="确认载入"
          onConfirm={handleConfirmSeed}
        />
      </div>
    )
  }

  // #endregion

  const draftCount = pending?.draftCount ?? 0
  const hasPendingWork = draftCount > 0 || criticalProducts.length > 0

  return (
    <div className={styles.container}>
      {/* 1. 顶部页头栏：标题、智能日期提示、时间范围选择器 */}
      <header className={styles.headerRow}>
        <div className={styles.headerLeft}>
          <h1 className={styles.headerTitle}>概览</h1>
          {smartShiftInfo && (
            <div className={styles.smartRangeHint}>
              <Sparkles size={13} style={{ color: 'var(--accent)' }} />
              <span>
                近 30 天无单据，已显示 {smartShiftInfo.originalFrom.slice(5)} 至 {smartShiftInfo.originalTo.slice(5)}
              </span>
              <button
                type="button"
                className={styles.hintLink}
                onClick={handleResetToReal30Days}
                title="重置为当前自然日近 30 天"
              >
                回到近 30 天
              </button>
            </div>
          )}
        </div>

        <div className={styles.headerRight}>
          <SegmentedControl
            options={PRESET_OPTIONS}
            value={preset}
            onChange={(val) => handleSelectPreset(val as RangePreset)}
          />
          {preset === 'custom' && <DateRangePicker value={range} onChange={handleCustomRangeChange} />}
        </div>
      </header>

      {/* 2. 待处理事项条 (Pending Bar) */}
      <section className={`${styles.pendingBar} ${hasPendingWork ? styles.hasWork : ''}`} aria-label="待处理事项">
        <div className={styles.pendingLeft}>
          {hasPendingWork ? (
            <>
              {draftCount > 0 && (
                <button
                  type="button"
                  className={styles.pendingItem}
                  onClick={() =>
                    draftCount === 1 && pending
                      ? openDocument(pending.drafts[0].id)
                      : navigate('documents', { documents: { view: 'list' } })
                  }
                >
                  <FileEdit size={14} style={{ color: 'var(--warning)' }} />
                  <span>{draftCount} 张草稿待确认</span>
                </button>
              )}
              {draftCount > 0 && criticalProducts.length > 0 && (
                <span style={{ color: 'var(--text-tertiary)' }}>·</span>
              )}
              {criticalProducts.length > 0 && (
                <button type="button" className={styles.pendingItem} onClick={() => navigate('products')}>
                  <AlertTriangle size={14} style={{ color: 'var(--status-critical)' }} />
                  <span>{criticalProducts.length} 个商品库存告急或低于预警</span>
                </button>
              )}
            </>
          ) : (
            <div className={styles.pendingOk}>
              <CheckCircle2 size={14} style={{ color: 'var(--text-tertiary)' }} />
              <span>一切正常</span>
            </div>
          )}
        </div>
      </section>

      {/* 3. 4 张 KPI 核心指标卡 */}
      <section className={styles.kpiGrid} aria-label="核心财务与库存指标">
        {/* 出库额 */}
        <StatCard
          label="出库额"
          value={summary ? `¥${formatCents(summary.current.outAmountCents)}` : '—'}
          subtext={summary ? `${summary.current.outQty} 件 · ${summary.current.outDocCount} 单` : '无出库记录'}
          changePercentage={summary?.changes.outAmount}
          onClick={() => navigate('documents', { documents: { view: 'list' } })}
        />

        {/* 毛利 */}
        <StatCard
          label="出库毛利"
          value={
            summary ? (
              <span style={{ color: summary.current.profitCents < 0 ? 'var(--status-critical)' : undefined }}>
                ¥{formatCents(summary.current.profitCents)}
              </span>
            ) : (
              '—'
            )
          }
          subtext={summary ? `毛利率 ${(summary.current.profitRate * 100).toFixed(1)}%` : '售价 − 成本快照'}
          changePercentage={summary?.changes.profit}
          onClick={() => navigate('documents', { documents: { view: 'list' } })}
        />

        {/* 库存成本 */}
        <StatCard
          label="当前库存成本"
          value={`¥${formatCents(totalCostValueCents)}`}
          subtext={`共 ${formatQty(totalStockQty)} 件 · ${products.length} 个商品`}
          onClick={() => navigate('products')}
        />

        {/* 最短可售 */}
        <StatCard
          label="最短可售天数"
          value={shortestSupplyItem ? `${shortestSupplyItem.daysOfSupply} 天` : '—'}
          subtext={shortestSupplyItem ? shortestSupplyItem.name : '出库样本不足'}
          onClick={() => {
            if (shortestSupplyItem) {
              handleOpenProduct(shortestSupplyItem.productId)
            } else {
              navigate('products')
            }
          }}
        />
      </section>

      {/* 4. 双栏主体内容区 (左栏 2/3 出入库与逐日明细，右栏 1/3 库存状态与最近单据) */}
      <div className={styles.mainGrid}>
        {/* 左栏 */}
        <div className={styles.leftCol}>
          {/* 面板 1：出入库趋势 */}
          <Panel
            title="出入库"
            actions={
              <div className={styles.trendTools}>
                <Select
                  className={styles.productFilter}
                  value={String(filterProductId)}
                  onChange={(v) => setFilterProductId(Number(v))}
                  options={[
                    { value: '0', label: '全部商品' },
                    ...products.map((p) => ({ value: String(p.id), label: p.name }))
                  ]}
                />
                {/* 视图切换 */}
                <div className={styles.viewToggle} role="group" aria-label="图表或明细表格切换">
                  <button
                    type="button"
                    className={`${styles.viewBtn} ${viewMode === 'chart' ? styles.active : ''}`}
                    onClick={() => setViewMode('chart')}
                  >
                    图表
                  </button>
                  <button
                    type="button"
                    className={`${styles.viewBtn} ${viewMode === 'table' ? styles.active : ''}`}
                    onClick={() => setViewMode('table')}
                  >
                    明细
                  </button>
                </div>

                {/* 导出按钮 */}
                <IconButton
                  label="导出逐日明细 CSV"
                  icon={<Download size={14} />}
                  variant="ghost"
                  size="sm"
                  disabled={exporting || dailySeries.length === 0}
                  onClick={handleExportCsv}
                />
              </div>
            }
            flush={viewMode === 'table'}
          >
            {/* 指标摘要条 */}
            {summary && viewMode === 'chart' && (
              <div className={styles.trendSummaryRow}>
                <span className={styles.trendMetric}>
                  入库: <span className={`${styles.trendVal} ${styles.in}`}>{formatQty(summary.current.inQty)} 件</span>
                  <span className={styles.mutedText}>(¥{formatCents(summary.current.inAmountCents)})</span>
                </span>
                <span className={styles.trendMetric}>
                  出库:{' '}
                  <span className={`${styles.trendVal} ${styles.out}`}>{formatQty(summary.current.outQty)} 件</span>
                  <span className={styles.mutedText}>(¥{formatCents(summary.current.outAmountCents)})</span>
                </span>
                <span className={styles.trendMetric}>
                  毛利:{' '}
                  <span className={`${styles.trendVal} ${styles.profit}`}>
                    ¥{formatCents(summary.current.profitCents)}
                  </span>
                </span>
              </div>
            )}

            {/* 视图渲染 */}
            {viewMode === 'chart' ? (
              <TrendChart
                data={dailySeries}
                onNewOutbound={() => newDocument('outbound')}
                onResetRange={handleResetToReal30Days}
              />
            ) : (
              <table className={styles.dailyTable}>
                <thead>
                  <tr>
                    <th>日期</th>
                    <th className={styles.num}>入库件数</th>
                    <th className={styles.num}>入库金额</th>
                    <th className={styles.num}>出库件数</th>
                    <th className={styles.num}>出库金额</th>
                    <th className={styles.num}>毛利</th>
                  </tr>
                </thead>
                <tbody>
                  {dailySeries.filter((d) => d.inQty > 0 || d.outQty > 0).length === 0 ? (
                    <tr>
                      <td colSpan={6} className={styles.emptyBlock}>
                        这段时间没有出入库记录
                      </td>
                    </tr>
                  ) : (
                    dailySeries
                      .filter((d) => d.inQty > 0 || d.outQty > 0)
                      .slice()
                      .reverse()
                      .map((d) => (
                        <tr key={d.date}>
                          <td className={styles.dateCell}>{d.date}</td>
                          <td className={styles.num}>
                            {d.inQty > 0 ? formatQty(d.inQty) : <span className={styles.mutedText}>—</span>}
                          </td>
                          <td className={styles.num}>
                            {d.inQty > 0 ? (
                              `¥${formatCents(d.inAmountCents)}`
                            ) : (
                              <span className={styles.mutedText}>—</span>
                            )}
                          </td>
                          <td className={styles.num}>
                            {d.outQty > 0 ? formatQty(d.outQty) : <span className={styles.mutedText}>—</span>}
                          </td>
                          <td className={styles.num}>
                            {d.outQty > 0 ? (
                              `¥${formatCents(d.outAmountCents)}`
                            ) : (
                              <span className={styles.mutedText}>—</span>
                            )}
                          </td>
                          <td className={styles.num}>
                            {d.outQty > 0 ? (
                              `¥${formatCents(d.profitCents)}`
                            ) : (
                              <span className={styles.mutedText}>—</span>
                            )}
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            )}
          </Panel>
        </div>

        {/* 右栏 */}
        <div className={styles.rightCol}>
          {/* 面板 2：库存状态 */}
          <Panel
            title="库存"
            count={`${products.length} 个商品`}
            actions={
              <button type="button" className={styles.allLink} onClick={() => navigate('products')}>
                全部 <ChevronRight size={14} />
              </button>
            }
            flush
          >
            <div className={styles.stockList}>
              {sortedStockItems.slice(0, 8).map((p) => {
                const prod = products.find((item) => item.id === p.productId)
                const imgUrl = prod ? productImageUrl(prod) : null
                const isWarning = isStockAlert(p.status)
                const isDanger = p.status === 'out' || p.status === 'critical'
                const maxVal = Math.max(p.lowStockThreshold * 3, p.stock, 1)
                const fillPercent = Math.min(100, Math.round((p.stock / maxVal) * 100))
                const thresholdPercent =
                  p.lowStockThreshold > 0 ? Math.min(100, Math.round((p.lowStockThreshold / maxVal) * 100)) : 0

                return (
                  <div
                    key={p.productId}
                    className={`${styles.stockItem} ${isDanger ? styles.isDanger : isWarning ? styles.isWarning : ''}`}
                    onClick={() => handleOpenProduct(p.productId)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleOpenProduct(p.productId)
                    }}
                  >
                    <div className={styles.stockRowTop}>
                      <div className={styles.stockProductInfo}>
                        <div className={styles.stockThumb}>
                          {imgUrl ? (
                            <img src={imgUrl} alt={p.name} />
                          ) : (
                            <ImageIcon size={14} className={styles.stockThumbPlaceholder} />
                          )}
                        </div>
                        <div className={styles.stockMeta}>
                          <span className={styles.stockName} title={p.name}>
                            {p.name}
                          </span>
                          <span className={styles.stockCode}>{p.code}</span>
                        </div>
                      </div>

                      <div className={styles.stockNumbers}>
                        <span className={`${styles.stockQty} ${isWarning ? styles.critical : ''}`}>
                          {formatQty(p.stock)} {prod?.unit ?? '件'}
                        </span>
                        <span className={styles.stockDays}>
                          {p.daysOfSupply !== null ? `约 ${p.daysOfSupply} 天` : '—'}
                        </span>
                        {isWarning && <StockBadge status={p.status} />}
                      </div>
                    </div>

                    {/* 细动态库存条 */}
                    <div className={styles.stockBarWrap}>
                      <div
                        className={`${styles.stockBarFill} ${styles[p.status]}`}
                        style={{ width: `${fillPercent}%` }}
                      />
                      {thresholdPercent > 0 && (
                        <div
                          className={styles.stockThresholdLine}
                          style={{ left: `${thresholdPercent}%` }}
                          title={`预警阈值: ${p.lowStockThreshold}`}
                        />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </Panel>

          {/* 面板 3：最近单据 */}
          <Panel
            title="最近单据"
            actions={
              <button
                type="button"
                className={styles.allLink}
                onClick={() => navigate('documents', { documents: { view: 'list' } })}
              >
                全部 <ChevronRight size={14} />
              </button>
            }
            flush
          >
            <div className={styles.recentList}>
              {recentDocs.length === 0 ? (
                <div className={styles.emptyBlock}>暂无单据记录</div>
              ) : (
                recentDocs.slice(0, 5).map((doc) => (
                  <div
                    key={doc.id}
                    className={styles.recentItem}
                    onClick={() => handleOpenDocument(doc.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleOpenDocument(doc.id)
                    }}
                  >
                    <div className={styles.recentLeft}>
                      <DocTypeBadge type={doc.type} />
                      <div className={styles.recentMain}>
                        <span className={styles.recentDocNo}>{doc.docNo}</span>
                        <span className={styles.recentSub}>
                          {doc.docDate}
                          {doc.channelName ? ` · ${doc.channelName}` : ''}
                        </span>
                      </div>
                    </div>

                    <div className={styles.recentRight}>
                      <span className={styles.recentQty}>{formatQty(doc.totalQuantity)} 件</span>
                      <DocStatusBadge status={doc.status} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </Panel>
        </div>
      </div>

      {/* 示例数据确认弹窗 */}
      <ConfirmDialog
        open={seedConfirmOpen}
        onOpenChange={setSeedConfirmOpen}
        title="载入示例数据"
        description="载入示例数据将生成预设商品、期初库存以及真实的出入库单据记录。确认载入吗？"
        confirmText="确认载入"
        onConfirm={handleConfirmSeed}
      />
    </div>
  )
}

function PackageIconPlaceholder(): React.JSX.Element {
  return <ImageIcon size={32} style={{ color: 'var(--text-tertiary)' }} />
}

// #endregion
