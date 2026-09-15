import crypto from 'node:crypto';
import { query } from './db.js';

const ACTIVE_STATUSES = new Set(['active', 'trialing']);
const STRIPE_API = 'https://api.stripe.com/v1';
const WEBHOOK_TOLERANCE_SECONDS = 300;

export function billingConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
}

export function checkoutConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRO_PRICE_ID);
}

export function isActiveSubscription(status) {
  return ACTIVE_STATUSES.has(String(status || '').toLowerCase());
}

export async function getSubscription(userId) {
  const result = await query(
    `SELECT provider, customer_id, subscription_id, product_id, price_id, status,
            current_period_start, current_period_end, cancel_at_period_end
       FROM billing_subscriptions
      WHERE user_id = $1
      ORDER BY updated_at DESC
      LIMIT 1`,
    [userId]
  );
  const row = result.rows[0] || null;
  return row ? { ...row, active: isActiveSubscription(row.status) } : null;
}

export async function applySubscription(userId, subscription) {
  if (!subscription?.id) throw new Error('A subscription id is required.');
  const status = String(subscription.status || 'unknown');
  const active = isActiveSubscription(status);
  const item = subscription.items?.data?.[0];
  const price = subscription.price || item?.price?.id || item?.plan?.id || null;
  const product = subscription.product || item?.price?.product || item?.plan?.product || null;
  await query(
    `INSERT INTO billing_subscriptions
      (user_id, provider, customer_id, subscription_id, product_id, price_id, status,
       current_period_start, current_period_end, cancel_at_period_end, updated_at)
     VALUES ($1, 'stripe', $2, $3, $4, $5, $6, $7, $8, $9, NOW())
     ON CONFLICT (provider, subscription_id) DO UPDATE SET
       user_id = EXCLUDED.user_id,
       customer_id = EXCLUDED.customer_id,
       product_id = EXCLUDED.product_id,
       price_id = EXCLUDED.price_id,
       status = EXCLUDED.status,
       current_period_start = EXCLUDED.current_period_start,
       current_period_end = EXCLUDED.current_period_end,
       cancel_at_period_end = EXCLUDED.cancel_at_period_end,
       updated_at = NOW()`,
    [userId, subscription.customer, subscription.id, product, price,
      status, subscription.current_period_start ? new Date(subscription.current_period_start * 1000) : null,
      subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null,
      Boolean(subscription.cancel_at_period_end)]
  );
  await query(
    `UPDATE users SET plan = CASE WHEN $2 THEN 'pro' ELSE 'free' END WHERE id = $1`,
    [userId, active]
  );
}

export async function recordBillingEvent(eventId, eventType) {
  const result = await query(
    `INSERT INTO billing_events(event_id, event_type)
     VALUES ($1, $2)
     ON CONFLICT (event_id) DO NOTHING
     RETURNING event_id`,
    [eventId, eventType]
  );
  return result.rowCount === 1;
}

function formEncode(values) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  return params;
}

async function stripeRequest(path, options = {}) {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('Stripe is not configured.');
  const response = await fetch(`${STRIPE_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      ...(options.body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { error: { message: 'Invalid Stripe response.' } }; }
  if (!response.ok) throw new Error(data?.error?.message || `Stripe request failed with status ${response.status}.`);
  return data;
}

export async function createCheckoutSession({ userId, email, customerId, successUrl, cancelUrl }) {
  if (!checkoutConfigured()) throw new Error('Stripe Checkout is not configured.');
  const body = formEncode({
    mode: 'subscription',
    'line_items[0][price]': process.env.STRIPE_PRO_PRICE_ID,
    'line_items[0][quantity]': 1,
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: userId,
    customer: customerId,
    'customer_email': customerId ? undefined : email,
    'metadata[user_id]': userId,
    'subscription_data[metadata][user_id]': userId
  });
  return stripeRequest('/checkout/sessions', { method: 'POST', body });
}

export async function cancelSubscription(subscriptionId) {
  if (!subscriptionId) throw new Error('A subscription id is required.');
  return stripeRequest(`/subscriptions/${encodeURIComponent(subscriptionId)}`, { method: 'DELETE' });
}

export function verifyStripeSignature(payload, signature, secret = process.env.STRIPE_WEBHOOK_SECRET, toleranceSeconds = WEBHOOK_TOLERANCE_SECONDS) {
  if (!secret || !signature || payload === undefined || payload === null) return false;
  const raw = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload));
  const parts = String(signature).split(',');
  const timestampPart = parts.find(part => part.startsWith('t='));
  const signatures = parts.filter(part => part.startsWith('v1=')).map(part => part.slice(3));
  const timestamp = Number(timestampPart?.slice(2));
  if (!Number.isSafeInteger(timestamp) || !signatures.length) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > toleranceSeconds) return false;
  const signedPayload = Buffer.concat([Buffer.from(`${timestamp}.`), raw]);
  const expected = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  return signatures.some(value => {
    const actual = Buffer.from(value, 'utf8');
    return actual.length === expectedBuffer.length && crypto.timingSafeEqual(actual, expectedBuffer);
  });
}
