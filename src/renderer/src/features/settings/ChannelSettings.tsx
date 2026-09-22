import type { FormEvent, ReactElement } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { Plus, Pencil, Check, X } from 'lucide-react'
import type { SalesChannel } from '@shared/types'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { useToast } from '@/components/Toast'
import { unwrap, errorMessage } from '@/lib/api'
import styles from './ChannelSettings.module.css'

export function ChannelSettings(): ReactElement {
  const toast = useToast()
  const [channels, setChannels] = useState<SalesChannel[]>([])
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setChannels(await unwrap(window.ajuan.channels.list()))
    } catch (err) {
      toast(errorMessage(err), 'error')
    }
  }, [toast])
  useEffect(() => {
    void load()
  }, [load])

  async function act(fn: () => Promise<unknown>, ok: string): Promise<void> {
    setBusy(true)
    try {
      await fn()
      toast(ok, 'success')
      await load()
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  function handleAdd(e: FormEvent): void {
    e.preventDefault()
    if (!newName.trim()) return
    void act(async () => {
      await unwrap(window.ajuan.channels.create({ name: newName }))
      setNewName('')
    }, '渠道已添加')
  }

  function saveEdit(c: SalesChannel): void {
    void act(async () => {
      await unwrap(window.ajuan.channels.update(c.id, { name: editName, isActive: c.isActive }))
      setEditingId(null)
    }, '渠道已更新')
  }

  return (
    <section className={styles.card}>
      <h2 className={styles.title}>销售渠道</h2>
      <p className={styles.hint}>出库单可选择的渠道。停用后不再出现在新单据中，历史单据不受影响。</p>
      <form className={styles.add} onSubmit={handleAdd}>
        <input
          className={styles.input}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="新渠道名称"
          maxLength={32}
        />
        <Button variant="primary" type="submit" disabled={busy || !newName.trim()}>
          <Plus size={16} /> 添加
        </Button>
      </form>
      <ul className={styles.list}>
        {channels.map((c) => (
          <li key={c.id} className={styles.row}>
            {editingId === c.id ? (
              <>
                <input
                  className={styles.input}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  maxLength={32}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveEdit(c)
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                />
                <Button
                  variant="ghost"
                  onClick={() => saveEdit(c)}
                  disabled={busy || !editName.trim()}
                  aria-label="保存"
                >
                  <Check size={16} />
                </Button>
                <Button variant="ghost" onClick={() => setEditingId(null)} disabled={busy} aria-label="取消">
                  <X size={16} />
                </Button>
              </>
            ) : (
              <>
                <span className={`${styles.name} ${c.isActive ? '' : styles.inactive}`}>{c.name}</span>
                {!c.isActive && <Badge>已停用</Badge>}
                <span className={styles.spacer} />
                <Button
                  variant="ghost"
                  onClick={() => {
                    setEditingId(c.id)
                    setEditName(c.name)
                  }}
                  disabled={busy}
                  aria-label="重命名"
                >
                  <Pencil size={15} />
                </Button>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() =>
                    act(
                      () => unwrap(window.ajuan.channels.update(c.id, { name: c.name, isActive: !c.isActive })),
                      c.isActive ? '渠道已停用' : '渠道已启用'
                    )
                  }
                >
                  {c.isActive ? '停用' : '启用'}
                </Button>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
