import { query } from './db.js';

const ACTIVE_STATUSES = new Set(['active', 'trialing']);

export function billingConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
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
    [userId, subscription.customer, subscription.id, subscription.product, subscription.price,
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
