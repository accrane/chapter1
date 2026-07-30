import express from 'express';
import crypto from 'node:crypto';
import { waitUntil } from '@vercel/functions';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { query, seedDefaultGenres } from './db.js';
import { sendEmail } from './email.js';
import { rateLimit } from './ratelimit.js';
import {
  APP_URL,
  BILLING_ENABLED,
  cancelSubscriptionIfAny,
  createCheckoutUrl,
  createPortalUrl,
  entitlement,
  handleWebhook,
  hasWriteAccess
} from './billing.js';

export const app = express();

// Stripe webhooks are signature-verified against the raw body, so this route
// must be mounted before the JSON body parser.
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    await handleWebhook(req.body, String(req.headers['stripe-signature'] ?? ''));
    res.json({ received: true });
  } catch (err) {
    console.error('webhook rejected:', err);
    res.status(400).json({ error: 'Invalid webhook' });
  }
});

app.use(express.json());

const isProd = process.env.NODE_ENV === 'production';
// In dev, Vite owns PORT (and tooling may inject it); the API listens on its own port.
const PORT = Number(process.env.API_PORT ?? (isProd ? process.env.PORT : undefined)) || 3001;

// ---------- password hashing (scrypt, no external deps) ----------

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(candidate, Buffer.from(hash, 'hex'));
}

// ---------- sessions ----------

interface User {
  id: number;
  email: string;
  name: string;
  password_hash: string;
  yearly_goal: number;
  created_at: string;
  stripe_customer_id: string | null;
  sub_status: string;
  sub_period_end: string | null;
}

async function getSessionUser(req: express.Request): Promise<User | undefined> {
  const cookie = req.headers.cookie ?? '';
  const match = cookie.match(/(?:^|;\s*)session=([a-f0-9]{64})/);
  if (!match) return undefined;
  const { rows } = await query<User>(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = $1`,
    [match[1]]
  );
  return rows[0];
}

async function createSession(res: express.Response, userId: number) {
  const token = crypto.randomBytes(32).toString('hex');
  await query(`INSERT INTO sessions (token, user_id) VALUES ($1, $2)`, [token, userId]);
  res.setHeader(
    'Set-Cookie',
    `session=${token}; HttpOnly; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax${isProd ? '; Secure' : ''}`
  );
}

async function requireAuth(req: express.Request, res: express.Response): Promise<User | undefined> {
  const user = await getSessionUser(req);
  if (!user) res.status(401).json({ error: 'Not signed in' });
  return user;
}

function publicUser(u: User) {
  return { id: u.id, email: u.email, name: u.name, yearly_goal: u.yearly_goal, billing: entitlement(u) };
}

// Express 4 swallows rejected promises from async handlers; this keeps a DB
// hiccup from hanging the request.
function wrap(fn: (req: express.Request, res: express.Response) => Promise<unknown>) {
  return (req: express.Request, res: express.Response) => {
    fn(req, res).catch((err) => {
      console.error(`${req.method} ${req.path} failed:`, err);
      if (!res.headersSent) res.status(500).json({ error: 'Something went wrong. Try again.' });
    });
  };
}

// ---------- auth routes ----------

app.post('/api/auth/register', rateLimit('register', 10, 15 * 60_000), wrap(async (req, res) => {
  const { email, name, password } = req.body ?? {};
  if (typeof email !== 'string' || !email.includes('@') || typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'Valid email and a password of at least 8 characters required' });
  }
  const displayName = typeof name === 'string' && name.trim() ? name.trim() : email.split('@')[0];
  try {
    const { rows } = await query<User>(
      `INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3) RETURNING *`,
      [email.trim(), displayName, hashPassword(password)]
    );
    const user = rows[0];
    await seedDefaultGenres(user.id);
    await createSession(res, user.id);
    res.json({ user: publicUser(user) });
  } catch (err: any) {
    if (err?.code === '23505') {
      return res.status(409).json({ error: 'An account with that email already exists' });
    }
    throw err;
  }
}));

app.post('/api/auth/login', rateLimit('login', 20, 15 * 60_000), wrap(async (req, res) => {
  const { email, password } = req.body ?? {};
  const { rows } = await query<User>(`SELECT * FROM users WHERE lower(email) = lower($1)`, [
    String(email ?? '').trim()
  ]);
  const user = rows[0];
  if (!user || !verifyPassword(String(password ?? ''), user.password_hash)) {
    return res.status(401).json({ error: 'Wrong email or password' });
  }
  await createSession(res, user.id);
  res.json({ user: publicUser(user) });
}));

app.post('/api/auth/logout', wrap(async (req, res) => {
  const cookie = req.headers.cookie ?? '';
  const match = cookie.match(/(?:^|;\s*)session=([a-f0-9]{64})/);
  if (match) await query(`DELETE FROM sessions WHERE token = $1`, [match[1]]);
  res.setHeader('Set-Cookie', 'session=; HttpOnly; Path=/; Max-Age=0');
  res.json({ ok: true });
}));

app.get('/api/auth/me', wrap(async (req, res) => {
  const user = await getSessionUser(req);
  res.json({ user: user ? publicUser(user) : null });
}));

// On Vercel the function freezes as soon as the response is sent, so work
// that continues past res.json() must be registered with waitUntil.
function afterResponse(work: Promise<void>) {
  const guarded = work.catch((err) => console.error('background work failed:', err));
  if (process.env.VERCEL) waitUntil(guarded);
}

app.post('/api/auth/forgot', rateLimit('forgot', 5, 60 * 60_000), wrap(async (req, res) => {
  const email = String(req.body?.email ?? '').trim();
  // Always answer ok (and do the real work afterwards) so response timing
  // can't be used to probe for accounts.
  res.json({ ok: true });
  afterResponse((async () => {
    const { rows } = await query<User>(`SELECT * FROM users WHERE lower(email) = lower($1)`, [email]);
    const user = rows[0];
    if (!user) return;
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    await query(
      `INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES ($1, $2, now() + interval '1 hour')`,
      [tokenHash, user.id]
    );
    await sendEmail(
      user.email,
      'Reset your Chapter1 password',
      `Hi ${user.name},\n\nSomeone (hopefully you) asked to reset your Chapter1 password. This link works for one hour:\n\n${APP_URL}/reset?token=${token}\n\nIf you didn't ask for this, ignore this email.`
    );
  })());
}));

app.post('/api/auth/reset', rateLimit('reset', 10, 60 * 60_000), wrap(async (req, res) => {
  const token = String(req.body?.token ?? '');
  const password = String(req.body?.password ?? '');
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const { rows } = await query<{ user_id: number }>(
    `SELECT * FROM password_resets WHERE token_hash = $1 AND used = 0 AND expires_at > now()`,
    [tokenHash]
  );
  const reset = rows[0];
  if (!reset) {
    return res.status(400).json({ error: 'That reset link is invalid or has expired. Request a new one.' });
  }
  await query(`UPDATE password_resets SET used = 1 WHERE token_hash = $1`, [tokenHash]);
  await query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [hashPassword(password), reset.user_id]);
  // A reset means the old password may be compromised; sign out everywhere.
  await query(`DELETE FROM sessions WHERE user_id = $1`, [reset.user_id]);
  res.json({ ok: true });
}));

app.put('/api/me', wrap(async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const goal = Number(req.body?.yearly_goal);
  if (!Number.isInteger(goal) || goal < 0 || goal > 10000) {
    return res.status(400).json({ error: 'Goal must be a whole number' });
  }
  await query(`UPDATE users SET yearly_goal = $1 WHERE id = $2`, [goal, user.id]);
  res.json({ user: publicUser({ ...user, yearly_goal: goal }) });
}));

app.delete('/api/me', wrap(async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  if (String(req.body?.confirm ?? '') !== user.email) {
    return res.status(400).json({ error: 'Type your email address to confirm deletion' });
  }
  await cancelSubscriptionIfAny(user);
  await query(`DELETE FROM users WHERE id = $1`, [user.id]); // sessions/books/resets cascade
  res.setHeader('Set-Cookie', 'session=; HttpOnly; Path=/; Max-Age=0');
  res.json({ ok: true });
}));

// ---------- billing ----------

app.post('/api/billing/checkout', wrap(async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  if (!BILLING_ENABLED) return res.status(400).json({ error: 'Billing is not enabled' });
  try {
    res.json({ url: await createCheckoutUrl(user) });
  } catch (err) {
    console.error('checkout failed:', err);
    res.status(502).json({ error: 'Could not start checkout. Try again in a minute.' });
  }
}));

app.post('/api/billing/portal', wrap(async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  if (!BILLING_ENABLED) return res.status(400).json({ error: 'Billing is not enabled' });
  try {
    res.json({ url: await createPortalUrl(user) });
  } catch (err) {
    console.error('portal failed:', err);
    res.status(502).json({ error: 'Could not open the billing portal. Try again in a minute.' });
  }
}));

// ---------- books ----------

const BOOK_FIELDS = ['title', 'author', 'isbn', 'cover_url', 'pages', 'status', 'genre', 'rating', 'notes', 'started_at', 'finished_at'] as const;

function cleanBook(body: any) {
  const b: Record<string, unknown> = {};
  b.title = String(body?.title ?? '').trim();
  b.author = String(body?.author ?? '').trim();
  b.isbn = body?.isbn ? String(body.isbn).trim() : null;
  b.cover_url = body?.cover_url ? String(body.cover_url).trim() : null;
  b.pages = Number.isInteger(Number(body?.pages)) && Number(body?.pages) > 0 ? Number(body.pages) : null;
  b.status = ['want', 'reading', 'finished'].includes(body?.status) ? body.status : 'finished';
  b.genre = String(body?.genre ?? '').trim();
  b.rating = [1, 2, 3, 4, 5].includes(Number(body?.rating)) ? Number(body.rating) : null;
  b.notes = String(body?.notes ?? '');
  b.started_at = body?.started_at ? String(body.started_at).slice(0, 10) : null;
  b.finished_at = body?.finished_at ? String(body.finished_at).slice(0, 10) : null;
  return b;
}

// A genre typed directly on a book becomes part of the user's saved genre list.
async function registerGenre(userId: number, genre: unknown) {
  if (typeof genre === 'string' && genre) {
    await query(
      `INSERT INTO genres (user_id, name) VALUES ($1, $2) ON CONFLICT (user_id, lower(name)) DO NOTHING`,
      [userId, genre]
    );
  }
}

app.get('/api/books', wrap(async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const { rows } = await query(
    `SELECT * FROM books WHERE user_id = $1 ORDER BY COALESCE(finished_at, created_at) DESC, id DESC`,
    [user.id]
  );
  res.json({ books: rows });
}));

// Expired-trial accounts stay read-only: they can view, export, and delete,
// but adding or editing books needs an active trial or subscription.
function requireWriteAccess(user: User, res: express.Response): boolean {
  if (hasWriteAccess(user)) return true;
  res.status(402).json({ error: 'Your free trial has ended. Subscribe to keep logging books.' });
  return false;
}

app.post('/api/books', wrap(async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  if (!requireWriteAccess(user, res)) return;
  const b = cleanBook(req.body);
  if (!b.title) return res.status(400).json({ error: 'Title is required' });
  await registerGenre(user.id, b.genre);
  const { rows } = await query(
    `INSERT INTO books (user_id, ${BOOK_FIELDS.join(', ')})
     VALUES ($1, ${BOOK_FIELDS.map((_, i) => `$${i + 2}`).join(', ')})
     RETURNING *`,
    [user.id, ...BOOK_FIELDS.map((f) => b[f])]
  );
  res.json({ book: rows[0] });
}));

app.put('/api/books/:id', wrap(async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  if (!requireWriteAccess(user, res)) return;
  const existing = (
    await query(`SELECT * FROM books WHERE id = $1 AND user_id = $2`, [req.params.id, user.id])
  ).rows[0];
  if (!existing) return res.status(404).json({ error: 'Book not found' });
  const b = cleanBook({ ...existing, ...req.body });
  if (!b.title) return res.status(400).json({ error: 'Title is required' });
  await registerGenre(user.id, b.genre);
  const { rows } = await query(
    `UPDATE books SET ${BOOK_FIELDS.map((f, i) => `${f} = $${i + 1}`).join(', ')}
     WHERE id = $${BOOK_FIELDS.length + 1}
     RETURNING *`,
    [...BOOK_FIELDS.map((f) => b[f]), existing.id]
  );
  res.json({ book: rows[0] });
}));

app.delete('/api/books/:id', wrap(async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const { rowCount } = await query(`DELETE FROM books WHERE id = $1 AND user_id = $2`, [
    req.params.id,
    user.id
  ]);
  if (rowCount === 0) return res.status(404).json({ error: 'Book not found' });
  res.json({ ok: true });
}));

// ---------- genres ----------

// The user's genre list: their saved genres plus anything already tagged on a book.
app.get('/api/genres', wrap(async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const { rows } = await query<{ name: string }>(
    `SELECT name FROM genres WHERE user_id = $1
     UNION
     SELECT DISTINCT genre FROM books WHERE user_id = $2 AND genre != ''
     ORDER BY name`,
    [user.id, user.id]
  );
  res.json({ genres: rows.map((r) => r.name) });
}));

app.post('/api/genres', wrap(async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  if (!requireWriteAccess(user, res)) return;
  const name = String(req.body?.name ?? '').trim();
  if (!name || name.length > 40) {
    return res.status(400).json({ error: 'Genre must be 1–40 characters' });
  }
  await registerGenre(user.id, name);
  res.json({ ok: true });
}));

// Rename a genre in the list and across every book (to = '' deletes the genre).
app.post('/api/genres/rename', wrap(async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  if (!requireWriteAccess(user, res)) return;
  const from = String(req.body?.from ?? '').trim();
  const to = String(req.body?.to ?? '').trim();
  if (!from) return res.status(400).json({ error: 'Genre to rename is required' });
  if (to.length > 40) return res.status(400).json({ error: 'Genre must be 1–40 characters' });
  await query(`DELETE FROM genres WHERE user_id = $1 AND lower(name) = lower($2)`, [user.id, from]);
  if (to) await registerGenre(user.id, to);
  const { rowCount } = await query(`UPDATE books SET genre = $1 WHERE user_id = $2 AND genre = $3`, [
    to,
    user.id,
    from
  ]);
  res.json({ changed: rowCount });
}));

// ---------- export ----------

app.get('/api/export', wrap(async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const { rows: books } = await query(
    `SELECT * FROM books WHERE user_id = $1 ORDER BY COALESCE(finished_at, created_at)`,
    [user.id]
  );
  const cols = ['title', 'author', 'isbn', 'status', 'genre', 'rating', 'pages', 'started_at', 'finished_at', 'notes', 'created_at'];
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [cols.join(','), ...books.map((b: any) => cols.map((c) => esc(b[c])).join(','))].join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="chapter1.csv"');
  res.send(csv);
}));

// ---------- Open Library proxy ----------

const OL_FIELDS = 'title,author_name,first_publish_year,isbn,cover_i,number_of_pages_median';

function olDocToResult(doc: any) {
  return {
    title: doc.title ?? '',
    author: Array.isArray(doc.author_name) ? [...new Set(doc.author_name)].join(', ') : '',
    year: doc.first_publish_year ?? null,
    isbn: Array.isArray(doc.isbn) ? doc.isbn.find((i: string) => i.length === 13) ?? doc.isbn[0] : null,
    pages: doc.number_of_pages_median ?? null,
    cover_url: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : null
  };
}

app.get('/api/search', wrap(async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const q = String(req.query.q ?? '').trim();
  if (!q) return res.json({ results: [] });
  try {
    const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&fields=${OL_FIELDS}&limit=12`;
    const r = await fetch(url, { headers: { 'User-Agent': 'chapter1-app' } });
    if (!r.ok) throw new Error(`Open Library responded ${r.status}`);
    const data: any = await r.json();
    res.json({ results: (data.docs ?? []).map(olDocToResult) });
  } catch (err) {
    console.error('search failed:', err);
    res.status(502).json({ error: 'Book search is unavailable right now' });
  }
}));

app.get('/api/isbn/:isbn', wrap(async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const isbn = req.params.isbn.replace(/[^0-9Xx]/g, '');
  if (!isbn) return res.status(400).json({ error: 'Invalid ISBN' });
  try {
    const url = `https://openlibrary.org/search.json?q=isbn:${isbn}&fields=${OL_FIELDS}&limit=1`;
    const r = await fetch(url, { headers: { 'User-Agent': 'chapter1-app' } });
    if (!r.ok) throw new Error(`Open Library responded ${r.status}`);
    const data: any = await r.json();
    const doc = (data.docs ?? [])[0];
    if (!doc) return res.status(404).json({ error: 'No book found for that barcode' });
    res.json({ result: { ...olDocToResult(doc), isbn } });
  } catch (err) {
    console.error('isbn lookup failed:', err);
    res.status(502).json({ error: 'Book lookup is unavailable right now' });
  }
}));

// ---------- static + listen (self-hosted/dev only; Vercel serves the SPA itself) ----------

if (!process.env.VERCEL) {
  if (isProd) {
    const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
    app.use(express.static(dist));
    app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }
  app.listen(PORT, () => {
    console.log(`Chapter1 API listening on http://localhost:${PORT}`);
  });
}
