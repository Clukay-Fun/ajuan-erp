import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import { Check, Download, ExternalLink, RefreshCw } from 'lucide-react'
import type { IpcResult, UpdateState } from '@shared/types'
import { Button } from '@/components/Button'
import { errorMessage, unwrap } from '@/lib/api'
import styles from './UpdateSettings.module.css'

function statusText(state: UpdateState): string {
  switch (state.status) {
    case 'unsupported':
      return state.message ?? '当前运行方式不支持自动更新。'
    case 'checking':
      return '正在检查更新…'
    case 'available':
      return `发现新版本 v${state.availableVersion}。下载完成后可重启安装。`
    case 'downloading':
      return `正在下载更新…${state.progress === null ? '' : ` ${state.progress}%`}`
    case 'downloaded':
      return `v${state.availableVersion} 已下载，重启应用即可完成安装。`
    case 'up-to-date':
      return `暂无更新（当前版本 v${state.currentVersion}）。`
    case 'error':
      return `更新检查失败：${state.message ?? '请稍后重试。'}`
    default:
      return '手动检查 GitHub Releases 上的稳定版更新。'
  }
}

export function UpdateSettings(): ReactElement {
  const [state, setState] = useState<UpdateState | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const unsubscribe = window.ajuan.update.onState(setState)
    void unwrap(window.ajuan.update.getState())
      .then(setState)
      .catch((reason: unknown) => setError(errorMessage(reason)))
    return unsubscribe
  }, [])

  async function run(action: () => Promise<IpcResult<void>>): Promise<void> {
    setLoading(true)
    setError(null)
    try {
      await unwrap(action())
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setLoading(false)
    }
  }

  async function toggleAutoCheck(enabled: boolean): Promise<void> {
    if (!state) return
    setError(null)
    try {
      setState(await unwrap(window.ajuan.update.setAutoCheck(enabled)))
    } catch (reason) {
      setError(errorMessage(reason))
    }
  }

  function primaryAction(): void {
    if (state?.status === 'available') {
      void run(window.ajuan.update.download)
    } else if (state?.status === 'downloaded') {
      void run(window.ajuan.update.install)
    } else if (state?.status === 'unsupported') {
      void run(window.ajuan.update.openReleases)
    } else {
      void run(window.ajuan.update.check)
    }
  }

  const checking = state?.status === 'checking'
  const downloading = state?.status === 'downloading'
  const buttonLabel =
    state?.status === 'available'
      ? '下载更新'
      : state?.status === 'downloaded'
        ? '重启并安装'
        : state?.status === 'unsupported'
          ? '查看发布页'
          : checking
            ? '检查中…'
            : downloading
              ? '下载中…'
              : '检查更新'
  const ButtonIcon =
    state?.status === 'available'
      ? Download
      : state?.status === 'unsupported'
        ? ExternalLink
        : state?.status === 'downloaded'
          ? Check
          : RefreshCw

  return (
    <section className={styles.card}>
      <h2 className={styles.title}>更新</h2>
      <p className={styles.hint}>检查稳定版更新。下载完成后会在你选择重启时安装。</p>

      <div className={styles.meta}>
        <div>
          <span>当前版本</span>
          <strong>{state ? `v${state.currentVersion}` : '读取中…'}</strong>
        </div>
        <div>
          <span>更新频道</span>
          <strong>稳定版</strong>
        </div>
        <div>
          <span>最近检查</span>
          <strong>{state?.lastCheckedAt ? new Date(state.lastCheckedAt).toLocaleString('zh-CN') : '尚未检查'}</strong>
        </div>
      </div>

      <div className={`${styles.status} ${state?.status === 'error' ? styles.statusError : ''}`} aria-live="polite">
        <p>{state ? statusText(state) : '正在读取更新状态…'}</p>
        {downloading && (
          <progress className={styles.progress} max={100} value={state?.progress ?? 0} aria-label="更新下载进度" />
        )}
        {state?.releaseNotes && <pre className={styles.notes}>{state.releaseNotes}</pre>}
        {error && <p className={styles.error}>{error}</p>}
      </div>

      <div className={styles.actions}>
        <Button variant="primary" onClick={primaryAction} disabled={!state || loading || checking || downloading}>
          <ButtonIcon size={16} aria-hidden="true" /> {buttonLabel}
        </Button>
      </div>

      <label className={styles.preference}>
        <span>
          <strong>启动时自动检查</strong>
          <small>应用启动后在后台检查，不会自动下载或重启。</small>
        </span>
        <input
          type="checkbox"
          checked={state?.autoCheck ?? false}
          disabled={!state}
          onChange={(event) => void toggleAutoCheck(event.target.checked)}
        />
      </label>
    </section>
  )
}
