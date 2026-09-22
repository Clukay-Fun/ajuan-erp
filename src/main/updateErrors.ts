import type { UpdateState } from '@shared/types'

export function updateErrorState(error: unknown, fallbackMessage: string): Partial<UpdateState> {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : fallbackMessage
  const checkedAt = Date.now()

  if (message.includes('No published versions on GitHub')) {
    return {
      status: 'up-to-date',
      availableVersion: null,
      releaseNotes: null,
      progress: null,
      lastCheckedAt: checkedAt,
      message: null
    }
  }

  return { status: 'error', message: message || '更新过程出错', lastCheckedAt: checkedAt }
}
