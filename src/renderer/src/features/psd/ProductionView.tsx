/**
 * 描述: 定制 › 生产视图 (ProductionView)
 * 主要功能:
 *   - 步骤提示 ① 模板 → ② 素材 → ③ 生成 → ④ 结果（只提示，不强制顺序）
 *   - 模板选择：记住上次用的模板；模板文件不可用时给「去修复」
 *   - 位置卡片：勾选 + 狗狗图 / 名字图两个落位框，点击从素材库选，或从右侧拖进来
 *   - 素材库：狗狗图 / 名字图页签、导入、抠白底（处理中 / 待确认）、删除
 *   - 吸底生成栏：标题、格式、规则说明、生成按钮（无法生成时写明原因）
 */

import { useEffect, useMemo, useState, type DragEvent, type ReactElement } from 'react'
import { Check, ImagePlus, Info, Trash2, Upload, Wand2, X } from 'lucide-react'
import type { PsdAsset, PsdAssetKind, PsdBoard, PsdExportFormat, PsdSlot, PsdTemplate } from '@shared/psd'
import { Button, IconButton, Input, Menu, SegmentedControl, Select, Tooltip } from '@/components/ui'
import { unwrap } from '@/lib/api'
import { CUTOUT_STATUS_LABEL, slotLabel } from './psdLabels'
import styles from './ProductionView.module.css'

const TEMPLATE_KEY = 'ajuan.psdTemplateId'
const DRAG_TYPE = 'application/x-ajuan-asset'
const KIND_LABEL: Record<PsdAssetKind, string> = {
  dog: '狗狗图',
  name: '名字图'
}

interface Pick {
  enabled: boolean
  dogId: number
  nameId: number
}
const EMPTY_PICK: Pick = { enabled: false, dogId: 0, nameId: 0 }

interface Props {
  board: PsdBoard | null
  busy: boolean
  psReady: boolean
  onAct: (fn: () => Promise<PsdBoard | null>, ok?: string) => Promise<void>
  onGoTemplates: () => void
  onNewTemplate: () => void
  onReviewCutout: (jobId: number) => void
  onDeleteAsset: (asset: PsdAsset) => void
}

function readTemplateId(): number | null {
  try {
    const v = Number(localStorage.getItem(TEMPLATE_KEY))
    return Number.isInteger(v) && v > 0 ? v : null
  } catch {
    return null
  }
}

export function ProductionView({
  board,
  busy,
  psReady,
  onAct,
  onGoTemplates,
  onNewTemplate,
  onReviewCutout,
  onDeleteAsset
}: Props): ReactElement {
  const [templateId, setTemplateId] = useState<number | null>(readTemplateId)
  const [picks, setPicks] = useState<Record<number, Pick>>({})
  const [title, setTitle] = useState('')
  const [format, setFormat] = useState<PsdExportFormat>('psd')
  const [libKind, setLibKind] = useState<PsdAssetKind>('dog')

  const templates = board?.templates ?? []
  const template: PsdTemplate | null = templates.find((t) => t.id === templateId) ?? templates[0] ?? null

  useEffect(() => {
    setPicks({})
  }, [template?.id])

  function chooseTemplate(id: number): void {
    setTemplateId(id)
    try {
      localStorage.setItem(TEMPLATE_KEY, String(id))
    } catch {
      // 记不住也不影响使用
    }
  }

  const assets = board?.assets ?? []
  const assetById = new Map(assets.map((a) => [a.id, a]))
  const libAssets = assets.filter((a) => a.kind === libKind)
  const cutoutByAsset = useMemo(() => {
    const map = new Map<number, NonNullable<PsdBoard['cutouts']>[number]>()
    for (const job of board?.cutouts ?? []) {
      if (['queued', 'running', 'ready', 'failed'].includes(job.status) && !map.has(job.assetId))
        map.set(job.assetId, job)
    }
    return map
  }, [board?.cutouts])

  const slots = template?.slots ?? []
  const pickOf = (slot: PsdSlot): Pick => picks[slot.id] ?? EMPTY_PICK
  const setPick = (slot: PsdSlot, patch: Partial<Pick>): void =>
    setPicks((cur) => ({
      ...cur,
      [slot.id]: { ...(cur[slot.id] ?? EMPTY_PICK), ...patch }
    }))

  const chosen = slots.filter((s) => pickOf(s).enabled)
  const blocker = ((): string | null => {
    if (!template) return '先选择模板'
    if (!template.sourceExists) return '模板文件缺失'
    if (!chosen.length) return '先勾选至少一个位置'
    for (const s of chosen) {
      if (!pickOf(s).dogId) return `${slotLabel(s.slotKey)}缺少狗狗图`
      if (!pickOf(s).nameId) return `${slotLabel(s.slotKey)}缺少名字图`
    }
    if (!title.trim()) return '先填写定制标题'
    return null
  })()

  const activeJobs = board?.jobs.filter((j) => j.status === 'queued' || j.status === 'running').length ?? 0
  const currentStep = !template
    ? 0
    : activeJobs
      ? 3
      : !chosen.length || (blocker && blocker !== '先填写定制标题')
        ? 1
        : 2

  function submit(): void {
    if (!template || blocker) return
    const items = chosen.map((s) => ({
      slotId: s.id,
      dogAssetId: pickOf(s).dogId,
      nameAssetId: pickOf(s).nameId
    }))
    void onAct(async () => {
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
    }, '已加入生成队列')
  }

  function dropOn(slot: PsdSlot, kind: PsdAssetKind, e: DragEvent): void {
    e.preventDefault()
    const [k, id] = e.dataTransfer.getData(DRAG_TYPE).split(':')
    if (k !== kind || !Number(id)) return
    setPick(slot, {
      enabled: true,
      [kind === 'dog' ? 'dogId' : 'nameId']: Number(id)
    })
  }

  return (
    <div className={styles.root}>
      <ol className={styles.steps} aria-label="步骤">
        {['模板', '素材', '生成', '结果'].map((label, i) => (
          <li key={label} data-active={i === currentStep || undefined}>
            <span className={styles.stepNo}>{i + 1}</span>
            {label}
          </li>
        ))}
      </ol>

      <div className={styles.templateRow}>
        <span className={styles.rowLabel}>模板</span>
        {templates.length ? (
          <div className={styles.templateSelect}>
            <Select
              value={String(template?.id ?? '')}
              options={templates.map((t) => ({
                value: String(t.id),
                label: `${t.name} · ${t.slots.length} 个位置`
              }))}
              onChange={(v) => chooseTemplate(Number(v))}
            />
          </div>
        ) : (
          <span className={styles.muted}>
            还没有模板。
            <button type="button" className={styles.link} onClick={onNewTemplate}>
              新建模板
            </button>
          </span>
        )}
        {template && !template.sourceExists && (
          <span className={styles.danger}>
            模板文件不在原位置。
            <button type="button" className={styles.link} onClick={onGoTemplates}>
              去修复
            </button>
          </span>
        )}
      </div>

      <div className={styles.split}>
        <section className={styles.slotsPanel} aria-label="位置">
          {!template && board && (
            <div className={styles.slotsEmpty}>
              <p>先新建一个模板，模板里的位置会显示在这里。</p>
              <Button variant="secondary" size="sm" onClick={onNewTemplate}>
                新建模板
              </Button>
            </div>
          )}
          {template && !slots.length && (
            <p className={styles.muted}>
              这个模板还没有位置。
              <button type="button" className={styles.link} onClick={onGoTemplates}>
                去配置
              </button>
            </p>
          )}
          <div className={styles.slotGrid}>
            {slots.map((slot) => {
              const pick = pickOf(slot)
              const incomplete = pick.enabled && (!pick.dogId || !pick.nameId)
              return (
                <article
                  key={slot.id}
                  className={styles.slotCard}
                  data-selected={pick.enabled || undefined}
                  data-incomplete={incomplete || undefined}
                >
                  <label className={styles.slotHead}>
                    <span className={styles.slotName}>{slotLabel(slot.slotKey)}</span>
                    <input
                      type="checkbox"
                      className={styles.check}
                      checked={pick.enabled}
                      onChange={(e) => setPick(slot, { enabled: e.target.checked })}
                    />
                  </label>
                  <div className={styles.drops}>
                    {(['dog', 'name'] as const).map((kind) => {
                      const id = kind === 'dog' ? pick.dogId : pick.nameId
                      const asset = id ? assetById.get(id) : undefined
                      const options = assets.filter((a) => a.kind === kind)
                      return (
                        <Menu
                          key={kind}
                          trigger={
                            <button
                              type="button"
                              className={styles.drop}
                              data-filled={asset ? true : undefined}
                              aria-label={`${slotLabel(slot.slotKey)}${KIND_LABEL[kind]}`}
                              onDragOver={(e) => {
                                if (e.dataTransfer.types.includes(DRAG_TYPE)) e.preventDefault()
                              }}
                              onDrop={(e) => dropOn(slot, kind, e)}
                            >
                              {asset ? (
                                <img src={asset.fileUrl} alt="" className={styles.dropImg} />
                              ) : (
                                <span className={styles.dropEmpty}>
                                  <ImagePlus size={16} />
                                  拖入或点击选择
                                </span>
                              )}
                              <span className={styles.dropLabel}>{asset ? asset.label : KIND_LABEL[kind]}</span>
                            </button>
                          }
                          items={
                            options.length
                              ? [
                                  ...options.map((a) => ({
                                    key: String(a.id),
                                    icon: <img src={a.fileUrl} alt="" className={styles.menuThumb} />,
                                    label: a.label,
                                    onClick: () =>
                                      setPick(slot, {
                                        enabled: true,
                                        [kind === 'dog' ? 'dogId' : 'nameId']: a.id
                                      })
                                  })),
                                  ...(asset
                                    ? [
                                        'separator' as const,
                                        {
                                          key: 'clear',
                                          icon: <X size={14} />,
                                          label: '清除',
                                          onClick: () =>
                                            setPick(slot, {
                                              [kind === 'dog' ? 'dogId' : 'nameId']: 0
                                            })
                                        }
                                      ]
                                    : [])
                                ]
                              : [
                                  {
                                    key: 'none',
                                    label: `素材库里还没有${KIND_LABEL[kind]}`,
                                    disabled: true
                                  }
                                ]
                          }
                        />
                      )
                    })}
                  </div>
                </article>
              )
            })}
          </div>
        </section>

        <section className={styles.library} aria-label="素材库">
          <div className={styles.libHead}>
            <SegmentedControl
              options={[
                {
                  value: 'dog',
                  label: '狗狗图',
                  count: assets.filter((a) => a.kind === 'dog').length || undefined
                },
                {
                  value: 'name',
                  label: '名字图',
                  count: assets.filter((a) => a.kind === 'name').length || undefined
                }
              ]}
              value={libKind}
              onChange={setLibKind}
            />
            <Button
              variant="secondary"
              size="sm"
              icon={<Upload size={14} />}
              disabled={busy}
              onClick={() =>
                void onAct(() => unwrap(window.ajuan.psd.importAsset(libKind)), `${KIND_LABEL[libKind]}已导入`)
              }
            >
              导入
            </Button>
          </div>
          <p className={styles.libHint}>
            拖到左侧的框里即可使用。白底图可先「抠白底」，确认后另存一张透明图，原图保留。
          </p>
          {!libAssets.length ? (
            <p className={styles.libEmpty}>还没有{KIND_LABEL[libKind]}，点「导入」添加 PNG 或 JPG。</p>
          ) : (
            <ul className={styles.libGrid}>
              {libAssets.map((asset) => {
                const cutout = cutoutByAsset.get(asset.id)
                const pending = cutout && cutout.status !== 'failed'
                return (
                  <li
                    key={asset.id}
                    className={styles.libItem}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(DRAG_TYPE, `${asset.kind}:${asset.id}`)
                      e.dataTransfer.effectAllowed = 'copy'
                    }}
                  >
                    <div className={styles.libThumb}>
                      <img src={asset.fileUrl} alt="" />
                      {cutout && (
                        <span className={styles.libBadge} data-status={cutout.status}>
                          {CUTOUT_STATUS_LABEL[cutout.status]}
                        </span>
                      )}
                    </div>
                    <div className={styles.libName} title={asset.label}>
                      {asset.label}
                    </div>
                    <div className={styles.libMeta}>
                      {asset.width}×{asset.height}
                      {asset.hasAlpha ? ' · 透明' : ''}
                    </div>
                    <div className={styles.libActions}>
                      {cutout?.status === 'ready' ? (
                        <Button variant="secondary" size="sm" onClick={() => onReviewCutout(cutout.id)}>
                          查看结果
                        </Button>
                      ) : (
                        <IconButton
                          label={pending ? '抠白底处理中' : '抠白底'}
                          icon={<Wand2 size={14} />}
                          size="sm"
                          disabled={busy || !!pending}
                          onClick={() =>
                            void onAct(() => unwrap(window.ajuan.psd.createCutout(asset.id)), '已开始抠白底')
                          }
                        />
                      )}
                      <IconButton
                        label="删除素材"
                        icon={<Trash2 size={14} />}
                        size="sm"
                        disabled={busy || !!pending}
                        onClick={() => onDeleteAsset(asset)}
                      />
                    </div>
                    {cutout?.status === 'failed' && cutout.error && (
                      <div className={styles.libError} title={cutout.error}>
                        抠图失败：{cutout.error}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>

      <div className={styles.bar}>
        <div className={styles.barRow}>
          <div className={styles.titleInput}>
            <Input
              value={title}
              maxLength={60}
              placeholder="定制标题，用作导出文件名"
              aria-label="定制标题"
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit()
              }}
            />
          </div>
          <div className={styles.formatSelect}>
            <Select
              value={format}
              options={[
                { value: 'psd', label: 'PSD' },
                { value: 'tiff', label: 'TIFF' }
              ]}
              onChange={(v) => setFormat(v as PsdExportFormat)}
            />
          </div>
          <Tooltip
            content={
              <span className={styles.tip}>
                PSD 和 TIFF 都会写入 W1 红色专色通道（密度 100%），内容取本次合并图层的透明形状。
                <br />
                素材按圆内矩形区域等比例缩放，完整显示、不拉伸；外圆保留圆形边界。
              </span>
            }
          >
            <span className={styles.info} tabIndex={0} aria-label="导出规则">
              <Info size={16} />
            </span>
          </Tooltip>
          <span className={styles.spacer} />
          {blocker && <span className={styles.blocker}>{blocker}</span>}
          {!blocker && !psReady && <span className={styles.blocker}>Photoshop 未就绪，任务会先排队</span>}
          <Button
            variant="primary"
            icon={<Check size={14} />}
            disabled={busy || !!blocker}
            disabledReason={blocker ?? undefined}
            onClick={submit}
          >
            生成{chosen.length ? `（${chosen.length} 个位置）` : ''}
          </Button>
        </div>
        <p className={styles.rule}>只选一个位置就是单张替换；选多个会写进同一个文件；模板里的示例图案会自动清除。</p>
      </div>
    </div>
  )
}
