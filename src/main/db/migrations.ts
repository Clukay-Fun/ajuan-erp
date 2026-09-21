import type { Db } from './connection'
import { transaction, nowIso } from './connection'
import { m001Init } from './migrations/001_init'

export interface Migration {
  version: number
  name: string
  up(db: Db): void
}

export const MIGRATIONS: Migration[] = [m001Init]

/** 应用所有未执行的 migration。每个版本在独立事务内执行；重复调用无副作用。 */
export function runMigrations(db: Db, migrations: Migration[] = MIGRATIONS): number[] {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `)
  const applied = new Set(
    (db.prepare('SELECT version FROM schema_migrations').all() as { version: number }[]).map((r) => r.version)
  )
  const sorted = [...migrations].sort((a, b) => a.version - b.version)
  const ran: number[] = []
  for (const m of sorted) {
    if (applied.has(m.version)) continue
    transaction(db, () => {
      m.up(db)
      db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(
        m.version,
        m.name,
        nowIso()
      )
    })
    ran.push(m.version)
  }
  return ran
}

export function currentSchemaVersion(db: Db): number {
  const row = db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as { v: number | null }
  return row.v ?? 0
}
