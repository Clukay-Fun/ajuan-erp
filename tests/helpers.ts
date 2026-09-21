import { openDatabase, type Db } from '../src/main/db/connection'
import { runMigrations } from '../src/main/db/migrations'

export function testDb(): Db {
  const db = openDatabase(':memory:')
  runMigrations(db)
  return db
}
