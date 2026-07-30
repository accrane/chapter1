// Creates the Chapter1 schema in Postgres (Supabase). Idempotent — safe to
// re-run. Usage: npm run db:migrate  (needs DATABASE_URL in .env or the shell)
import { pool, query } from '../server/db.js';

// created_at columns store UTC 'YYYY-MM-DD HH24:MI:SS' text, matching the old
// SQLite datetime('now') format the app already parses and sorts on.
const NOW_TEXT = `to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS')`;

await query(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    email TEXT NOT NULL,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    yearly_goal INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT ${NOW_TEXT},
    stripe_customer_id TEXT,
    sub_status TEXT NOT NULL DEFAULT 'none',
    sub_period_end TEXT
  );
`);
await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users (lower(email));`);

await query(`
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT ${NOW_TEXT}
  );
`);
await query(`CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);`);

await query(`
  CREATE TABLE IF NOT EXISTS books (
    id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    author TEXT NOT NULL DEFAULT '',
    isbn TEXT,
    cover_url TEXT,
    pages INTEGER,
    status TEXT NOT NULL DEFAULT 'finished' CHECK (status IN ('want', 'reading', 'finished')),
    genre TEXT NOT NULL DEFAULT '',
    rating INTEGER CHECK (rating BETWEEN 1 AND 5),
    notes TEXT NOT NULL DEFAULT '',
    started_at TEXT,
    finished_at TEXT,
    created_at TEXT NOT NULL DEFAULT ${NOW_TEXT}
  );
`);
await query(`CREATE INDEX IF NOT EXISTS idx_books_user ON books (user_id);`);

await query(`
  CREATE TABLE IF NOT EXISTS genres (
    id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL
  );
`);
await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_genres_user_name ON genres (user_id, lower(name));`);

await query(`
  CREATE TABLE IF NOT EXISTS password_resets (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    used INTEGER NOT NULL DEFAULT 0
  );
`);

console.log('schema is up to date');
await pool.end();
