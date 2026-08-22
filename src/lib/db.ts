import Database from "better-sqlite3"
import { mkdirSync } from "fs"
import path from "path"

let db: Database.Database | null = null

/**
 * Lazily create/open the SQLite database on first use.
 *
 * Route modules are imported during `next build` (page-data collection), so
 * the filesystem must not be touched at module load time — on platforms like
 * Render the persistent disk (/var/data) is only mounted at runtime.
 */
export function getDb(): Database.Database {
  if (db) return db

  const dbUrl = process.env.DATABASE_URL ?? "./data/legal.db"
  const dbPath = path.isAbsolute(dbUrl)
    ? dbUrl
    : path.join(process.cwd(), "data", /*turbopackIgnore: true*/ path.basename(dbUrl))

  mkdirSync(path.dirname(dbPath), { recursive: true })

  db = new Database(dbPath)
  db.pragma("journal_mode = WAL")
  initDb(db)
  return db
}

function initDb(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      source_type TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chunks (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      embedding TEXT,
      metadata TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_chunks_document ON chunks(document_id);
  `)
}
