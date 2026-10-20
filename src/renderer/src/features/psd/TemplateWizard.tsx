/**
 * 描述: 新建 / 编辑模板向导 (TemplateWizard)
 * 主要功能:
 *   - 三步：基本信息 → 配置位置 → 确认；顶部步骤可点击直接跳转
 *   - 位置表格：显示名自动为「第 N 位」，图层名默认 slot_0N_dog / slot_0N_name，可改、可增删行
 *   - 保存沿用现有接口：createTemplate + addSlot；编辑时只增删位置（现有接口不支持改名、换文件、改已有位置）
 */

import { useState, type ReactElement } from 'react'
import { Plus, Trash2, FileImage } from 'lucide-react'
import { isSafeLayerName, type PsdBoard, type PsdTemplate } from '@shared/psd'
import { Button, IconButton, Input, useDrawer } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { unwrap, errorMessage } from '@/lib/api'
import { fileName, middleEllipsis, slotKeyOf, slotLabel } from './psdLabels'
import styles from './TemplateWizard.module.css'

interface Row {
  /** 已存在的位置有 id，新加的没有 */
  id?: number
  slotKey: string
  dogLayer: string
  nameLayer: string
}

interface Props {
  template?: PsdTemplate
  onSaved: (board: PsdBoard) => void
}

const STEPS = ['基本信息', '配置位置', '确认'] as const

function nextRow(rows: Row[]): Row | null {
  const used = new Set(rows.map((r) => r.slotKey))
  for (let n = 1; n <= 99; n++) {
    const slotKey = slotKeyOf(n)
    if (!used.has(slotKey))
      return {
        slotKey,
        dogLayer: `${slotKey}_dog`,
        nameLayer: `${slotKey}_name`
      }
  }
  return null
}

export function TemplateWizard({ template, onSaved }: Props): ReactElement {
  const toast = useToast()
  const { closeDrawer, setDirty } = useDrawer()
  const editing = !!template
  const [step, setStep] = useState(0)
  const [name, setName] = useState(template?.name ?? '')
  const [sourcePath, setSourcePath] = useState(template?.sourcePath ?? '')
  const [rows, setRows] = useState<Row[]>(() => (template ? template.slots.map((s) => ({ ...s })) : [nextRow([])!]))
  const [busy, setBusy] = useState(false)

  const touch = (): void => setDirty(true)

  const stepError = [
    !name.trim() ? '先填写模板名称' : !sourcePath ? '先选择 PSD 文件' : null,
    !rows.length
      ? '至少需要一个位置'
      : rows.some((r) => !isSafeLayerName(r.dogLayer.trim()) || !isSafeLayerName(r.nameLayer.trim()))
        ? '图层名不能为空，也不能包含 / \\ : * ? " < > |'
        : null,
    null
  ]
  const firstError = stepError.findIndex((e) => e !== null)

  async function pickFile(): Promise<void> {
    try {
      const path = await unwrap(window.ajuan.psd.pickTemplate())
      if (path) {
        setSourcePath(path)
        if (!name.trim()) setName(fileName(path).replace(/\.psd$/i, ''))
        touch()
      }
    } catch (err) {
      toast(errorMessage(err), 'error')
    }
  }

  function updateRow(index: number, patch: Partial<Row>): void {
    setRows((rs) => rs.map((r, i) => (i === index ? { ...r, ...patch } : r)))
    touch()
  }

  async function save(): Promise<void> {
    setBusy(true)
    try {
      let board: PsdBoard
      let templateId: number
      if (template) {
        board = await unwrap(window.ajuan.psd.getBoard())
        templateId = template.id
        const kept = new Set(rows.filter((r) => r.id).map((r) => r.id))
        for (const slot of template.slots) {
          if (!kept.has(slot.id)) board = await unwrap(window.ajuan.psd.deleteSlot(slot.id))
        }
      } else {
        board = await unwrap(window.ajuan.psd.createTemplate({ name: name.trim(), sourcePath }))
        templateId = Math.max(...board.templates.map((t) => t.id))
      }
      for (const row of rows.filter((r) => !r.id)) {
        board = await unwrap(
          window.ajuan.psd.addSlot({
            templateId,
            slotKey: row.slotKey,
            dogLayer: row.dogLayer.trim(),
            nameLayer: row.nameLayer.trim()
          })
        )
      }
      onSaved(board)
      toast(editing ? '模板已更新' : '模板已保存', 'success')
      closeDrawer(true)
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  const canJump = (i: number): boolean => editing || i <= step || firstError === -1 || i <= firstError

  return (
    <div className={styles.root}>
      <ol className={styles.steps}>
        {STEPS.map((label, i) => (
          <li key={label}>
            <button
              type="button"
              className={styles.step}
              data-active={i === step || undefined}
              data-done={i < step || undefined}
              disabled={!canJump(i)}
              onClick={() => setStep(i)}
            >
              <span className={styles.stepNo}>{i + 1}</span>
              {label}
            </button>
          </li>
        ))}
        <li className={styles.stepCount}>
          {step + 1}/{STEPS.length}
        </li>
      </ol>

      <div className={styles.body}>
        {step === 0 && (
          <div className={styles.form}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>模板名称</span>
              <Input
                value={name}
                maxLength={64}
                disabled={editing}
                placeholder="例如：六宫格"
                autoFocus={!editing}
                onChange={(e) => {
                  setName(e.target.value)
                  touch()
                }}
              />
            </label>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>PSD 文件</span>
              <div className={styles.fileRow}>
                <FileImage size={16} className={styles.fileIcon} />
                <span className={styles.filePath} title={sourcePath}>
                  {sourcePath ? middleEllipsis(sourcePath, 60) : '还没有选择'}
                </span>
                {!editing && (
                  <Button variant="secondary" size="sm" onClick={() => void pickFile()}>
                    {sourcePath ? '重新选择' : '选择 PSD'}
                  </Button>
                )}
              </div>
              <span className={styles.note}>生成时只复制模板，不会修改源文件。</span>
            </div>
            {editing && <p className={styles.note}>已有模板不能改名或更换文件；需要时可以新建一个模板。</p>}
          </div>
        )}

        {step === 1 && (
          <div className={styles.slots}>
            <p className={styles.note}>
              图层名需要与 PSD 中的图层名一致，替换的图层应为智能对象。
              {editing && '已有位置只能删除；要改图层名，删掉后重新添加。'}
            </p>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.colName}>位置</th>
                  <th>狗狗图层名</th>
                  <th>名字图层名</th>
                  <th className={styles.colAction} aria-label="操作" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={row.slotKey}>
                    <td className={styles.slotName}>{slotLabel(row.slotKey)}</td>
                    <td>
                      <Input
                        value={row.dogLayer}
                        disabled={!!row.id}
                        aria-label={`${slotLabel(row.slotKey)}狗狗图层名`}
                        onChange={(e) => updateRow(i, { dogLayer: e.target.value })}
                      />
                    </td>
                    <td>
                      <Input
                        value={row.nameLayer}
                        disabled={!!row.id}
                        aria-label={`${slotLabel(row.slotKey)}名字图层名`}
                        onChange={(e) => updateRow(i, { nameLayer: e.target.value })}
                      />
                    </td>
                    <td>
                      <IconButton
                        label="删除这个位置"
                        icon={<Trash2 size={14} />}
                        size="sm"
                        onClick={() => {
                          setRows((rs) => rs.filter((_, j) => j !== i))
                          touch()
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div>
              <Button
                variant="ghost"
                size="sm"
                icon={<Plus size={14} />}
                disabled={rows.length >= 99}
                onClick={() => {
                  const row = nextRow(rows)
                  if (row) setRows((rs) => [...rs, row].sort((a, b) => a.slotKey.localeCompare(b.slotKey)))
                  touch()
                }}
              >
                添加位置
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <dl className={styles.summary}>
            <dt>模板名称</dt>
            <dd className={styles.summaryName}>{name.trim()}</dd>
            <dt>PSD 文件</dt>
            <dd className={styles.mono} title={sourcePath}>
              {middleEllipsis(sourcePath, 64)}
            </dd>
            <dt>位置</dt>
            <dd>
              {rows.length} 个：
              {rows.map((r) => slotLabel(r.slotKey)).join('、')}
            </dd>
          </dl>
        )}
      </div>

      <footer className={styles.footer}>
        {stepError[step] && <span className={styles.footerHint}>{stepError[step]}</span>}
        <Button variant="ghost" disabled={busy} onClick={() => (step === 0 ? closeDrawer() : setStep(step - 1))}>
          {step === 0 ? '取消' : '上一步'}
        </Button>
        {step < STEPS.length - 1 ? (
          <Button variant="primary" disabled={!!stepError[step]} onClick={() => setStep(step + 1)}>
            下一步
          </Button>
        ) : (
          <Button variant="primary" loading={busy} disabled={firstError !== -1} onClick={() => void save()}>
            保存模板
          </Button>
        )}
      </footer>
    </div>
  )
}
