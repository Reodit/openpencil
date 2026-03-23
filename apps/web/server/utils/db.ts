// @ts-expect-error bun:sqlite is a Bun built-in, no type declarations in tsc
import { Database } from 'bun:sqlite'
import { resolve } from 'node:path'
import { mkdirSync, existsSync } from 'node:fs'

const DATA_DIR = resolve(process.cwd(), 'data')
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })

const DB_PATH = resolve(DATA_DIR, 'openpencil.db')

let _db: Database | null = null

export function getDB(): Database {
  if (!_db) {
    _db = new Database(DB_PATH)
    _db.run('PRAGMA journal_mode = WAL')
    _db.run('PRAGMA foreign_keys = ON')
    migrate(_db)
  }
  return _db
}

function migrate(db: Database) {
  db.run(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT 'Untitled',
      data TEXT NOT NULL,
      thumbnail TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
}
