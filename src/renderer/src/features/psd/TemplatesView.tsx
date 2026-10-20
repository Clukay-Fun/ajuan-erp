/**
 * 描述: 定制 › 模板视图 (TemplatesView)
 * 主要功能:
 *   - 模板卡片：名称、文件路径（中间省略，悬停看全路径）、文件状态、位置数
 *   - 「更多」：编辑（打开向导）、删除（确认，注明不会删除 PSD 源文件）
 */

import { useState, type ReactElement } from 'react'
import { FileImage, MoreHorizontal, Pencil, Trash2, Plus } from 'lucide-react'
import type { PsdBoard, PsdTemplate } from '@shared/psd'
import { Button, ConfirmDialog, EmptyState, IconButton, Menu } from '@/components/ui'
import { unwrap } from '@/lib/api'
import { middleEllipsis } from './psdLabels'
import styles from './TemplatesView.module.css'

interface Props {
  board: PsdBoard | null
  busy: boolean
  onAct: (fn: () => Promise<PsdBoard | null>, ok?: string) => Promise<void>
  onNew: () => void
  onEdit: (template: PsdTemplate) => void
}

export function TemplatesView({ board, busy, onAct, onNew, onEdit }: Props): ReactElement {
  const [deleting, setDeleting] = useState<PsdTemplate | null>(null)
  const templates = board?.templates ?? []

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <span className={styles.count}>{templates.length} 个模板</span>
        <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={onNew}>
          新建模板
        </Button>
      </div>

      {board && !templates.length ? (
        <EmptyState
          icon={<FileImage size={24} />}
          title="还没有模板"
          description="选一个 PSD，告诉阿卷每个位置的狗狗图和名字图在哪个图层。"
          actions={[{ label: '新建模板', onClick: onNew, variant: 'primary' }]}
        />
      ) : (
        <ul className={styles.grid}>
          {templates.map((t) => (
            <li key={t.id} className={styles.card}>
              <div className={styles.cardHead}>
                <button type="button" className={styles.name} onClick={() => onEdit(t)}>
                  {t.name}
                </button>
                <Menu
                  align="end"
                  trigger={<IconButton label="更多" icon={<MoreHorizontal size={16} />} size="sm" />}
                  items={[
                    {
                      key: 'edit',
                      label: '编辑',
                      icon: <Pencil size={14} />,
                      onClick: () => onEdit(t)
                    },
                    'separator',
                    {
                      key: 'delete',
                      label: '删除',
                      icon: <Trash2 size={14} />,
                      danger: true,
                      onClick: () => setDeleting(t)
                    }
                  ]}
                />
              </div>
              <span className={styles.path} title={t.sourcePath}>
                {middleEllipsis(t.sourcePath, 44)}
              </span>
              <div className={styles.meta}>
                <span className={t.sourceExists ? styles.fileOk : styles.fileMissing}>
                  {t.sourceExists ? '文件可用' : '文件缺失'}
                </span>
                <span>{t.slots.length} 个位置</span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        danger
        title="删除模板？"
        description={deleting ? `「${deleting.name}」会从列表里去掉。不会删除 PSD 源文件，已经生成的文件也还在。` : ''}
        confirmText="删除模板"
        loading={busy}
        onConfirm={async () => {
          const target = deleting
          if (!target) return
          await onAct(() => unwrap(window.ajuan.psd.deleteTemplate(target.id)), '模板已删除')
          setDeleting(null)
        }}
      />
    </div>
  )
}
