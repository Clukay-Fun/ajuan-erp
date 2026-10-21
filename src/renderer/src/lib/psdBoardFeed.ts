/**
 * 描述: 定制看板的唯一轮询源
 * 主要功能:
 *   - 全应用只有这一个定时器拉 psd.getBoard()，外壳（任务提示 / 角标）、定制页、任务弹窗共用结果
 *   - 有订阅者要求快速刷新（定制页在前台、任务弹窗打开）或有任务在排队 / 运行时 1.5 秒一次，否则 10 秒一次
 *   - 操作接口返回的新看板用 publishPsdBoard() 推给所有订阅者，不必等下一次轮询
 */

import { useCallback, useEffect, useState } from 'react'
import type { PsdBoard } from '@shared/psd'
import { unwrap } from './api'

const FAST_MS = 1500
const IDLE_MS = 10_000

type Listener = (board: PsdBoard) => void

const listeners = new Map<Listener, { fast: boolean }>()
let last: PsdBoard | null = null
let inflight: Promise<PsdBoard> | null = null
let timer: number | null = null

function hasWork(board: PsdBoard | null): boolean {
  if (!board) return false
  const live = (s: string): boolean => s === 'queued' || s === 'running'
  return board.jobs.some((j) => live(j.status)) || board.cutouts.some((c) => live(c.status))
}

function nextDelay(): number {
  const wantsFast = [...listeners.values()].some((l) => l.fast)
  return wantsFast || hasWork(last) ? FAST_MS : IDLE_MS
}

function schedule(): void {
  if (timer !== null) window.clearTimeout(timer)
  timer = null
  if (listeners.size === 0) return
  timer = window.setTimeout(() => {
    timer = null
    refreshPsdBoard()
      .catch(() => {
        // 后台轮询失败不打断当前操作；下一次照常重试
      })
      .finally(schedule)
  }, nextDelay())
}

/** 推送一份新看板给所有订阅者（例如操作接口直接返回了最新看板） */
export function publishPsdBoard(board: PsdBoard): void {
  last = board
  for (const fn of listeners.keys()) fn(board)
  schedule()
}

/** 立即拉一次；并发调用共用同一个请求 */
export function refreshPsdBoard(): Promise<PsdBoard> {
  if (!inflight) {
    inflight = unwrap(window.ajuan.psd.getBoard())
      .then((board) => {
        publishPsdBoard(board)
        return board
      })
      .finally(() => {
        inflight = null
      })
  }
  return inflight
}

/** 订阅看板更新；fast 为 true 时轮询提速到 1.5 秒 */
export function subscribePsdBoard(listener: Listener, fast: boolean): () => void {
  listeners.set(listener, { fast })
  schedule()
  return () => {
    listeners.delete(listener)
    schedule()
  }
}

/**
 * 用处: 组件里读取共享看板
 * 参数:
 *   - fast: 是否需要快速刷新（页面在前台、弹窗打开时传 true）
 * 返回: [看板, 推送新看板, 立即刷新]
 */
export function usePsdBoard(fast: boolean): [PsdBoard | null, (board: PsdBoard) => void, () => Promise<PsdBoard>] {
  const [board, setBoard] = useState<PsdBoard | null>(last)

  useEffect(() => subscribePsdBoard(setBoard, fast), [fast])

  const publish = useCallback((next: PsdBoard) => publishPsdBoard(next), [])
  return [board, publish, refreshPsdBoard]
}
