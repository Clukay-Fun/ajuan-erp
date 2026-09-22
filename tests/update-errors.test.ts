import { describe, expect, it } from 'vitest'
import { updateErrorState } from '../src/main/updateErrors'

describe('updateErrorState', () => {
  it('treats an empty GitHub releases feed as no available update', () => {
    expect(updateErrorState(new Error('No published versions on GitHub'), '检查更新失败')).toMatchObject({
      status: 'up-to-date',
      availableVersion: null,
      releaseNotes: null,
      progress: null,
      message: null
    })
  })

  it('keeps real network and metadata failures visible', () => {
    expect(updateErrorState(new Error('HTTP 503'), '检查更新失败')).toMatchObject({
      status: 'error',
      message: 'HTTP 503'
    })
  })
})
