/**
 * 描述: 设置页 (SettingsPage)
 * 主要功能:
 *   - 设置分类导航由 Shell 的 SettingsNav 承担（进入设置时替换主导航）
 *   - 右侧内容区最大 860px，一次只显示一个分类
 *   - 分类状态由 App 保存；进入时可带分类参数（定制页状态胶囊、命令面板都会直接跳到某个分类）
 */

import { useEffect, useState, type ReactElement } from 'react'
import { FolderOpen } from 'lucide-react'
import type { AppInfo } from '@shared/ipc'
import { Button } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { AppearanceSettings } from '@/features/settings/AppearanceSettings'
import { ChannelSettings } from '@/features/settings/ChannelSettings'
import { DataSettings } from '@/features/settings/DataSettings'
import { UpdateSettings } from '@/features/settings/UpdateSettings'
import { PhotoshopSettings } from '@/features/psd/PhotoshopSettings'
import card from '@/features/settings/SettingsCard.module.css'
import { unwrap, errorMessage } from '@/lib/api'
import type { SettingsSectionKey } from './settingsSections'
import styles from './SettingsPage.module.css'

const revealLabel = navigator.platform.toUpperCase().includes('MAC') ? '在 Finder 中显示' : '在文件夹中显示'

export interface SettingsPageProps {
  section: SettingsSectionKey
  onSectionChange: (section: SettingsSectionKey) => void
}

export function SettingsPage({ section }: SettingsPageProps): ReactElement {
  return (
    <div className={styles.container}>
      <h1 className="srOnly">设置</h1>
      <div className={styles.content}>
        {section === 'appearance' && <AppearanceSettings />}
        {section === 'channels' && <ChannelSettings />}
        {section === 'photoshop' && (
          <section className={card.card}>
            <h2 className={card.title}>Photoshop 连接</h2>
            <p className={card.hint}>定制页靠 Photoshop 和阿卷插件出图。这里查看状态、安装插件、调整目录。</p>
            <PhotoshopSettings />
          </section>
        )}
        {section === 'data' && <DataSettings />}
        {section === 'about' && (
          <>
            <UpdateSettings />
            <AboutCard />
          </>
        )}
      </div>
    </div>
  )
}

function AboutCard(): ReactElement {
  const toast = useToast()
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    unwrap(window.ajuan.app.getInfo())
      .then(setInfo)
      .catch((err: unknown) => setError(errorMessage(err)))
  }, [])

  const reveal = (target: 'data' | 'db'): void => {
    unwrap(window.ajuan.app.revealPath(target)).catch((err: unknown) => toast(errorMessage(err), 'error'))
  }

  return (
    <section className={card.card}>
      <h2 className={card.title}>应用信息</h2>
      {error && <p className={styles.error}>读取失败：{error}</p>}
      {!info && !error && <p className={card.hint}>加载中…</p>}
      {info && (
        <dl className={`${styles.dl} selectable`}>
          <dt>名称</dt>
          <dd>{info.name}</dd>
          <dt>版本</dt>
          <dd>{info.version}</dd>
          <dt>平台</dt>
          <dd>{info.platform}</dd>
          <dt>数据目录</dt>
          <dd className={styles.pathRow}>
            <span className={styles.mono} title={info.userDataPath}>
              {info.userDataPath}
            </span>
            <Button variant="ghost" size="sm" icon={<FolderOpen size={14} />} onClick={() => reveal('data')}>
              {revealLabel}
            </Button>
          </dd>
          <dt>数据库</dt>
          <dd className={styles.pathRow}>
            <span className={styles.mono} title={info.dbPath}>
              {info.dbPath}
            </span>
            <Button variant="ghost" size="sm" icon={<FolderOpen size={14} />} onClick={() => reveal('db')}>
              {revealLabel}
            </Button>
          </dd>
        </dl>
      )}
    </section>
  )
}
