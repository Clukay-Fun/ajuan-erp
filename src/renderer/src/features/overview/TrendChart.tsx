import type { ReactElement } from 'react'
import { useEffect, useRef, useState } from 'react'
import type { DailyFlow } from '@shared/types'
import styles from './TrendChart.module.css'

/** 近 14 天出入库数量，成组柱状图。纯 SVG，随容器宽度缩放。 */
export function TrendChart({
  data,
  height = 200,
  fill = false
}: {
  data: DailyFlow[]
  height?: number
  fill?: boolean
}): ReactElement {
  // viewBox 宽度跟随容器，这样 svg 高度就是固定像素而不是按宽度等比放大
  const wrapRef = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(700)
  const [measuredH, setMeasuredH] = useState(height)
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      setW(Math.max(320, Math.round(entry.contentRect.width)))
      setMeasuredH(Math.max(160, Math.round(entry.contentRect.height)))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  // fill 模式下高度跟随容器（卡片被邻栏撑高时图表一起长），否则固定
  const H = fill ? measuredH : height
  const padL = 36
  const padB = 24
  const padT = 10
  const max = Math.max(1, ...data.map((d) => Math.max(d.inQty, d.outQty)))
  const innerW = W - padL - 8
  const innerH = H - padT - padB
  const slot = innerW / data.length
  const bar = Math.min(16, Math.max(4, slot * 0.32))
  const y = (v: number) => padT + innerH - (v / max) * innerH
  const ticks = [0, 0.5, 1].map((r) => Math.round(max * r))
  const empty = data.every((d) => d.inQty === 0 && d.outQty === 0)
  const labelEvery = Math.max(1, Math.ceil(data.length / 8))

  return (
    <div className={`${styles.wrap} ${fill ? styles.fill : ''}`}>
      <div className={styles.plot} ref={wrapRef} style={fill ? undefined : { height }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width={W}
          height={H}
          className={styles.svg}
          role="img"
          aria-label="近 14 天出入库趋势"
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={W - 8} y1={y(t)} y2={y(t)} className={styles.grid} />
              <text x={padL - 6} y={y(t) + 4} className={styles.tick} textAnchor="end">
                {t}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const cx = padL + slot * i + slot / 2
            return (
              <g key={d.date}>
                <rect
                  x={cx - bar - 1}
                  width={bar}
                  y={y(d.inQty)}
                  height={Math.max(0, y(0) - y(d.inQty))}
                  className={styles.inBar}
                  rx={2}
                >
                  <title>
                    {d.date} 入库 {d.inQty}
                  </title>
                </rect>
                <rect
                  x={cx + 1}
                  width={bar}
                  y={y(d.outQty)}
                  height={Math.max(0, y(0) - y(d.outQty))}
                  className={styles.outBar}
                  rx={2}
                >
                  <title>
                    {d.date} 出库 {d.outQty}
                  </title>
                </rect>
                {(i % labelEvery === 0 || data.length <= 7) && (
                  <text x={cx} y={H - 6} className={styles.tick} textAnchor="middle">
                    {d.date.slice(5)}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
        {empty && <div className={styles.empty}>该区间没有已生效的出入库</div>}
      </div>
      <div className={styles.legend}>
        <span>
          <i className={styles.inDot} />
          入库
        </span>
        <span>
          <i className={styles.outDot} />
          出库
        </span>
      </div>
    </div>
  )
}
