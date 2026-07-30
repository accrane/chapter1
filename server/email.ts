// Transactional email via Mailgun. Without MAILGUN_API_KEY (local dev), emails
// are printed to the server console instead so flows stay testable.
const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY;
const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN;
// US region by default; set MAILGUN_API_BASE=https://api.eu.mailgun.net for EU domains.
const MAILGUN_API_BASE = process.env.MAILGUN_API_BASE ?? 'https://api.mailgun.net';
const EMAIL_FROM = process.env.EMAIL_FROM ?? `Chapter1 <no-reply@${MAILGUN_DOMAIN ?? 'localhost'}>`;

export async function sendEmail(to: string, subject: string, text: string): Promise<void> {
  if (!MAILGUN_API_KEY || !MAILGUN_DOMAIN) {
    console.log(`\n[email dev-mode] To: ${to}\nSubject: ${subject}\n${text}\n`);
    return;
  }
  const body = new URLSearchParams({ from: EMAIL_FROM, to, subject, text });
  const res = await fetch(`${MAILGUN_API_BASE}/v3/${MAILGUN_DOMAIN}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`api:${MAILGUN_API_KEY}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });
  if (!res.ok) {
    throw new Error(`Mailgun responded ${res.status}: ${await res.text()}`);
  }
}
