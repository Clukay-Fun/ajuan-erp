import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PsdBoard, PsdJobStatus } from '@shared/psd'
import {
  publishPsdBoard,
  refreshPsdBoard,
  resetPsdBoardFeedForTest,
  subscribePsdBoard
} from '../src/renderer/src/lib/psdBoardFeed'

function board(jobStatus?: PsdJobStatus, title = '任务'): PsdBoard {
  return {
    bridgeDir: '/b',
    outputDir: '/o',
    pluginDir: '/p',
    photoshopPath: null,
    templates: [],
    assets: [],
    jobs: jobStatus ? [{ id: 1, title, status: jobStatus } as PsdBoard['jobs'][number]] : [],
    cutouts: []
  }
}

let next: () => PsdBoard
const getBoard = vi.fn(async () => ({ ok: true as const, data: next() }))

/** 推进假时钟并让挂起的 Promise 跑完 */
async function advance(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms)
}

beforeEach(() => {
  vi.useFakeTimers()
  next = () => board()
  getBoard.mockClear()
  vi.stubGlobal('window', {
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    ajuan: { psd: { getBoard } }
  })
})

afterEach(() => {
  resetPsdBoardFeedForTest()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('定制看板共享轮询', () => {
  it('没有订阅者时不轮询；只有慢订阅者时 10 秒一次', async () => {
    await advance(30_000)
    expect(getBoard).not.toHaveBeenCalled()

    const off = subscribePsdBoard(() => {}, false)
    await advance(9_999)
    expect(getBoard).toHaveBeenCalledTimes(0)
    await advance(1)
    expect(getBoard).toHaveBeenCalledTimes(1)
    await advance(10_000)
    expect(getBoard).toHaveBeenCalledTimes(2)

    off()
    await advance(30_000)
    expect(getBoard).toHaveBeenCalledTimes(2)
  })

  it('有快订阅者时 1.5 秒一次；快订阅者退订后回落到 10 秒', async () => {
    subscribePsdBoard(() => {}, false)
    const offFast = subscribePsdBoard(() => {}, true)
    await advance(1_500)
    expect(getBoard).toHaveBeenCalledTimes(1)
    await advance(1_500)
    expect(getBoard).toHaveBeenCalledTimes(2)

    offFast()
    await advance(9_999)
    expect(getBoard).toHaveBeenCalledTimes(2)
    await advance(1)
    expect(getBoard).toHaveBeenCalledTimes(3)
  })

  it('有任务排队 / 运行时即使只有慢订阅者也 1.5 秒一次，完成后回落', async () => {
    next = () => board('running')
    subscribePsdBoard(() => {}, false)
    await refreshPsdBoard()
    getBoard.mockClear()

    await advance(1_500)
    expect(getBoard).toHaveBeenCalledTimes(1)

    next = () => board('done')
    await advance(1_500)
    expect(getBoard).toHaveBeenCalledTimes(2)
    await advance(9_999)
    expect(getBoard).toHaveBeenCalledTimes(2)
    await advance(1)
    expect(getBoard).toHaveBeenCalledTimes(3)
  })

  it('并发的刷新只发一个请求', async () => {
    const [a, b] = await Promise.all([refreshPsdBoard(), refreshPsdBoard()])
    expect(getBoard).toHaveBeenCalledTimes(1)
    expect(a).toBe(b)
  })

  it('内容没变时不通知订阅者；变了才通知', async () => {
    const seen: PsdBoard[] = []
    subscribePsdBoard((b) => seen.push(b), true)
    await refreshPsdBoard()
    expect(seen).toHaveLength(1)

    await advance(1_500)
    await advance(1_500)
    expect(getBoard).toHaveBeenCalledTimes(3)
    expect(seen).toHaveLength(1)

    next = () => board('queued', '新任务')
    await advance(1_500)
    expect(seen).toHaveLength(2)
    expect(seen[1].jobs[0].title).toBe('新任务')
  })

  it('操作接口推送的看板立即通知所有订阅者，并重置下一次轮询的计时', async () => {
    const a: PsdBoard[] = []
    const b: PsdBoard[] = []
    subscribePsdBoard((x) => a.push(x), false)
    subscribePsdBoard((x) => b.push(x), true)
    await advance(1_000)
    publishPsdBoard(board('queued'))
    expect([a.length, b.length]).toEqual([1, 1])

    // 推送后重新计时：距推送 1.5 秒才拉，而不是距订阅 1.5 秒
    await advance(1_000)
    expect(getBoard).toHaveBeenCalledTimes(0)
    await advance(500)
    expect(getBoard).toHaveBeenCalledTimes(1)
  })

  it('拉取失败不中断轮询，下一次照常重试', async () => {
    getBoard.mockImplementationOnce(async () => {
      throw new Error('IPC 断开')
    })
    subscribePsdBoard(() => {}, true)
    await advance(1_500)
    expect(getBoard).toHaveBeenCalledTimes(1)
    await advance(1_500)
    expect(getBoard).toHaveBeenCalledTimes(2)
  })
})
