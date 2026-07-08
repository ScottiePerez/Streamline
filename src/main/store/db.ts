import Database from 'better-sqlite3'

export type Db = Database.Database

export function openDb(path: string): Db {
  const db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  return db
}

function runMigrations(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      platform TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      display_name TEXT NOT NULL,
      avatar_url TEXT NOT NULL,
      text TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      badges TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS moderation_actions (
      id TEXT PRIMARY KEY,
      platform TEXT NOT NULL,
      type TEXT NOT NULL,
      target_user_id TEXT NOT NULL,
      target_username TEXT NOT NULL,
      moderator_name TEXT NOT NULL,
      reason TEXT,
      duration INTEGER,
      timestamp INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data TEXT NOT NULL
    );
  `)
}
