import { describe, expect, it } from 'vitest'
import { IPC } from '@shared/ipc'

describe('IPC 契约', () => {
  it('通道名唯一且带命名空间前缀', () => {
    const channels = Object.values(IPC)
    expect(new Set(channels).size).toBe(channels.length)
    for (const ch of channels) expect(ch).toMatch(/^[a-z]+:[a-zA-Z]+$/)
  })
})
