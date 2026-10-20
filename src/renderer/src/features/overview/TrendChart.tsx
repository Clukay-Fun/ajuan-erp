/**
 * 描述: 出入库趋势双柱图表组件 (TrendChart)
 * 主要功能:
 *   - 纯 SVG 渲染按天或按周并排柱状图
 *   - 时间范围超过 62 天时自动按周聚合
 *   - Y 轴整数刻度，最多 5 条参考网格线
 *   - 悬停浮层 Tooltip 呈现出入库量、金额与毛利
 *   - 无数据状态中央呈现 EmptyState 引导操作
 */

import React, { useEffect, useRef, useState, useMemo } from 'react'
import type { DailySeriesItem } from '@shared/schemas'
import { formatCents, formatQty } from '@/lib/format'
import { Button } from '@/components/ui'
import styles from './TrendChart.module.css'

// #region 内部类型与周聚合辅助函数

export interface TrendChartProps {
  /** 逐日时序数据列表 */
  data: DailySeriesItem[]
  /** 图表高度（默认 200px） */
  height?: number
  /** 是否撑满容器高度 */
  fill?: boolean
  /** 点击新建出库单回调 */
  onNewOutbound?: () => void
  /** 点击重置或切换时间范围回调 */
  onResetRange?: () => void
}

interface ChartBarPoint {
  label: string
  fullTitle: string
  inQty: number
  inAmountCents: number
  outQty: number
  outAmountCents: number
  profitCents: number
}

/**
 * 用处: 当时间范围大于 62 天时进行按周聚合并排展示
 * 参数:
 *   - items: 原始逐日数据列表
 * 功能:
 *   - 7 天一组求和，压缩柱体密度，保持清晰可读性
 */
function aggregateByWeek(items: DailySeriesItem[]): ChartBarPoint[] {
  const points: ChartBarPoint[] = []
  const chunkSize = 7

  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize)
    const startDate = chunk[0].date
    const endDate = chunk[chunk.length - 1].date

    let inQty = 0
    let inAmountCents = 0
    let outQty = 0
    let outAmountCents = 0
    let profitCents = 0

    for (const d of chunk) {
      inQty += d.inQty
      inAmountCents += d.inAmountCents
      outQty += d.outQty
      outAmountCents += d.outAmountCents
      profitCents += d.profitCents
    }

    points.push({
      label: startDate.slice(5),
      fullTitle: `${startDate} ~ ${endDate}`,
      inQty,
      inAmountCents,
      outQty,
      outAmountCents,
      profitCents
    })
  }

  return points
}

// #endregion

// #region TrendChart 组件实现

/**
 * 用处: 概览页核心出入库趋势看板
 * 参数:
 *   - data: 逐日出入库序列
 *   - onNewOutbound: 空数据时快速开单
 *   - onResetRange: 空数据时切换时间区间
 * 功能:
 *   - 高精度展示每日或每周出入库对比柱
 *   - 支持鼠标悬停查看完整金额与毛利
 */
export function TrendChart({
  data,
  height = 200,
  fill = false,
  onNewOutbound,
  onResetRange
}: TrendChartProps): React.JSX.Element {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(640)
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      setWidth(Math.max(300, Math.round(entry.contentRect.width)))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // 1. 数据序列转换（超 62 天自动按周聚合）
  const chartPoints = useMemo<ChartBarPoint[]>(() => {
    if (data.length === 0) return []
    if (data.length > 62) {
      return aggregateByWeek(data)
    }
    return data.map((d) => ({
      label: d.date.slice(5),
      fullTitle: d.date,
      inQty: d.inQty,
      inAmountCents: d.inAmountCents,
      outQty: d.outQty,
      outAmountCents: d.outAmountCents,
      profitCents: d.profitCents
    }))
  }, [data])

  const isEmpty = chartPoints.length === 0 || chartPoints.every((p) => p.inQty === 0 && p.outQty === 0)

  // 2. 坐标轴与刻度线计算
  const padL = 36
  const padR = 12
  const padB = 26
  const padT = 16
  const innerW = Math.max(10, width - padL - padR)
  const innerH = Math.max(10, height - padT - padB)

  const maxVal = Math.max(1, ...chartPoints.map((p) => Math.max(p.inQty, p.outQty)))

  // 最多 5 条整数网格线
  const tickCount = maxVal < 4 ? maxVal : 4
  const ticks = useMemo(() => {
    const list: number[] = []
    const step = Math.ceil(maxVal / tickCount)
    for (let i = 0; i <= tickCount; i++) {
      list.push(i * step)
    }
    return list
  }, [maxVal, tickCount])

  const actualMax = ticks[ticks.length - 1] || maxVal
  const getY = (val: number) => padT + innerH - (val / actualMax) * innerH

  const slotW = chartPoints.length > 0 ? innerW / chartPoints.length : innerW
  const barW = Math.min(14, Math.max(3, slotW * 0.32))
  const labelInterval = Math.max(1, Math.ceil(chartPoints.length / 8))

  const hoveredPoint = hoveredIdx !== null ? chartPoints[hoveredIdx] : null
  const hoverX = hoveredIdx !== null ? padL + slotW * hoveredIdx + slotW / 2 : 0

  return (
    <div className={`${styles.wrap} ${fill ? styles.fill : ''}`} ref={wrapRef}>
      {/* 头部图例栏 */}
      <div className={styles.headerBar}>
        <div className={styles.legend}>
          <span className={styles.legendItem}>
            <span className={`${styles.legendDot} ${styles.inDot}`} />
            入库件数
          </span>
          <span className={styles.legendItem}>
            <span className={`${styles.legendDot} ${styles.outDot}`} />
            出库件数
          </span>
        </div>
      </div>

      {/* SVG 柱状绘图区 */}
      <div className={styles.plot} style={{ height }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          className={styles.svg}
          role="img"
          aria-label="出入库趋势柱状图"
          onMouseLeave={() => setHoveredIdx(null)}
        >
          {/* 参考刻度网格线 */}
          {ticks.map((t) => {
            const y = getY(t)
            return (
              <g key={t}>
                <line x1={padL} x2={width - padR} y1={y} y2={y} className={styles.grid} />
                <text x={padL - 6} y={y + 3} className={styles.tick} textAnchor="end">
                  {t}
                </text>
              </g>
            )
          })}

          {/* 柱状条与热区 */}
          {chartPoints.map((p, idx) => {
            const cx = padL + slotW * idx + slotW / 2
            const inY = getY(p.inQty)
            const inH = Math.max(0, getY(0) - inY)
            const outY = getY(p.outQty)
            const outH = Math.max(0, getY(0) - outY)

            const isHovered = hoveredIdx === idx
            const showLabel = idx % labelInterval === 0 || chartPoints.length <= 8

            return (
              <g
                key={p.fullTitle}
                className={styles.barGroup}
                onMouseEnter={() => setHoveredIdx(idx)}
                onFocus={() => setHoveredIdx(idx)}
              >
                {/* 悬停高亮背景列 */}
                <rect
                  x={cx - slotW / 2}
                  y={padT}
                  width={slotW}
                  height={innerH}
                  className={`${styles.hoverZone} ${isHovered ? styles.hoverActive : ''}`}
                />

                {/* 入库柱 */}
                <rect x={cx - barW - 1} y={inY} width={barW} height={inH} rx={2} className={styles.inBar} />

                {/* 出库柱 */}
                <rect x={cx + 1} y={outY} width={barW} height={outH} rx={2} className={styles.outBar} />

                {/* X 轴日期刻度 */}
                {showLabel && (
                  <text x={cx} y={height - 8} className={styles.tick} textAnchor="middle">
                    {p.label}
                  </text>
                )}
              </g>
            )
          })}
        </svg>

        {/* 鼠标悬停 Tooltip 浮层 */}
        {hoveredPoint && (
          <div
            className={styles.tooltip}
            style={{
              left: `${Math.min(width - 90, Math.max(90, hoverX))}px`,
              top: `${Math.min(height - 40, getY(Math.max(hoveredPoint.inQty, hoveredPoint.outQty)))}px`
            }}
          >
            <div className={styles.tooltipTitle}>{hoveredPoint.fullTitle}</div>
            <div className={`${styles.tooltipRow} ${styles.in}`}>
              <span>入库:</span>
              <span>
                {formatQty(hoveredPoint.inQty)} 件 (¥{formatCents(hoveredPoint.inAmountCents)})
              </span>
            </div>
            <div className={`${styles.tooltipRow} ${styles.out}`}>
              <span>出库:</span>
              <span>
                {formatQty(hoveredPoint.outQty)} 件 (¥{formatCents(hoveredPoint.outAmountCents)})
              </span>
            </div>
            <div className={`${styles.tooltipRow} ${styles.profit}`}>
              <span>毛利:</span>
              <span>¥{formatCents(hoveredPoint.profitCents)}</span>
            </div>
          </div>
        )}

        {/* 空数据状态覆盖 */}
        {isEmpty && (
          <div className={styles.emptyOverlay}>
            <span className={styles.emptyText}>当前时间范围内暂无出入库数据</span>
            <div className={styles.emptyActions}>
              {onNewOutbound && (
                <Button size="sm" variant="primary" onClick={onNewOutbound}>
                  新建出库单
                </Button>
              )}
              {onResetRange && (
                <Button size="sm" variant="secondary" onClick={onResetRange}>
                  切换时间区间
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// #endregion
