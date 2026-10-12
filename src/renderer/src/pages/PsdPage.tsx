import { useCallback, useEffect, useState, type ReactElement } from 'react'
import type { PsdAsset, PsdBoard, PsdJob, PsdJobStatus, PsdSlot } from '@shared/psd'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/Button'
import { Field } from '@/components/Field'
import { Select } from '@/components/Select'
import { Badge } from '@/components/Badge'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { useToast } from '@/components/Toast'
import { unwrap, errorMessage } from '@/lib/api'
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

const EMPTY_SLOT: SlotDraft = { slotKey: 'slot_01', dogLayer: 'slot_01_dog', nameLayer: 'slot_01_name' }

export function PsdPage(): ReactElement {
  const toast = useToast()
  const [board, setBoard] = useState<PsdBoard | null>(null)
  const [busy, setBusy] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [slotDraft, setSlotDraft] = useState<SlotDraft>(EMPTY_SLOT)
  const [templateId, setTemplateId] = useState<number | null>(null)
  const [title, setTitle] = useState('')
  const [picks, setPicks] = useState<Record<number, SlotPick>>({})
  const [pending, setPending] = useState<{ kind: 'template' | 'asset'; id: number; label: string } | null>(null)

  const load = useCallback(async () => {
    setBoard(await unwrap(window.ajuan.psd.getBoard()))
  }, [])

  useEffect(() => {
    load().catch((err: unknown) => toast(errorMessage(err), 'error'))
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
    setTemplateId((current) => {
      if (current && board.templates.some((item) => item.id === current)) return current
      return board.templates[0]?.id ?? null
    })
  }, [board])

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
      const next = await unwrap(window.ajuan.psd.createJob({ templateId: template.id, title, items }))
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

  return (
    <>
      <PageHeader title="定制" subtitle="用 Photoshop 替换模板里的狗图和名字图，并另存为新的 PSD。" />
      <BridgeCard board={board} busy={busy} onAct={act} />
      <section className={styles.card}>
        <h2 className={styles.title}>模板</h2>
        <p className={styles.hint}>选择原始 PSD。导出时只复制一份，不改这个文件。可替换图层要做成智能对象。</p>
        <div className={styles.actions}>
          <div className={styles.nameField}>
            <Field
              label="模板名称"
              value={templateName}
              maxLength={64}
              onChange={(event) => setTemplateName(event.target.value)}
              placeholder="例如：六宫格"
            />
          </div>
          <Button
            variant="primary"
            disabled={busy || !templateName.trim()}
            onClick={() =>
              void act(async () => {
                const path = await unwrap(window.ajuan.psd.pickTemplate())
                if (!path) return null
                const next = await unwrap(
                  window.ajuan.psd.createTemplate({ name: templateName.trim(), sourcePath: path })
                )
                setTemplateName('')
                return next
              }, '模板已添加')
            }
          >
            选择 PSD
          </Button>
        </div>
        {!board?.templates.length && <p className={styles.muted}>还没有模板。</p>}
        {board?.templates.map((item) => (
          <article key={item.id} className={styles.list}>
            <div className={styles.row}>
              <div className={styles.grow}>
                <div className={styles.name}>{item.name}</div>
                <div className={`${styles.meta} ${styles.mono}`}>{item.sourcePath}</div>
                {!item.sourceExists && <div className={styles.error}>模板文件不在原路径</div>}
              </div>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => setPending({ kind: 'template', id: item.id, label: item.name })}
              >
                删除
              </Button>
            </div>
            {item.slots.map((slot) => (
              <SlotRow
                key={slot.id}
                slot={slot}
                busy={busy}
                onDelete={() => void act(() => unwrap(window.ajuan.psd.deleteSlot(slot.id)), '位置已删除')}
              />
            ))}
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
                      templateId: item.id,
                      slotKey: slotDraft.slotKey,
                      dogLayer: slotDraft.dogLayer,
                      nameLayer: slotDraft.nameLayer
                    })
                  )
                  const number = Number(slotDraft.slotKey.slice(5)) + 1
                  const key = `slot_${String(number).padStart(2, '0')}`
                  setSlotDraft({ slotKey: key, dogLayer: `${key}_dog`, nameLayer: `${key}_name` })
                  return next
                }, '位置已添加')
              }
            />
          </article>
        ))}
      </section>

      <section className={styles.card}>
        <h2 className={styles.title}>素材</h2>
        <p className={styles.hint}>狗图和名字图分开存放。导入后使用副本，原文件不会被改。</p>
        <div className={styles.assets}>
          <AssetColumn
            title="狗图"
            assets={dogs}
            busy={busy}
            onImport={() => void act(() => unwrap(window.ajuan.psd.importAsset('dog')), '狗图已导入')}
            onDelete={(asset) => setPending({ kind: 'asset', id: asset.id, label: asset.label })}
          />
          <AssetColumn
            title="名字图"
            assets={names}
            busy={busy}
            onImport={() => void act(() => unwrap(window.ajuan.psd.importAsset('name')), '名字图已导入')}
            onDelete={(asset) => setPending({ kind: 'asset', id: asset.id, label: asset.label })}
          />
        </div>
      </section>

      <section className={styles.card}>
        <h2 className={styles.title}>导出</h2>
        <p className={styles.hint}>勾选要替换的位置。只选一个就是单张替换，选多个会写进同一个 PSD。</p>
        <p className={styles.hint}>素材会按模板图层的宽、高分别强制缩放；比例不一致时会产生拉伸。</p>
        {!template && <p className={styles.muted}>先添加模板和位置。</p>}
        {template && (
          <>
            <div className={styles.assets}>
              <Select
                label="模板"
                value={template.id}
                options={board!.templates.map((item) => ({ value: item.id, label: item.name }))}
                onChange={setTemplateId}
              />
              <Field
                label="定制标题"
                value={title}
                maxLength={60}
                placeholder="用于输出文件名"
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>
            {!template.slots.length && <p className={styles.muted}>这个模板还没有位置。</p>}
            {template.slots.map((slot) => {
              const pick = picks[slot.id] ?? { enabled: false, dogId: 0, nameId: 0 }
              return (
                <div key={slot.id} className={styles.jobGrid}>
                  <label className={styles.check}>
                    <input
                      type="checkbox"
                      checked={pick.enabled}
                      onChange={(event) =>
                        setPicks((current) => ({ ...current, [slot.id]: { ...pick, enabled: event.target.checked } }))
                      }
                    />
                    {slot.slotKey}
                  </label>
                  <Select
                    label="狗图"
                    value={pick.dogId}
                    placeholder="选择狗图"
                    options={assetOptions(dogs)}
                    onChange={(dogId) => setPicks((current) => ({ ...current, [slot.id]: { ...pick, dogId } }))}
                  />
                  <Select
                    label="名字图"
                    value={pick.nameId}
                    placeholder="选择名字图"
                    options={assetOptions(names)}
                    onChange={(nameId) => setPicks((current) => ({ ...current, [slot.id]: { ...pick, nameId } }))}
                  />
                </div>
              )
            })}
            <div className={styles.actions}>
              <Button variant="primary" disabled={busy || !template.slots.length} onClick={submitJob}>
                生成任务
              </Button>
            </div>
          </>
        )}
        <JobList board={board} busy={busy} onAct={act} />
      </section>

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
    </>
  )
}

function BridgeCard({
  board,
  busy,
  onAct
}: {
  board: PsdBoard | null
  busy: boolean
  onAct: (fn: () => Promise<PsdBoard | null>, ok?: string) => Promise<void>
}): ReactElement {
  return (
    <section className={styles.card}>
      <h2 className={styles.title}>Photoshop</h2>
      <p className={styles.hint}>
        生成任务时，如果 Photoshop 没在运行，应用会在后台启动它，不把它拉到最前。任务完成后会退出这次启动的
        Photoshop；如果你中途在这个进程里继续作图，完成时仍会退出。超过 15
        分钟还没完成，就不再自动退出。当前备份不包含这些模板、素材和导出文件。
      </p>
      <ol className={styles.steps}>
        <li>开发阶段：Photoshop 完全退出后，仍要用 UXP Developer Tools 加载一次插件。同一次没退出就不用再加载。</li>
        <li>第一次在「阿卷 PSD」面板授权下面的桥接目录。授权会记住。</li>
        <li>插件加载后会自己处理队列，不必一直打开面板。面板用来看日志，或手动补跑。</li>
      </ol>
      <div className={styles.actions}>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => void onAct(() => unwrap(window.ajuan.psd.openBridge()).then(() => null))}
        >
          打开桥接目录
        </Button>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => void onAct(() => unwrap(window.ajuan.psd.openPlugin()).then(() => null))}
        >
          打开插件目录
        </Button>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => void onAct(() => unwrap(window.ajuan.psd.openPhotoshop()).then(() => null))}
        >
          打开 Photoshop
        </Button>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => void onAct(() => unwrap(window.ajuan.psd.sync()), '已同步')}
        >
          同步结果
        </Button>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() =>
            void onAct(async () => {
              const result = await unwrap(window.ajuan.psd.requeueStuck())
              return result.board
            }, '已检查中断任务')
          }
        >
          放回中断任务
        </Button>
      </div>
      <p className={styles.mono}>{board?.bridgeDir ?? '加载中…'}</p>
      <p className={styles.muted}>在访达的「文稿」里打开「阿卷 ERP」，授权时选择 psd-bridge。</p>
      <p className={styles.muted}>
        {board?.photoshopPath ? `找到 Photoshop：${fileName(board.photoshopPath)}` : '未找到 Photoshop'}
      </p>
    </section>
  )
}

function SlotRow({ slot, busy, onDelete }: { slot: PsdSlot; busy: boolean; onDelete: () => void }): ReactElement {
  return (
    <div className={styles.row}>
      <div className={styles.grow}>
        <div className={styles.name}>{slot.slotKey}</div>
        <div className={styles.meta}>
          狗图 {slot.dogLayer} · 名字 {slot.nameLayer}
        </div>
      </div>
      <Button variant="ghost" disabled={busy} onClick={onDelete}>
        移除
      </Button>
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
  onDelete
}: {
  title: string
  assets: PsdAsset[]
  busy: boolean
  onImport: () => void
  onDelete: (asset: PsdAsset) => void
}): ReactElement {
  return (
    <div>
      <div className={styles.actions}>
        <Button variant="secondary" disabled={busy} onClick={onImport}>
          导入{title}
        </Button>
      </div>
      {!assets.length && <p className={styles.muted}>还没有{title}。</p>}
      {!!assets.length && (
        <ul className={styles.list}>
          {assets.map((asset) => (
            <li key={asset.id} className={styles.row}>
              <img className={styles.thumb} src={asset.fileUrl} alt="" />
              <div className={styles.grow}>
                <div className={styles.name}>{asset.label}</div>
                <div className={styles.meta}>
                  {asset.width}×{asset.height}
                  {asset.hasAlpha ? '' : ' · 无透明通道'}
                </div>
              </div>
              <Button variant="ghost" disabled={busy} onClick={() => onDelete(asset)}>
                删除
              </Button>
            </li>
          ))}
        </ul>
      )}
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
    <ul className={styles.list}>
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
