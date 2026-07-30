// Transactional email via Resend. Without RESEND_API_KEY (local dev), emails
// are printed to the server console instead so flows stay testable.
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM ?? 'Chapter1 <onboarding@resend.dev>';

export async function sendEmail(to: string, subject: string, text: string): Promise<void> {
  if (!RESEND_API_KEY) {
    console.log(`\n[email dev-mode] To: ${to}\nSubject: ${subject}\n${text}\n`);
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ from: EMAIL_FROM, to, subject, text })
  });
  if (!res.ok) {
    throw new Error(`Resend responded ${res.status}: ${await res.text()}`);
  }
}
