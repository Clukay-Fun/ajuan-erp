import type { ReactElement } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { Sparkles, Eraser } from 'lucide-react'
import { Button } from '@/components/Button'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { useToast } from '@/components/Toast'
import { unwrap, errorMessage } from '@/lib/api'
import { useNav } from '@/app/navigation'
import styles from './BackupSettings.module.css'

export function DemoDataSettings(): ReactElement {
  const toast = useToast()
  const { navigate } = useNav()
  const [hasData, setHasData] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)

  const load = useCallback(async () => {
    try {
      setHasData(await unwrap(window.ajuan.demo.hasData()))
    } catch {
      setHasData(null)
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  async function seed(): Promise<void> {
    setBusy(true)
    try {
      const r = await unwrap(window.ajuan.demo.seed())
      toast(`已载入 ${r.documents} 张示例单据`, 'success')
      navigate('overview')
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function reset(): Promise<void> {
    setBusy(true)
    try {
      await unwrap(window.ajuan.demo.reset())
      toast('业务数据已清空', 'success')
      setConfirmReset(false)
      await load()
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={styles.card}>
      <h2 className={styles.title}>示例数据</h2>
      <p className={styles.hint}>用一套两周的出入库记录快速看效果。示例单据备注都带「示例：」前缀。</p>
      <div className={styles.row}>
        <div>
          <div className={styles.label}>载入示例数据</div>
          <div className={styles.desc}>
            期初 300 件、两周内 12 张出入库单、1 张作废、1 张草稿、1 张盘点调整。只能在没有业务数据时载入。
          </div>
        </div>
        <Button variant="primary" onClick={seed} disabled={busy || hasData !== false}>
          <Sparkles size={16} /> 载入
        </Button>
      </div>
      <div className={styles.row}>
        <div>
          <div className={styles.label}>清空全部业务数据</div>
          <div className={styles.desc}>
            删除所有单据、流水、附件并把库存归零；商品资料、渠道、外观设置保留。建议先备份。
          </div>
        </div>
        <Button onClick={() => setConfirmReset(true)} disabled={busy || hasData !== true}>
          <Eraser size={16} /> 清空
        </Button>
      </div>
      <ConfirmDialog
        open={confirmReset}
        danger
        title="清空全部业务数据？"
        confirmText="清空"
        busy={busy}
        description="所有单据、流水和附件将被永久删除，库存归零。此操作不可撤销，建议先在上方创建备份。"
        onCancel={() => setConfirmReset(false)}
        onConfirm={reset}
      />
    </section>
  )
}
