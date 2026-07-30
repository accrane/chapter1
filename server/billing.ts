import Stripe from 'stripe';
import { query } from './db.js';

// With no STRIPE_SECRET_KEY (local dev), billing is disabled and every
// account behaves as fully paid.
export const BILLING_ENABLED = !!process.env.STRIPE_SECRET_KEY;
const stripe = BILLING_ENABLED ? new Stripe(process.env.STRIPE_SECRET_KEY!) : null;

const TRIAL_DAYS = Number(process.env.TRIAL_DAYS) || 14;
export const APP_URL = process.env.APP_URL ?? 'http://localhost:5173';

export interface BillingUser {
  id: number;
  email: string;
  name: string;
  created_at: string;
  stripe_customer_id: string | null;
  sub_status: string;
  sub_period_end: string | null;
}

export interface Entitlement {
  enabled: boolean;
  plan: 'free' | 'trial' | 'active' | 'expired';
  trial_days_left: number | null;
}

// sub_status values with access: Stripe's active/trialing, plus past_due as a
// grace period while they fix their card.
const PAID_STATUSES = new Set(['active', 'trialing', 'past_due']);

export function entitlement(u: BillingUser): Entitlement {
  if (!BILLING_ENABLED) return { enabled: false, plan: 'free', trial_days_left: null };
  if (PAID_STATUSES.has(u.sub_status)) return { enabled: true, plan: 'active', trial_days_left: null };
  const createdMs = new Date(u.created_at.replace(' ', 'T') + 'Z').getTime();
  const trialEndMs = createdMs + TRIAL_DAYS * 24 * 60 * 60 * 1000;
  const msLeft = trialEndMs - Date.now();
  if (msLeft > 0) {
    return { enabled: true, plan: 'trial', trial_days_left: Math.ceil(msLeft / (24 * 60 * 60 * 1000)) };
  }
  return { enabled: true, plan: 'expired', trial_days_left: 0 };
}

export function hasWriteAccess(u: BillingUser): boolean {
  const e = entitlement(u);
  return e.plan !== 'expired';
}

async function ensureCustomer(u: BillingUser): Promise<string> {
  if (u.stripe_customer_id) return u.stripe_customer_id;
  const customer = await stripe!.customers.create({
    email: u.email,
    name: u.name,
    metadata: { chapter1_user_id: String(u.id) }
  });
  await query(`UPDATE users SET stripe_customer_id = $1 WHERE id = $2`, [customer.id, u.id]);
  return customer.id;
}

export async function createCheckoutUrl(u: BillingUser): Promise<string> {
  const priceId = process.env.STRIPE_PRICE_ID;
  if (!stripe || !priceId) throw new Error('Billing is not configured (STRIPE_PRICE_ID missing)');
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: await ensureCustomer(u),
    line_items: [{ price: priceId, quantity: 1 }],
    allow_promotion_codes: true,
    success_url: `${APP_URL}/?billing=success`,
    cancel_url: `${APP_URL}/?billing=canceled`
  });
  if (!session.url) throw new Error('Stripe did not return a checkout URL');
  return session.url;
}

export async function createPortalUrl(u: BillingUser): Promise<string> {
  if (!stripe) throw new Error('Billing is not configured');
  const session = await stripe.billingPortal.sessions.create({
    customer: await ensureCustomer(u),
    return_url: APP_URL
  });
  return session.url;
}

export async function cancelSubscriptionIfAny(u: BillingUser): Promise<void> {
  if (!stripe || !u.stripe_customer_id) return;
  try {
    const subs = await stripe.subscriptions.list({ customer: u.stripe_customer_id, limit: 10 });
    for (const sub of subs.data) {
      if (sub.status !== 'canceled') await stripe.subscriptions.cancel(sub.id);
    }
  } catch (err) {
    // Account deletion should not be blocked by a Stripe hiccup; log and move on.
    console.error('failed to cancel subscription during account deletion:', err);
  }
}

export async function handleWebhook(rawBody: Buffer, signature: string): Promise<void> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) throw new Error('Webhook not configured');
  const event = stripe.webhooks.constructEvent(rawBody, signature, secret);

  if (
    event.type === 'customer.subscription.created' ||
    event.type === 'customer.subscription.updated' ||
    event.type === 'customer.subscription.deleted'
  ) {
    const sub = event.data.object as Stripe.Subscription;
    const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
    const status = event.type === 'customer.subscription.deleted' ? 'canceled' : sub.status;
    // current_period_end lives on the subscription in older API versions and
    // on the items in newer ones; take whichever is present.
    const periodEnd: number | undefined =
      (sub as any).current_period_end ?? (sub.items?.data?.[0] as any)?.current_period_end;
    await query(`UPDATE users SET sub_status = $1, sub_period_end = $2 WHERE stripe_customer_id = $3`, [
      status,
      periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      customerId
    ]);
  }
}
