# Chapter1

A mobile-first PWA for keeping track of the books you read. Multi-user with email/password accounts.

## Features

- **Library** — books with status (want to read / reading / finished), star ratings, notes, start/finish dates.
- **Add books** by scanning the ISBN barcode with your phone camera, searching Open Library by title/author, or manual entry.
- **Stats** — books finished this year, pages read, books-per-year history, and a yearly reading goal with progress.
- **PWA** — installable to the home screen; app shell and book covers cached offline.

## Stack

- Frontend: Vite + React + TypeScript, `vite-plugin-pwa`, ZXing for barcode scanning.
- Backend: Express + better-sqlite3 (database file lives in `data/`, created automatically).
- Auth: scrypt-hashed passwords, cookie sessions stored in SQLite. No external services.
- Book metadata: Open Library (proxied through the server).

## Development

```sh
npm install
node scripts/make-icons.mjs   # one-time: generate PWA icons
npm run dev                   # API on :3001, app on :5173
```

Note: the barcode scanner needs a camera and a secure context. `localhost` works; to test from a phone on your LAN you'll need HTTPS (e.g. `vite --host` plus a tool like `mkcert`, or a tunnel).

## Selling it: billing, email, backups

Everything below is driven by env vars (see `.env.example`) and is **off in local dev** — no keys means no billing, emails print to the server console, no backups.

- **Billing**: Stripe subscription with a no-card free trial (`TRIAL_DAYS`, default 14). When the trial ends, accounts go read-only (view + export + delete still work) until they subscribe. Set `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID` (create a recurring price in the Stripe dashboard), and `STRIPE_WEBHOOK_SECRET` (webhook endpoint: `POST /api/stripe/webhook`, subscribe to `customer.subscription.*` events).
- **Password reset**: `RESEND_API_KEY` + `EMAIL_FROM` (verify your sending domain in Resend). Reset links point at `APP_URL`.
- **Rate limiting**: login/register/reset endpoints are rate-limited per IP in-process.
- **Export / deletion**: users can download their library as CSV and permanently delete their account (cancels any subscription) from Settings.
- **Legal**: `public/privacy.html` and `public/terms.html` — review before launch; they name Bellaworks Web Design as the operator.

## Production / deploy (Fly.io)

```sh
npm run build   # builds the frontend to dist/
npm start       # serves API + built app on :3001
```

For Fly.io: see the comments at the top of `fly.toml` — create the app and a volume,
set secrets, `fly deploy`. The Docker image runs the server under Litestream, which
restores the SQLite database from S3-compatible storage on boot and streams every
change back out (set `LITESTREAM_REPLICA_URL` + keys). Keep exactly one machine
running (`fly.toml` already pins this): SQLite wants a single writer.

Post-deploy checklist: point `APP_URL` at your real domain, add the domain to Fly
(`fly certs add`), create the Stripe webhook pointing at
`https://yourdomain.com/api/stripe/webhook`, and send yourself a password-reset
email to confirm Resend is wired up.
