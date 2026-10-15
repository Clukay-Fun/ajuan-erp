import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import type { PsdAsset, PsdBoard, PsdCutoutJob, PsdExportFormat, PsdJob, PsdJobStatus, PsdSlot } from '@shared/psd'
import type { AppInfo } from '@shared/ipc'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/Button'
import { Field } from '@/components/Field'
import { Select } from '@/components/Select'
import { Badge } from '@/components/Badge'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { useToast } from '@/components/Toast'
import { unwrap, errorMessage } from '@/lib/api'
import { useFocusTrap } from '@/lib/useFocusTrap'
import { usePresence } from '@/lib/usePresence'
import styles from './PsdPage.module.css'

const STATUS_LABEL: Record<PsdJobStatus, string> = {
  queued: '等待 Photoshop / 插件',
  running: '处理中',
  done: '已导出',
  failed: '失败',
  cancelled: '已取消'
}

function statusTone(status: PsdJobStatus): 'warning' | 'info' | 'success' | 'danger' | 'neutral' {
  if (status === 'queued') return 'warning'
  if (status === 'running') return 'info'
  if (status === 'done') return 'success'
  if (status === 'failed') return 'danger'
  return 'neutral'
}

function fileName(path: string): string {
  const parts = path.split(/[/\\]/)
  return parts[parts.length - 1] || path
}

interface SlotPick {
  enabled: boolean
  dogId: number
  nameId: number
}

interface SlotDraft {
  slotKey: string
  dogLayer: string
  nameLayer: string
}

const EMPTY_SLOT: SlotDraft = {
  slotKey: 'slot_01',
  dogLayer: 'slot_01_dog',
  nameLayer: 'slot_01_name'
}

function nextSlotDraft(slots: PsdSlot[]): SlotDraft {
  const used = new Set(slots.map((slot) => slot.slotKey))
  let number = 1
  let slotKey = `slot_${String(number).padStart(2, '0')}`
  while (used.has(slotKey)) {
    number += 1
    slotKey = `slot_${String(number).padStart(2, '0')}`
  }
  return { slotKey, dogLayer: `${slotKey}_dog`, nameLayer: `${slotKey}_name` }
}

export function PsdPage(): ReactElement {
  const toast = useToast()
  const [board, setBoard] = useState<PsdBoard | null>(null)
  const [platform, setPlatform] = useState<AppInfo['platform'] | null>(null)
  const [busy, setBusy] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [slotDraft, setSlotDraft] = useState<SlotDraft>(EMPTY_SLOT)
  const [templateId, setTemplateId] = useState<number | null>(null)
  const [title, setTitle] = useState('')
  const [format, setFormat] = useState<PsdExportFormat>('psd')
  const [picks, setPicks] = useState<Record<number, SlotPick>>({})
  const [pending, setPending] = useState<{
    kind: 'template' | 'asset'
    id: number
    label: string
  } | null>(null)
  const [reviewCutoutId, setReviewCutoutId] = useState<number | null>(null)
  const [dismissedCutoutIds, setDismissedCutoutIds] = useState<Set<number>>(() => new Set())
  const [previewDark, setPreviewDark] = useState(false)

  const load = useCallback(async () => {
    setBoard(await unwrap(window.ajuan.psd.getBoard()))
  }, [])

  useEffect(() => {
    load().catch((err: unknown) => toast(errorMessage(err), 'error'))
    unwrap(window.ajuan.app.getInfo())
      .then((info) => setPlatform(info.platform))
      .catch(() => {})
  }, [load, toast])

  useEffect(() => {
    const timer = window.setInterval(() => {
      void load().catch(() => {
        // 手动同步按钮仍然可以显示错误；后台刷新不打断用户操作。
      })
    }, 1500)
    return () => window.clearInterval(timer)
  }, [load])

  useEffect(() => {
    if (!board) return
    if (templateId !== null && board.templates.some((item) => item.id === templateId)) return
    const nextTemplate = board.templates[0] ?? null
    setTemplateId(nextTemplate?.id ?? null)
    setSlotDraft(nextTemplate ? nextSlotDraft(nextTemplate.slots) : EMPTY_SLOT)
  }, [board, templateId])

  useEffect(() => {
    if (reviewCutoutId !== null) return
    const ready = board?.cutouts.find((item) => item.status === 'ready' && !dismissedCutoutIds.has(item.id))
    if (ready) setReviewCutoutId(ready.id)
  }, [board, dismissedCutoutIds, reviewCutoutId])

  useEffect(() => {
    setPicks({})
  }, [templateId])

  async function act(fn: () => Promise<PsdBoard | null>, ok?: string): Promise<void> {
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
  }

  const template = board?.templates.find((item) => item.id === templateId) ?? null
  const dogs = board?.assets.filter((asset) => asset.kind === 'dog') ?? []
  const names = board?.assets.filter((asset) => asset.kind === 'name') ?? []
  const pendingCutoutAssetIds = new Set(
    board?.cutouts.filter((job) => ['queued', 'running', 'ready'].includes(job.status)).map((job) => job.assetId) ?? []
  )
  const reviewCutout = board?.cutouts.find((job) => job.id === reviewCutoutId && job.status === 'ready') ?? null

  function assetOptions(assets: PsdAsset[]) {
    return assets.map((asset) => ({
      value: asset.id,
      label: `${asset.label}（${asset.width}×${asset.height}${asset.hasAlpha ? '' : '，无透明通道'}）`
    }))
  }

  function updateSlotKey(slotKey: string): void {
    setSlotDraft((current) => ({
      slotKey,
      dogLayer: current.dogLayer === `${current.slotKey}_dog` ? `${slotKey}_dog` : current.dogLayer,
      nameLayer: current.nameLayer === `${current.slotKey}_name` ? `${slotKey}_name` : current.nameLayer
    }))
  }

  function submitJob(): void {
    if (!template) return
    const items = template.slots
      .filter((slot) => picks[slot.id]?.enabled)
      .map((slot) => ({
        slotId: slot.id,
        dogAssetId: picks[slot.id]?.dogId ?? 0,
        nameAssetId: picks[slot.id]?.nameId ?? 0
      }))
    if (!title.trim()) {
      toast('请填写定制标题', 'error')
      return
    }
    if (!items.length) {
      toast('请勾选至少一个位置', 'error')
      return
    }
    if (items.some((item) => !item.dogAssetId || !item.nameAssetId)) {
      toast('请为勾选的位置选择狗图和名字图', 'error')
      return
    }
    void act(async () => {
      const next = await unwrap(
        window.ajuan.psd.createJob({
          templateId: template.id,
          title,
          format,
          items
        })
      )
      setTitle('')
      setPicks({})
      return next
    }, '任务已放入队列')
  }

  async function confirmDelete(): Promise<void> {
    if (!pending) return
    const target = pending
    setPending(null)
    if (target.kind === 'template') {
      await act(() => unwrap(window.ajuan.psd.deleteTemplate(target.id)), '模板已删除')
    } else {
      await act(() => unwrap(window.ajuan.psd.deleteAsset(target.id)), '素材已删除')
    }
  }

  function dismissReview(): void {
    if (!reviewCutout || busy) return
    setDismissedCutoutIds((current) => new Set(current).add(reviewCutout.id))
    setReviewCutoutId(null)
  }

  async function finishCutout(confirm: boolean): Promise<void> {
    if (!reviewCutout) return
    setBusy(true)
    try {
      const next = await unwrap(
        confirm ? window.ajuan.psd.confirmCutout(reviewCutout.id) : window.ajuan.psd.cancelCutout(reviewCutout.id)
      )
      setBoard(next)
      setDismissedCutoutIds((current) => {
        if (!current.has(reviewCutout.id)) return current
        const nextIds = new Set(current)
        nextIds.delete(reviewCutout.id)
        return nextIds
      })
      setReviewCutoutId(null)
      toast(confirm ? '已新增透明素材，原图保留' : '临时抠图结果已删除', 'success')
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className={styles.workspace}>
        <main className={styles.mainColumn}>
          <PageHeader title="定制" subtitle="用 Photoshop 替换模板里的狗图和名字图，并另存为 PSD 或 TIFF。" />
          <BridgeCard board={board} busy={busy} onAct={act} platform={platform} />

          <section className={styles.card} aria-labelledby="template-heading">
            <div className={styles.sectionHead}>
              <div>
                <h2 id="template-heading" className={styles.title}>
                  模板管理
                </h2>
                <p className={styles.hint}>选择原始 PSD；生成时只复制模板，不修改源文件。</p>
              </div>
              <span className={styles.sectionCount}>{board?.templates.length ?? 0} 个模板</span>
            </div>
            <div className={styles.templateSwitch}>
              {!!board?.templates.length && (
                <Select
                  label="切换模板"
                  value={templateId ?? board.templates[0].id}
                  options={board.templates.map((item) => ({
                    value: item.id,
                    label: item.name
                  }))}
                  onChange={(nextId) => {
                    setTemplateId(nextId)
                    const nextTemplate = board.templates.find((item) => item.id === nextId)
                    if (nextTemplate) setSlotDraft(nextSlotDraft(nextTemplate.slots))
                  }}
                />
              )}
            </div>
            {template && (
              <div className={styles.selectedTemplate}>
                <div className={styles.grow}>
                  <span className={styles.eyebrow}>当前模板</span>
                  <div className={styles.selectedName}>{template.name}</div>
                  <div className={`${styles.meta} ${styles.mono}`}>{template.sourcePath}</div>
                  {!template.sourceExists && <div className={styles.error}>模板文件不在原路径</div>}
                </div>
                <Badge tone={template.sourceExists ? 'success' : 'danger'}>
                  {template.sourceExists ? '文件可用' : '文件缺失'}
                </Badge>
              </div>
            )}
            {!board?.templates.length && <p className={styles.muted}>还没有模板，请填写名称并选择 PSD。</p>}
            <div className={styles.newTemplateSection}>
              <div className={styles.templateCreateHeading}>
                <strong>新建模板</strong>
                <span>添加另一个 PSD 模板及其位置配置</span>
              </div>
              <div className={styles.newTemplateControls}>
                <Field
                  label="模板名称"
                  value={templateName}
                  maxLength={64}
                  onChange={(event) => setTemplateName(event.target.value)}
                  placeholder="例如：六宫格"
                />
                <Button
                  variant="primary"
                  disabled={busy || !templateName.trim()}
                  onClick={() =>
                    void act(async () => {
                      const path = await unwrap(window.ajuan.psd.pickTemplate())
                      if (!path) return null
                      const next = await unwrap(
                        window.ajuan.psd.createTemplate({
                          name: templateName.trim(),
                          sourcePath: path
                        })
                      )
                      setTemplateName('')
                      return next
                    }, '模板已添加')
                  }
                >
                  选择 PSD 并新建
                </Button>
              </div>
            </div>
            {template && (
              <details className={styles.disclosure}>
                <summary>管理图层映射与模板</summary>
                <p className={styles.hint}>可替换图层应为智能对象。位置与图层名称来自当前模板。</p>
                <div className={styles.slotList} aria-label={`${template.name}的位置列表`}>
                  {!template.slots.length ? (
                    <div className={styles.emptyList}>还没有位置，添加后会显示在这里。</div>
                  ) : (
                    template.slots.map((slot) => (
                      <SlotRow key={slot.id} slot={slot} />
                    ))
                  )}
                </div>
                <div className={styles.templateDelete}>
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() =>
                      setPending({
                        kind: 'template',
                        id: template.id,
                        label: template.name
                      })
                    }
                  >
                    删除当前模板
                  </Button>
                </div>
              </details>
            )}
          </section>

          <section className={styles.card} aria-labelledby="assets-heading">
            <h2 id="assets-heading" className={styles.title}>
              素材库
            </h2>
            <p className={styles.hint}>
              支持 PNG / JPG。点击「抠白底」后由 Photoshop 生成临时透明
              PNG；检查预览并确认后才会新增素材，原图始终保留。
            </p>
            <div className={styles.assets}>
              <AssetColumn
                title="狗图"
                assets={dogs}
                busy={busy}
                onImport={() => void act(() => unwrap(window.ajuan.psd.importAsset('dog')), '狗图已导入')}
                pendingCutoutAssetIds={pendingCutoutAssetIds}
                onCutout={(asset) => void act(() => unwrap(window.ajuan.psd.createCutout(asset.id)), '抠图任务已排队')}
                onDelete={(asset) =>
                  setPending({
                    kind: 'asset',
                    id: asset.id,
                    label: asset.label
                  })
                }
              />
              <AssetColumn
                title="名字图"
                assets={names}
                busy={busy}
                onImport={() => void act(() => unwrap(window.ajuan.psd.importAsset('name')), '名字图已导入')}
                pendingCutoutAssetIds={pendingCutoutAssetIds}
                onCutout={(asset) => void act(() => unwrap(window.ajuan.psd.createCutout(asset.id)), '抠图任务已排队')}
                onDelete={(asset) =>
                  setPending({
                    kind: 'asset',
                    id: asset.id,
                    label: asset.label
                  })
                }
              />
            </div>
            <CutoutJobList jobs={board?.cutouts ?? []} onReview={(id) => setReviewCutoutId(id)} />
          </section>

          <section className={styles.card} aria-labelledby="slots-heading">
            <div className={styles.sectionHead}>
              <div>
                <h2 id="slots-heading" className={styles.title}>
                  素材槽位
                </h2>
                <p className={styles.hint}>勾选要替换的位置，并为狗图和名字图分别选择已导入的素材。</p>
              </div>
              <span className={styles.sectionCount}>{template?.slots.length ?? 0} 个位置</span>
            </div>
            {template && (
              <div className={styles.addSlotSection}>
                <h3>新增槽位</h3>
                <SlotForm
                  draft={slotDraft}
                  busy={busy}
                  onKey={updateSlotKey}
                  onDog={(dogLayer) => setSlotDraft((current) => ({ ...current, dogLayer }))}
                  onName={(nameLayer) => setSlotDraft((current) => ({ ...current, nameLayer }))}
                  onAdd={() =>
                    void act(async () => {
                      const next = await unwrap(
                        window.ajuan.psd.addSlot({
                          templateId: template.id,
                          slotKey: slotDraft.slotKey,
                          dogLayer: slotDraft.dogLayer,
                          nameLayer: slotDraft.nameLayer
                        })
                      )
                      const updatedTemplate = next.templates.find((item) => item.id === template.id)
                      if (updatedTemplate) setSlotDraft(nextSlotDraft(updatedTemplate.slots))
                      return next
                    }, '槽位已添加')
                  }
                />
              </div>
            )}
            {!template && <p className={styles.muted}>先添加或选择模板。</p>}
            {template && !template.slots.length && (
              <p className={styles.muted}>这个模板还没有位置，可以在这里新增槽位。</p>
            )}
            {!!template?.slots.length && (
              <div className={styles.slotCards} aria-label="选择导出位置">
                {template.slots.map((slot) => {
                  const pick = picks[slot.id] ?? {
                    enabled: false,
                    dogId: 0,
                    nameId: 0
                  }
                  return (
                    <article key={slot.id} className={styles.slotCard} data-selected={pick.enabled || undefined}>
                      <div className={styles.slotCardHead}>
                        <label className={styles.slotCardSelect}>
                          <input
                            type="checkbox"
                            checked={pick.enabled}
                            onChange={(event) =>
                              setPicks((current) => ({
                                ...current,
                                [slot.id]: {
                                  ...pick,
                                  enabled: event.target.checked
                                }
                              }))
                            }
                          />
                          <span>{slot.slotKey}</span>
                          <small>{pick.enabled ? '本次替换' : '未选择'}</small>
                        </label>
                        <Button
                          variant="ghost"
                          disabled={busy}
                          onClick={() =>
                            void act(() => unwrap(window.ajuan.psd.deleteSlot(slot.id)), '槽位已删除')
                          }
                        >
                          删除
                        </Button>
                      </div>
                      <div className={styles.slotPick}>
                        <div className={styles.layerName}>图层 · {slot.dogLayer}</div>
                        <Select
                          label="狗图"
                          value={pick.dogId}
                          placeholder="选择狗图"
                          options={assetOptions(dogs)}
                          onChange={(dogId) =>
                            setPicks((current) => ({
                              ...current,
                              [slot.id]: { ...pick, dogId }
                            }))
                          }
                        />
                      </div>
                      <div className={styles.slotPick}>
                        <div className={styles.layerName}>图层 · {slot.nameLayer}</div>
                        <Select
                          label="名字图"
                          value={pick.nameId}
                          placeholder="选择名字图"
                          options={assetOptions(names)}
                          onChange={(nameId) =>
                            setPicks((current) => ({
                              ...current,
                              [slot.id]: { ...pick, nameId }
                            }))
                          }
                        />
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </section>

          <section className={styles.card} aria-labelledby="export-heading">
            <h2 id="export-heading" className={styles.title}>
              生成导出
            </h2>
            <p className={styles.hint}>
              只选一个位置就是单张替换，选多个会写进同一个文件；模板中的示例图案会自动清除。
            </p>
            <div className={styles.exportSettings}>
              <Field
                label="定制标题"
                value={title}
                maxLength={60}
                placeholder="用于输出文件名"
                onChange={(event) => setTitle(event.target.value)}
              />
              <Select
                label="导出格式"
                value={format}
                options={[
                  { value: 'psd', label: 'PSD' },
                  { value: 'tiff', label: 'TIFF' }
                ]}
                onChange={setFormat}
              />
            </div>
            <Button variant="primary" disabled={busy || !template?.slots.length} onClick={submitJob}>
              生成定制文件
            </Button>
            <details className={styles.disclosure}>
              <summary>导出规则</summary>
              <p className={styles.hint}>
                PSD 和 TIFF 都会写入 W1 红色专色通道（密度 100%），内容取本次合并图层的透明形状。
              </p>
              <p className={styles.hint}>
                素材按圆内矩形区域等比例缩放，完整显示、不拉伸；内矩形限制图片范围，外圆保留圆形边界。
              </p>
            </details>
          </section>

          <section className={styles.card} aria-labelledby="jobs-heading">
            <div className={styles.sectionHead}>
              <h2 id="jobs-heading" className={styles.title}>
                任务与结果
              </h2>
              <span className={styles.sectionCount}>{board?.jobs.length ?? 0} 个任务</span>
            </div>
            <JobList board={board} busy={busy} onAct={act} />
          </section>
        </main>
      </div>

      <ConfirmDialog
        open={pending !== null}
        danger
        title={pending?.kind === 'template' ? '删除模板？' : '删除素材？'}
        description={pending ? `「${pending.label}」会从列表里去掉。已经导出的文件还在。` : undefined}
        confirmText="删除"
        busy={busy}
        onCancel={() => setPending(null)}
        onConfirm={() => void confirmDelete()}
      />
      <CutoutReview
        open={reviewCutout !== null}
        job={reviewCutout}
        original={board?.assets.find((asset) => asset.id === reviewCutout?.assetId) ?? null}
        previewDark={previewDark}
        busy={busy}
        onToggleBackground={() => setPreviewDark((current) => !current)}
        onDismiss={dismissReview}
        onConfirm={() => void finishCutout(true)}
        onCancel={() => void finishCutout(false)}
      />
    </>
  )
}

function BridgeCard({
  board,
  busy,
  onAct,
  platform
}: {
  board: PsdBoard | null
  busy: boolean
  onAct: (fn: () => Promise<PsdBoard | null>, ok?: string) => Promise<void>
  platform: AppInfo['platform'] | null
}): ReactElement {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const settingsRef = useRef<HTMLElement>(null)
  const [previewPlatform, setPreviewPlatform] = useState<'actual' | 'darwin' | 'win32'>('actual')
  const previewOnly = import.meta.env.DEV && previewPlatform !== 'actual'
  const selectedPlatform = previewPlatform === 'actual' ? platform : previewPlatform
  const isMac = selectedPlatform === 'darwin'
  const actionsDisabled = busy || previewOnly
  const pluginDir = previewOnly
    ? isMac
      ? '…/photoshop-plugin/ajuan-psd/uxp'
      : '%APPDATA%\\Adobe\\CEP\\extensions\\com.clukay.ajuan.psd'
    : board?.pluginDir
  const activeJobs = board?.jobs.filter((job) => job.status === 'queued' || job.status === 'running') ?? []
  const activeCutouts = board?.cutouts.filter((job) => job.status === 'queued' || job.status === 'running') ?? []
  const hasActiveTasks = activeJobs.length + activeCutouts.length > 0
  const hasRunningExport = activeJobs.some((job) => job.status === 'running')
  useFocusTrap(settingsRef, settingsOpen)

  useEffect(() => {
    if (!settingsOpen) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setSettingsOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [settingsOpen])

  return (
    <>
      <section className={styles.psToolbar} aria-label="Photoshop 快捷操作">
        <div className={styles.psIdentity}>
          <span className={styles.psMark} aria-hidden="true">
            Ps
          </span>
          <strong>{board?.photoshopPath ? fileName(board.photoshopPath).replace(/\.app$/i, '') : 'Photoshop'}</strong>
          <Badge tone={hasActiveTasks ? 'info' : board?.photoshopPath ? 'success' : 'warning'}>
            {hasActiveTasks ? '任务处理中' : board?.photoshopPath ? '已识别' : '未识别'}
          </Badge>
        </div>
        <div className={styles.toolbarActions}>
          <Button
            variant="secondary"
            disabled={actionsDisabled}
            onClick={() => void onAct(() => unwrap(window.ajuan.psd.openPhotoshop()).then(() => null))}
          >
            打开 PS
          </Button>
          <Button
            variant="secondary"
            disabled={actionsDisabled}
            onClick={() => void onAct(() => unwrap(window.ajuan.psd.sync()), '已同步')}
          >
            同步结果
          </Button>
          <Button variant="secondary" aria-expanded={settingsOpen} onClick={() => setSettingsOpen(true)}>
            设置
          </Button>
        </div>
      </section>
      {settingsOpen && (
        <div className={styles.drawerBackdrop} onMouseDown={() => setSettingsOpen(false)}>
          <aside
            ref={settingsRef}
            className={styles.settingsDrawer}
            role="dialog"
            aria-modal="true"
            aria-label="Photoshop 设置"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className={styles.drawerHeader}>
              <strong>Photoshop 设置</strong>
              <Button variant="ghost" aria-label="关闭设置" onClick={() => setSettingsOpen(false)}>
                关闭
              </Button>
            </div>
            <div className={styles.drawerBody}>
              <section className={styles.card}>
                <div className={styles.sectionHead}>
                  <h2 className={styles.title}>插件状态</h2>
                  <Badge tone={hasActiveTasks ? 'info' : board?.photoshopPath ? 'success' : 'warning'}>
                    {hasActiveTasks ? '任务处理中' : board?.photoshopPath ? '已识别' : '未识别'}
                  </Badge>
                </div>
                {import.meta.env.DEV && (
                  <div className={styles.previewTools}>
                    <span className={styles.previewLabel}>界面预览</span>
                    <div className={styles.previewGroup} role="group" aria-label="Photoshop 平台界面预览">
                      {(
                        [
                          ['actual', '本机'],
                          ['darwin', 'Mac · UXP'],
                          ['win32', 'Windows · CEP']
                        ] as const
                      ).map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          className={styles.previewOption}
                          aria-pressed={previewPlatform === value}
                          onClick={() => setPreviewPlatform(value)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    {previewOnly && (
                      <span className={styles.previewNote}>
                        仅预览文案和布局；目录与 Photoshop 状态仍来自本机，操作已停用。
                      </span>
                    )}
                  </div>
                )}
                <div className={styles.connectionStatus}>
                  <div>
                    <span>Photoshop</span>
                    <strong>{board?.photoshopPath ? fileName(board.photoshopPath) : '未找到安装路径'}</strong>
                  </div>
                  <div>
                    <span>{isMac ? 'UXP 插件' : 'CEP 扩展'}</span>
                    <strong>{hasActiveTasks ? '等待或处理任务' : '状态以任务响应为准'}</strong>
                  </div>
                </div>
                <details className={styles.disclosure}>
                  <summary>插件安装说明</summary>
                  <p className={styles.hint}>
                    {isMac
                      ? 'Mac 使用 UXP 插件。安装后在 UXP Developer Tools 中加载；阿卷 ERP 会按需打开 Photoshop，任务完成后保持打开。'
                      : 'Windows 使用 CEP 扩展面板。安装后可从 Photoshop「窗口 → 扩展（旧版）→ 阿卷 PSD」打开；后台扩展自动处理任务。'}
                  </p>
                  <ol className={styles.steps}>
                    {isMac ? (
                      <>
                        <li>
                          点“准备 UXP 插件”；若列表没有阿卷 PSD，用 Add Plugin 选择下方 manifest.json，然后点 Load。
                        </li>
                        <li>在 Photoshop「插件 → 阿卷 PSD」打开面板，首次使用时授权桥接目录及导出目录。</li>
                        <li>
                          生成任务前会检查插件状态；若未加载，ERP 会打开 UXP Developer Tools，点 Load
                          后插件会自动处理队列。
                        </li>
                      </>
                    ) : (
                      <>
                        <li>点“安装 CEP 面板”后重启 Photoshop，再从「窗口 → 扩展（旧版）→ 阿卷 PSD」打开。</li>
                        <li>桥接目录和导出目录由 ERP 自动同步给扩展，无需在 Photoshop 中重复授权。</li>
                        <li>后台扩展会随 Photoshop 启动并处理队列；面板显示日志和手动检查按钮。</li>
                      </>
                    )}
                  </ol>
                  <Button
                    variant="primary"
                    disabled={actionsDisabled}
                    onClick={() =>
                      void onAct(
                        () => unwrap(window.ajuan.psd.installPlugin()),
                        isMac
                          ? 'UXP 插件文件已准备好；请在 UXP Developer Tools 中选择下方 manifest.json 并点 Load'
                          : 'CEP 面板已安装；请重启 Photoshop 后从「窗口 → 扩展（旧版）」打开“阿卷 PSD”'
                      )
                    }
                  >
                    {isMac ? '准备 UXP 插件' : '安装 CEP 面板'}
                  </Button>
                </details>
                <details className={styles.disclosure}>
                  <summary>路径与授权设置</summary>
                  <div className={styles.toolActions}>
                    <Button
                      variant="secondary"
                      disabled={actionsDisabled}
                      onClick={() => void onAct(() => unwrap(window.ajuan.psd.pickBridgeDir()), '桥接目录已更新')}
                    >
                      修改桥接目录
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={actionsDisabled}
                      onClick={() => void onAct(() => unwrap(window.ajuan.psd.pickOutputDir()), '导出目录已更新')}
                    >
                      修改导出目录
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={actionsDisabled}
                      onClick={() => void onAct(() => unwrap(window.ajuan.psd.openBridge()).then(() => null))}
                    >
                      打开桥接目录
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={actionsDisabled}
                      onClick={() => void onAct(() => unwrap(window.ajuan.psd.openOutputDir()).then(() => null))}
                    >
                      打开导出目录
                    </Button>
                  </div>
                  <p className={styles.muted}>桥接目录（授权给 Photoshop 插件）：</p>
                  <p className={styles.mono}>{board?.bridgeDir ?? '加载中…'}</p>
                  <p className={styles.muted}>PSD 和透明 PNG 导出目录：</p>
                  <p className={styles.mono}>{board?.outputDir ?? '加载中…'}</p>
                  <p className={styles.muted}>
                    {isMac
                      ? '修改目录后，请在 Photoshop 插件面板中重新授权。'
                      : '修改目录后，ERP 会自动同步给 Photoshop CEP 后台扩展。'}
                  </p>
                </details>
                <details className={styles.disclosure}>
                  <summary>高级工具</summary>
                  <div className={styles.toolActions}>
                    <Button
                      variant="secondary"
                      disabled={actionsDisabled}
                      onClick={() => void onAct(() => unwrap(window.ajuan.psd.openPlugin()).then(() => null))}
                    >
                      {isMac ? '打开 UXP 插件目录' : '打开面板目录'}
                    </Button>
                    {isMac && (
                      <Button
                        variant="secondary"
                        disabled={actionsDisabled}
                        onClick={() =>
                          void onAct(() => unwrap(window.ajuan.psd.openUxpDeveloperTool()).then(() => null))
                        }
                      >
                        打开 UXP Developer Tools
                      </Button>
                    )}
                    {hasRunningExport && (
                      <Button
                        variant="secondary"
                        disabled={actionsDisabled}
                        onClick={() =>
                          void onAct(async () => {
                            const result = await unwrap(window.ajuan.psd.requeueStuck())
                            return result.board
                          }, '已检查中断任务')
                        }
                      >
                        放回中断任务
                      </Button>
                    )}
                  </div>
                  <p className={styles.muted}>
                    {isMac ? 'Photoshop UXP 插件文件：' : 'Photoshop CEP 面板安装目录：'}
                    {previewOnly ? '（目标系统示例）' : ''}
                  </p>
                  <p className={styles.mono}>
                    {pluginDir ?? '加载中…'}/{isMac ? 'manifest.json' : 'CSXS/manifest.xml'}
                  </p>
                  {previewOnly && <p className={styles.muted}>Photoshop 安装状态仍来自当前系统。</p>}
                </details>
              </section>
            </div>
          </aside>
        </div>
      )}
    </>
  )
}

function SlotRow({ slot }: { slot: PsdSlot }): ReactElement {
  return (
    <div className={styles.row}>
      <div className={styles.grow}>
        <div className={styles.name}>{slot.slotKey}</div>
        <div className={styles.meta}>
          狗图 {slot.dogLayer} · 名字 {slot.nameLayer}
        </div>
      </div>
    </div>
  )
}

function SlotForm({
  draft,
  busy,
  onKey,
  onDog,
  onName,
  onAdd
}: {
  draft: SlotDraft
  busy: boolean
  onKey: (value: string) => void
  onDog: (value: string) => void
  onName: (value: string) => void
  onAdd: () => void
}): ReactElement {
  return (
    <div className={styles.row}>
      <div className={styles.form}>
        <Field
          label="位置"
          value={draft.slotKey}
          onChange={(event) => onKey(event.target.value)}
          placeholder="slot_01"
        />
        <Field label="狗图图层" value={draft.dogLayer} onChange={(event) => onDog(event.target.value)} />
        <Field label="名字图层" value={draft.nameLayer} onChange={(event) => onName(event.target.value)} />
        <Button variant="secondary" disabled={busy} onClick={onAdd}>
          添加位置
        </Button>
      </div>
    </div>
  )
}

function AssetColumn({
  title,
  assets,
  busy,
  onImport,
  pendingCutoutAssetIds,
  onCutout,
  onDelete
}: {
  title: string
  assets: PsdAsset[]
  busy: boolean
  onImport: () => void
  pendingCutoutAssetIds: Set<number>
  onCutout: (asset: PsdAsset) => void
  onDelete: (asset: PsdAsset) => void
}): ReactElement {
  return (
    <div>
      <div className={styles.actions}>
        <Button variant="secondary" disabled={busy} onClick={onImport}>
          导入{title}
        </Button>
      </div>
      <ul className={`${styles.list} ${styles.assetList}`}>
        {!assets.length && <li className={`${styles.row} ${styles.emptyAsset}`}>还没有{title}。</li>}
        {!!assets.length &&
          assets.map((asset) => (
            <li key={asset.id} className={styles.row}>
              <img className={styles.thumb} src={asset.fileUrl} alt="" />
              <div className={styles.grow}>
                <div className={styles.name}>{asset.label}</div>
                <div className={styles.meta}>
                  {asset.width}×{asset.height}
                  {asset.hasAlpha ? '' : ' · 无透明通道'}
                </div>
              </div>
              <div className={styles.assetActions}>
                <Button
                  variant="secondary"
                  disabled={busy || pendingCutoutAssetIds.has(asset.id)}
                  onClick={() => onCutout(asset)}
                >
                  {pendingCutoutAssetIds.has(asset.id) ? '抠图处理中' : '抠白底'}
                </Button>
                <Button
                  variant="ghost"
                  disabled={busy || pendingCutoutAssetIds.has(asset.id)}
                  onClick={() => onDelete(asset)}
                >
                  删除
                </Button>
              </div>
            </li>
          ))}
      </ul>
    </div>
  )
}

const CUTOUT_STATUS: Record<PsdCutoutJob['status'], string> = {
  queued: '等待 Photoshop / 插件',
  running: 'Photoshop 处理中',
  ready: '待预览确认',
  failed: '失败',
  confirmed: '已加入素材',
  cancelled: '已取消'
}

function CutoutJobList({
  jobs,
  onReview
}: {
  jobs: PsdCutoutJob[]
  onReview: (id: number) => void
}): ReactElement | null {
  if (!jobs.length) return null
  return (
    <div className={styles.cutoutJobs}>
      <h3 className={styles.subTitle}>抠图任务</h3>
      <ul className={`${styles.list} ${styles.cutoutList}`}>
        {jobs.map((job) => (
          <li className={styles.row} key={job.id}>
            <div className={styles.grow}>
              <div className={styles.name}>
                {job.assetLabel} · {job.kind === 'dog' ? '狗图' : '名字图'}
                <Badge
                  tone={
                    job.status === 'failed'
                      ? 'danger'
                      : job.status === 'ready'
                        ? 'warning'
                        : job.status === 'confirmed'
                          ? 'success'
                          : 'info'
                  }
                >
                  {CUTOUT_STATUS[job.status]}
                </Badge>
              </div>
              {job.error && <div className={styles.error}>{job.error}</div>}
            </div>
            {job.status === 'ready' && (
              <Button variant="secondary" onClick={() => onReview(job.id)}>
                预览并确认
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function CutoutReview({
  open,
  job,
  original,
  previewDark,
  busy,
  onToggleBackground,
  onDismiss,
  onConfirm,
  onCancel
}: {
  open: boolean
  job: PsdCutoutJob | null
  original: PsdAsset | null
  previewDark: boolean
  busy: boolean
  onToggleBackground: () => void
  onDismiss: () => void
  onConfirm: () => void
  onCancel: () => void
}): ReactElement | null {
  const ref = useRef<HTMLElement>(null)
  const { mounted, closing } = usePresence(open)
  useFocusTrap(ref, open)
  const [held, setHeld] = useState<PsdCutoutJob | null>(null)
  useEffect(() => {
    if (job) setHeld(job)
  }, [job])
  const shown = job ?? held

  useEffect(() => {
    if (!open || busy) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onDismiss()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy, onDismiss])

  if (!mounted || !shown) return null
  return (
    <div
      className={styles.reviewBackdrop}
      data-closing={closing || undefined}
      role="presentation"
      onClick={() => {
        if (!busy) onDismiss()
      }}
    >
      <section
        ref={ref}
        className={styles.reviewDialog}
        data-closing={closing || undefined}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cutout-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className={styles.reviewHeader}>
          <div>
            <h2 id="cutout-title" className={styles.title}>
              检查抠图结果
            </h2>
            <p className={styles.hint}>
              {shown.kind === 'dog'
                ? '请检查毛发、脚边和玩具轮廓；自动蒙版可能需要在 Photoshop 手动修边。'
                : '白底已按颜色移除；请确认字母细线、灰色爪印和上下排版完整。'}
            </p>
            <p className={styles.hint}>关闭预览不会删除临时透明图，可稍后在抠图任务里再打开。</p>
          </div>
          <Button variant="secondary" onClick={onToggleBackground}>
            {previewDark ? '切换到浅色背景' : '切换到深色背景'}
          </Button>
        </header>
        <div className={styles.reviewImages}>
          <figure className={styles.reviewFigure}>
            <figcaption>原图 · {shown.assetLabel}</figcaption>
            <div className={`${styles.previewStage} ${previewDark ? styles.previewDark : styles.previewLight}`}>
              {original && <img src={original.fileUrl} alt="原始素材" />}
            </div>
          </figure>
          <figure className={styles.reviewFigure}>
            <figcaption>透明 PNG · 待确认</figcaption>
            <div className={`${styles.previewStage} ${previewDark ? styles.previewDark : styles.previewLight}`}>
              {shown.resultUrl && <img src={shown.resultUrl} alt="抠图结果" />}
            </div>
          </figure>
        </div>
        <footer className={styles.reviewFooter}>
          <Button variant="ghost" disabled={busy} onClick={onDismiss}>
            关闭预览
          </Button>
          <Button variant="ghost" disabled={busy} onClick={onCancel}>
            取消结果
          </Button>
          <Button variant="primary" disabled={busy || !shown.resultUrl || !original} onClick={onConfirm}>
            确认并新增素材
          </Button>
        </footer>
      </section>
    </div>
  )
}

function JobList({
  board,
  busy,
  onAct
}: {
  board: PsdBoard | null
  busy: boolean
  onAct: (fn: () => Promise<PsdBoard | null>, ok?: string) => Promise<void>
}): ReactElement {
  if (!board?.jobs.length) return <p className={styles.muted}>还没有导出任务。</p>
  return (
    <ul className={`${styles.list} ${styles.exportList}`}>
      {board.jobs.map((job) => (
        <JobRow key={job.id} job={job} busy={busy} onAct={onAct} />
      ))}
    </ul>
  )
}

function JobRow({
  job,
  busy,
  onAct
}: {
  job: PsdJob
  busy: boolean
  onAct: (fn: () => Promise<PsdBoard | null>, ok?: string) => Promise<void>
}): ReactElement {
  return (
    <li className={styles.row}>
      <div className={styles.grow}>
        <div className={styles.name}>
          {job.title} <Badge tone={statusTone(job.status)}>{STATUS_LABEL[job.status]}</Badge>
        </div>
        <div className={styles.meta}>
          {job.templateName}
          {job.items.length ? ` · ${job.items.map((item) => item.slotKey).join('、')}` : ''}
        </div>
        {job.error && <div className={styles.error}>{job.error}</div>}
        {job.outputPath && <div className={`${styles.meta} ${styles.mono}`}>{job.outputPath}</div>}
      </div>
      {job.status === 'queued' && (
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() => void onAct(() => unwrap(window.ajuan.psd.cancelJob(job.id)), '任务已取消')}
        >
          取消
        </Button>
      )}
      {job.status === 'failed' && (
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() => void onAct(() => unwrap(window.ajuan.psd.retryJob(job.id)), '已重新排队')}
        >
          重试
        </Button>
      )}
      {job.status === 'done' && (
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() => void onAct(() => unwrap(window.ajuan.psd.revealJob(job.id)).then(() => null))}
        >
          显示文件
        </Button>
      )}
    </li>
  )
}
