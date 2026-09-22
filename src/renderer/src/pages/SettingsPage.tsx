import { useEffect, useState, type ReactElement } from 'react'
import type { AppInfo } from '@shared/ipc'
import { PageHeader } from '@/components/PageHeader'
import { ChannelSettings } from '@/features/settings/ChannelSettings'
import { BackupSettings } from '@/features/settings/BackupSettings'
import { AppearanceSettings } from '@/features/settings/AppearanceSettings'
import { DemoDataSettings } from '@/features/settings/DemoDataSettings'
import { unwrap, errorMessage } from '@/lib/api'
import styles from './SettingsPage.module.css'

export function SettingsPage(): ReactElement {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    unwrap(window.ajuan.app.getInfo())
      .then(setInfo)
      .catch((err: unknown) => setError(errorMessage(err)))
  }, [])

  return (
    <>
      <PageHeader title="设置" />
      <AppearanceSettings />
      <ChannelSettings />
      <BackupSettings />
      <DemoDataSettings />
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>应用信息</h2>
        {error && <p className={styles.error}>读取失败：{error}</p>}
        {!info && !error && <p className={styles.muted}>加载中…</p>}
        {info && (
          <dl className={`${styles.dl} selectable`}>
            <dt>名称</dt>
            <dd>{info.name}</dd>
            <dt>版本</dt>
            <dd>{info.version}</dd>
            <dt>平台</dt>
            <dd>{info.platform}</dd>
            <dt>数据目录</dt>
            <dd className={styles.mono}>{info.userDataPath}</dd>
            <dt>数据库</dt>
            <dd className={styles.mono}>{info.dbPath}</dd>
          </dl>
        )}
      </section>
    </>
  )
}
