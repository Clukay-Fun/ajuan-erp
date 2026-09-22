import type { ReactElement } from 'react'
import { useState } from 'react'
import { DatabaseBackup, FolderOpen, AlertTriangle, CheckCircle2 } from 'lucide-react'
import type { BackupInspection } from '@shared/types'
import { Button } from '@/components/Button'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { useToast } from '@/components/Toast'
import { unwrap, errorMessage } from '@/lib/api'
import styles from './BackupSettings.module.css'
import { TrashSettings } from './TrashSettings'

export function BackupSettings(): ReactElement {
  const toast = useToast()
  const [creating, setCreating] = useState(false)
  const [inspecting, setInspecting] = useState(false)
  const [inspection, setInspection] = useState<BackupInspection | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [restoring, setRestoring] = useState(false)

  async function create(): Promise<void> {
    setCreating(true)
    try {
      const p = await unwrap(window.ajuan.backup.create())
      if (p) toast(`备份已保存到 ${p}`, 'success')
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setCreating(false)
    }
  }

  async function pick(): Promise<void> {
    setInspecting(true)
    try {
      const p = await unwrap(window.ajuan.backup.pick())
      if (!p) return
      setInspection(await unwrap(window.ajuan.backup.inspect(p)))
    } catch (err) {
      toast(errorMessage(err), 'error')
      setInspection(null)
    } finally {
      setInspecting(false)
    }
  }

  async function restore(): Promise<void> {
    if (!inspection) return
    setRestoring(true)
    try {
      await unwrap(window.ajuan.backup.restore(inspection.path))
      // 主进程随后会重新加载窗口
      toast('恢复完成，正在重新加载…', 'success')
    } catch (err) {
      toast(errorMessage(err), 'error')
      setRestoring(false)
      setConfirmOpen(false)
    }
  }

  const m = inspection?.manifest
  const ok = inspection !== null && inspection.problems.length === 0

  return (
    <section className={styles.card}>
      <h2 className={styles.title}>数据备份与恢复</h2>
      <p className={styles.hint}>备份包含数据库和全部图片附件，是一个 zip 文件。建议定期备份到其他磁盘或网盘。</p>

      <div className={styles.row}>
        <div>
          <div className={styles.label}>创建备份</div>
          <div className={styles.desc}>把当前全部数据打包保存到你选择的位置。</div>
        </div>
        <Button variant="primary" onClick={create} disabled={creating}>
          <DatabaseBackup size={16} /> {creating ? '打包中…' : '创建备份'}
        </Button>
      </div>

      <div className={styles.row}>
        <div>
          <div className={styles.label}>从备份恢复</div>
          <div className={styles.desc}>
            用备份文件替换当前全部数据。恢复前会校验备份完整性；当前数据会先移入回收目录，不会直接删除。
          </div>
        </div>
        <Button onClick={pick} disabled={inspecting || restoring}>
          <FolderOpen size={16} /> {inspecting ? '校验中…' : '选择备份文件'}
        </Button>
      </div>

      <TrashSettings />

      {inspection && m && (
        <div className={`${styles.report} ${ok ? styles.reportOk : styles.reportBad}`}>
          <div className={styles.reportHead}>
            {ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            <span className={styles.file}>{inspection.path}</span>
          </div>
          <dl className={styles.meta}>
            <dt>备份时间</dt>
            <dd>{new Date(m.createdAt).toLocaleString('zh-CN')}</dd>
            <dt>应用版本</dt>
            <dd>
              {m.appVersion} · 数据库 v{m.schemaVersion}
            </dd>
            <dt>内容</dt>
            <dd>
              {m.counts.documents} 张单据 · {m.counts.movements} 条流水 · {m.counts.attachments} 个附件
            </dd>
          </dl>
          {inspection.problems.length > 0 ? (
            <ul className={styles.problems}>
              {inspection.problems.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          ) : (
            <div className={styles.actions}>
              <Button onClick={() => setInspection(null)} disabled={restoring}>
                取消
              </Button>
              <Button
                variant="primary"
                className={styles.danger}
                onClick={() => setConfirmOpen(true)}
                disabled={restoring}
              >
                恢复此备份
              </Button>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        danger
        title="确定用备份覆盖当前数据？"
        confirmText="恢复并重新加载"
        busy={restoring}
        description={
          m
            ? `当前全部单据、流水与附件将被替换为 ${new Date(m.createdAt).toLocaleString('zh-CN')} 的备份内容。当前数据会移入回收目录以备找回。`
            : ''
        }
        onCancel={() => setConfirmOpen(false)}
        onConfirm={restore}
      />
    </section>
  )
}
