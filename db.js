import { createClient } from '@libsql/client';

// Turso (libsql) in production; a local SQLite file in development.
export const db = createClient({
  url: process.env.TURSO_DATABASE_URL || 'file:local.db',
  authToken: process.env.TURSO_AUTH_TOKEN || undefined,
});

export async function initDb() {
  await db.batch(
    [
      `CREATE TABLE IF NOT EXISTS tasks (
         id         INTEGER PRIMARY KEY AUTOINCREMENT,
         date       TEXT    NOT NULL,
         time       TEXT    NOT NULL,
         title      TEXT    NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
         done       INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0, 1)),
         created_at TEXT    NOT NULL DEFAULT (datetime('now'))
       )`,
      `CREATE INDEX IF NOT EXISTS idx_tasks_date ON tasks (date, time)`,
      `CREATE TABLE IF NOT EXISTS block_completions (
         date      TEXT    NOT NULL,
         block_key TEXT    NOT NULL,
         done      INTEGER NOT NULL DEFAULT 1 CHECK (done IN (0, 1)),
         PRIMARY KEY (date, block_key)
       )`,
    ],
    'write',
  );
}
