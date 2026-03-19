import Database from "better-sqlite3";
import { join } from "node:path";

let _db: Database.Database | null = null;

function dbPath(): string {
  return process.env.DB_PATH ?? join(process.cwd(), "stabledesk.db");
}

export function getDatabase(): Database.Database {
  if (!_db) {
    _db = new Database(dbPath());
    _db.pragma("journal_mode = WAL");
    _db.pragma("foreign_keys = ON");
    initSchema(_db);
  }
  return _db;
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL
    );
  `);
}

/** Call once at server start to ensure the DB and schema exist. */
export function initializeDatabase(): void {
  getDatabase();
}

/** Reset the singleton — used in tests to get a fresh in-memory database. */
export function closeDatabase(): void {
  _db?.close();
  _db = null;
}
