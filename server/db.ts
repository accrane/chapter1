import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Minimal .env loader for local dev (Vercel injects env vars in production).
if (!process.env.DATABASE_URL) {
  const envPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in process.env)) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    }
  }
}

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Add it to .env (local) or the Vercel project env.');
}

// Small pool: on serverless each instance should hold few connections; use the
// Supabase transaction pooler (port 6543) connection string in production.
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,
  idleTimeoutMillis: 30_000
});

export function query<T extends pg.QueryResultRow = any>(text: string, params?: unknown[]) {
  return pool.query<T>(text, params);
}

export const DEFAULT_GENRES = [
  'Biography', 'Fantasy', 'History', 'Horror', 'Literary Fiction', 'Mystery',
  'Nonfiction', 'Poetry', 'Romance', 'Sci-Fi', 'Science', 'Self-Help',
  'Thriller', 'Young Adult'
];

export async function seedDefaultGenres(userId: number) {
  const values = DEFAULT_GENRES.map((_, i) => `($1, $${i + 2})`).join(', ');
  await query(
    `INSERT INTO genres (user_id, name) VALUES ${values}
     ON CONFLICT (user_id, lower(name)) DO NOTHING`,
    [userId, ...DEFAULT_GENRES]
  );
}
