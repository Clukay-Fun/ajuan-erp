import { describe, expect, it } from 'vitest'
import { openDatabase } from '../src/main/db/connection'
import { runMigrations, currentSchemaVersion, MIGRATIONS } from '../src/main/db/migrations'

describe('migrations', () => {
  it('全新库执行全部版本，并写入种子数据', () => {
    const db = openDatabase(':memory:')
    const ran = runMigrations(db)
    expect(ran).toEqual(MIGRATIONS.map((m) => m.version))
    expect(currentSchemaVersion(db)).toBe(MIGRATIONS.at(-1)!.version)
    expect(db.prepare('SELECT COUNT(*) AS c FROM products').get()).toEqual({ c: 1 })
    expect(db.prepare('SELECT COUNT(*) AS c FROM skus WHERE is_default = 1').get()).toEqual({ c: 1 })
    expect(db.prepare('SELECT COUNT(*) AS c FROM sales_channels').get()).toEqual({ c: 6 })
  })

  it('重复执行不再运行任何 migration，也不破坏数据', () => {
    const db = openDatabase(':memory:')
    runMigrations(db)
    db.prepare(`UPDATE products SET name = '改过的名字' WHERE id = 1`).run()
    expect(runMigrations(db)).toEqual([])
    expect(db.prepare('SELECT name FROM products WHERE id = 1').get()).toEqual({ name: '改过的名字' })
  })

  it('某个版本失败时回滚且不记录版本', () => {
    const db = openDatabase(':memory:')
    runMigrations(db)
    const bad = {
      version: 999,
      name: 'bad',
      up: (d: typeof db) => {
        d.exec('CREATE TABLE t (x)')
        throw new Error('boom')
      }
    }
    expect(() => runMigrations(db, [...MIGRATIONS, bad])).toThrow('boom')
    expect(currentSchemaVersion(db)).toBe(MIGRATIONS.at(-1)!.version)
    expect(() => db.exec('SELECT * FROM t')).toThrow()
  })
})
