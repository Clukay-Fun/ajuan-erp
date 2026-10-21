/**
 * 描述: 定制页 (PsdPage)
 * 主要功能:
 *   - 页头：标题 +「生产 | 模板」切换；右侧 Photoshop 状态胶囊（点了去 设置 › Photoshop 连接）与「打开 PS」
 *   - 生产视图日常出图，模板视图一次性配置；两者共用同一份看板数据，每 1.5 秒刷新
 *   - 页头「任务」按钮打开任务列表（带进行中计数）；任务完成或失败时弹 Toast
 *   - 抠白底结果出来后自动弹出预览确认
 */

import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import { ListChecks } from 'lucide-react'
import type { PsdAsset, PsdBoard, PsdJobStatus, PsdTemplate } from '@shared/psd'
import { Button, ConfirmDialog, SegmentedControl, useDrawer } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { useNav } from '@/app/navigation'
import { usePageActive } from '@/app/usePageActive'
import { unwrap, errorMessage } from '@/lib/api'
import { ProductionView } from '@/features/psd/ProductionView'
import { TemplatesView } from '@/features/psd/TemplatesView'
import { TemplateWizard } from '@/features/psd/TemplateWizard'
import { JobsPanel } from '@/features/psd/JobsPanel'
import { CutoutReview } from '@/features/psd/CutoutReview'
import { fileName } from '@/features/psd/psdLabels'
import styles from './PsdPage.module.css'

type View = 'production' | 'templates'

export function PsdPage(): ReactElement {
  const toast = useToast()
  const { location, navigate } = useNav()
  const { active } = usePageActive('psd')
  const { openDrawer } = useDrawer()
  const [view, setView] = useState<View>(location.params.psd?.view ?? 'production')
  const [board, setBoard] = useState<PsdBoard | null>(null)
  const [busy, setBusy] = useState(false)
  const [deletingAsset, setDeletingAsset] = useState<PsdAsset | null>(null)
  const [reviewId, setReviewId] = useState<number | null>(null)
  const [dismissed, setDismissed] = useState<Set<number>>(() => new Set())
  const lastStatus = useRef<Map<number, PsdJobStatus> | null>(null)

  const load = useCallback(async () => {
    setBoard(await unwrap(window.ajuan.psd.getBoard()))
  }, [])

  // 只在定制页是当前页时轮询看板；切走暂停，切回来立即补拉一次
  useEffect(() => {
    if (!active) return
    load().catch((err: unknown) => toast(errorMessage(err), 'error'))
    // 后台刷新失败不打断操作；「同步结果」仍会显示错误
    const timer = window.setInterval(() => void load().catch(() => {}), 1500)
    return () => window.clearInterval(timer)
  }, [active, load, toast])

  // 其他页面带过来的选项卡指令（生产 / 模板）
  const appliedViewSeq = useRef(-1)
  useEffect(() => {
    if (!active || appliedViewSeq.current === location.seq) return
    appliedViewSeq.current = location.seq
    const requested = location.params.psd?.view
    if (requested) setView(requested)
  }, [active, location.seq, location.params.psd?.view])

  // 任务从排队 / 生成中变为完成或失败时提示一次
  useEffect(() => {
    if (!board) return
    const prev = lastStatus.current
    lastStatus.current = new Map(board.jobs.map((j) => [j.id, j.status]))
    if (!prev) return
    for (const job of board.jobs) {
      const before = prev.get(job.id)
      if (before !== 'queued' && before !== 'running') continue
      if (job.status === 'done') {
        toast(`「${job.title}」已生成`, 'success', {
          label: '显示文件',
          onClick: () => void window.ajuan.psd.revealJob(job.id)
        })
      } else if (job.status === 'failed') {
        toast(`「${job.title}」生成失败：${job.error ?? '原因未知'}`, 'error')
      }
    }
  }, [board, toast])

  // 抠白底结果就绪时自动弹出预览；用户关掉的不再自动弹
  useEffect(() => {
    if (reviewId !== null) return
    const ready = board?.cutouts.find((c) => c.status === 'ready' && !dismissed.has(c.id))
    if (ready) setReviewId(ready.id)
  }, [board, dismissed, reviewId])

  const act = useCallback(
    async (fn: () => Promise<PsdBoard | null>, ok?: string): Promise<void> => {
      setBusy(true)
      try {
        const next = await fn()
        if (next) setBoard(next)
        if (ok && next) toast(ok, 'success')
      } catch (err) {
        toast(errorMessage(err), 'error')
      } finally {
        setBusy(false)
      }
    },
    [toast]
  )

  function openWizard(template?: PsdTemplate): void {
    openDrawer({
      id: template ? `psd-template-${template.id}` : 'psd-template-new',
      title: template ? `编辑模板 · ${template.name}` : '新建模板',
      size: 'lg',
      content: <TemplateWizard template={template} onSaved={setBoard} />
    })
  }

  function openJobs(): void {
    openDrawer({
      id: 'psd-jobs',
      title: '生成任务',
      size: 'sm',
      content: <JobsPanel />
    })
  }

  const review = board?.cutouts.find((c) => c.id === reviewId && c.status === 'ready') ?? null

  async function finishCutout(confirm: boolean): Promise<void> {
    if (!review) return
    await act(
      () => unwrap(confirm ? window.ajuan.psd.confirmCutout(review.id) : window.ajuan.psd.cancelCutout(review.id)),
      confirm ? '已新增透明素材，原图保留' : '已删掉这次抠图结果'
    )
    setReviewId(null)
  }

  const psName = board?.photoshopPath ? fileName(board.photoshopPath).replace(/\.(app|exe)$/i, '') : null
  const activeJobs = board?.jobs.filter((j) => j.status === 'queued' || j.status === 'running').length ?? 0

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headLeft}>
          <h1 className="srOnly">定制</h1>
          <SegmentedControl
            options={[
              { value: 'production', label: '生产' },
              { value: 'templates', label: '模板' }
            ]}
            value={view}
            onChange={setView}
          />
        </div>
        <div className={styles.headRight}>
          <button
            type="button"
            className={styles.psPill}
            data-ready={psName ? true : undefined}
            title="查看 Photoshop 连接设置"
            onClick={() => navigate('settings', { settings: { section: 'photoshop' } })}
          >
            <span className={styles.dot} aria-hidden="true" />
            {board ? (psName ?? '未就绪') : '检查中…'}
          </button>
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => void act(() => unwrap(window.ajuan.psd.openPhotoshop()).then(() => null))}
          >
            打开 PS
          </Button>
          <button type="button" className={styles.jobsButton} onClick={openJobs}>
            <ListChecks size={14} />
            任务
            {activeJobs > 0 && <span className={styles.jobsCount}>{activeJobs}</span>}
          </button>
        </div>
      </header>

      <div className={styles.body}>
        {view === 'production' ? (
          <ProductionView
            board={board}
            busy={busy}
            psReady={!!psName}
            onAct={act}
            onGoTemplates={() => setView('templates')}
            onNewTemplate={() => openWizard()}
            onReviewCutout={(id) => {
              setDismissed((s) => {
                const next = new Set(s)
                next.delete(id)
                return next
              })
              setReviewId(id)
            }}
            onDeleteAsset={setDeletingAsset}
          />
        ) : (
          <TemplatesView board={board} busy={busy} onAct={act} onNew={() => openWizard()} onEdit={openWizard} />
        )}
      </div>

      <ConfirmDialog
        open={deletingAsset !== null}
        onOpenChange={(open) => !open && setDeletingAsset(null)}
        danger
        title="删除素材？"
        description={deletingAsset ? `「${deletingAsset.label}」会从素材库去掉。已经生成的文件还在。` : ''}
        confirmText="删除"
        loading={busy}
        onConfirm={async () => {
          const target = deletingAsset
          if (!target) return
          await act(() => unwrap(window.ajuan.psd.deleteAsset(target.id)), '素材已删除')
          setDeletingAsset(null)
        }}
      />
      <CutoutReview
        open={review !== null}
        job={review}
        original={board?.assets.find((a) => a.id === review?.assetId) ?? null}
        busy={busy}
        onDismiss={() => {
          if (review) setDismissed((s) => new Set(s).add(review.id))
          setReviewId(null)
        }}
        onConfirm={() => void finishCutout(true)}
        onCancel={() => void finishCutout(false)}
      />
    </div>
  )
}
