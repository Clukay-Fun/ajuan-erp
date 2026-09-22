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

describe('transaction 嵌套', () => {
  it('内层失败只回滚自己，外层继续；外层失败全部回滚', async () => {
    const { transaction } = await import('../src/main/db/connection')
    const db = openDatabase(':memory:')
    db.exec('CREATE TABLE t (v INTEGER)')
    transaction(db, () => {
      db.exec('INSERT INTO t VALUES (1)')
      try {
        transaction(db, () => {
          db.exec('INSERT INTO t VALUES (2)')
          throw new Error('inner')
        })
      } catch {
        /* 内层已回滚 */
      }
      db.exec('INSERT INTO t VALUES (3)')
    })
    expect(db.prepare('SELECT v FROM t ORDER BY v').all()).toEqual([{ v: 1 }, { v: 3 }])
    expect(() =>
      transaction(db, () => {
        db.exec('INSERT INTO t VALUES (4)')
        transaction(db, () => db.exec('INSERT INTO t VALUES (5)'))
        throw new Error('outer')
      })
    ).toThrow('outer')
    expect(db.prepare('SELECT COUNT(*) AS c FROM t').get()).toEqual({ c: 2 })
  })
})
