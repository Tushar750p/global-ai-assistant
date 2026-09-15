import express from 'express';
import { getPool, query } from './db.js';
import { getSessionUser } from './auth.js';
import {
  applySubscription,
  billingConfigured,
  cancelSubscription,
  checkoutConfigured,
  createCheckoutSession,
  getSubscription,
  recordBillingEvent,
  verifyStripeSignature
} from './billing.js';

const routerInstalled = Symbol.for('global-ai-assistant.billing-routes');

function sameOrigin(req, res, next) {
  if (process.env.NODE_ENV !== 'production') return next();
  const origin = req.get('origin');
  if (!origin) return next();
  const host = req.get('host');
  const proto = (req.get('x-forwarded-proto') || req.protocol).split(',')[0].trim();
  if (origin !== `${proto}://${host}`) return res.status(403).json({ error: 'Cross-origin request blocked.' });
  next();
}

async function currentUser(req) {
  if (!getPool()) return null;
  try { return await getSessionUser(req); } catch { return null; }
}

function publicSubscription(subscription) {
  if (!subscription) return null;
  return {
    provider: subscription.provider,
    customerId: subscription.customer_id,
    subscriptionId: subscription.subscription_id,
    productId: subscription.product_id,
    priceId: subscription.price_id,
    status: subscription.status,
    active: subscription.active,
    currentPeriodStart: subscription.current_period_start,
    currentPeriodEnd: subscription.current_period_end,
    cancelAtPeriodEnd: subscription.cancel_at_period_end
  };
}

function subscriptionUserId(subscription) {
  return subscription?.metadata?.user_id || subscription?.metadata?.userId || null;
}

async function findUserIdForSubscription(subscription) {
  const metadataId = subscriptionUserId(subscription);
  if (metadataId && /^\d+$/.test(String(metadataId))) return Number(metadataId);
  if (subscription?.customer) {
    const result = await query(
      `SELECT user_id FROM billing_subscriptions WHERE provider = 'stripe' AND customer_id = $1 ORDER BY updated_at DESC LIMIT 1`,
      [subscription.customer]
    );
    return result.rows[0]?.user_id || null;
  }
  return null;
}

export function registerBillingRoutes(app) {
  if (app[routerInstalled]) return;
  app[routerInstalled] = true;

  app.get('/api/billing/status', async (req, res) => {
    const user = await currentUser(req);
    if (!user) return res.status(401).json({ error: 'Please sign in.' });
    try {
      const subscription = await getSubscription(user.id);
      res.json({ configured: billingConfigured(), checkoutConfigured: checkoutConfigured(), plan: user.plan || 'free', subscription: publicSubscription(subscription) });
    } catch {
      res.status(500).json({ error: 'Could not load billing status.' });
    }
  });

  app.post('/api/billing/checkout', sameOrigin, async (req, res) => {
    const user = await currentUser(req);
    if (!user) return res.status(401).json({ error: 'Please sign in.' });
    if (!checkoutConfigured()) return res.status(503).json({ error: 'Stripe Checkout is not configured yet.' });
    try {
      const existing = await getSubscription(user.id);
      if (existing?.active) return res.status(409).json({ error: 'You already have an active Pro subscription.' });
      const origin = `${(req.get('x-forwarded-proto') || req.protocol).split(',')[0].trim()}://${req.get('host')}`;
      const successUrl = process.env.STRIPE_SUCCESS_URL || `${origin}/?billing=success`;
      const cancelUrl = process.env.STRIPE_CANCEL_URL || `${origin}/?billing=cancelled`;
      const session = await createCheckoutSession({
        userId: user.id,
        email: user.email,
        customerId: existing?.customer_id || null,
        successUrl,
        cancelUrl
      });
      res.json({ url: session.url, sessionId: session.id });
    } catch (error) {
      res.status(502).json({ error: error?.message || 'Could not create Stripe Checkout session.' });
    }
  });

  app.post('/api/billing/cancel', sameOrigin, async (req, res) => {
    const user = await currentUser(req);
    if (!user) return res.status(401).json({ error: 'Please sign in.' });
    try {
      const subscription = await getSubscription(user.id);
      if (!subscription?.subscription_id || !subscription.active) return res.status(409).json({ error: 'No active Pro subscription found.' });
      const cancelled = await cancelSubscription(subscription.subscription_id);
      res.json({ ok: true, subscription: publicSubscription({ ...subscription, status: cancelled.status || 'canceled', cancel_at_period_end: false, active: false }) });
    } catch (error) {
      res.status(502).json({ error: error?.message || 'Could not cancel the subscription.' });
    }
  });

  app.post('/api/billing/webhook', express.raw({ type: 'application/json', limit: '1mb' }), async (req, res) => {
    if (!billingConfigured()) return res.status(503).send('Billing is not configured.');
    const signature = req.get('stripe-signature');
    if (!verifyStripeSignature(req.body, signature)) return res.status(400).send('Invalid Stripe signature.');
    let event;
    try { event = JSON.parse(req.body.toString('utf8')); } catch { return res.status(400).send('Invalid event payload.'); }

    try {
      const firstTime = await recordBillingEvent(event.id, event.type);
      if (!firstTime) return res.json({ received: true, duplicate: true });

      const subscriptionEvents = new Set([
        'customer.subscription.created',
        'customer.subscription.updated',
        'customer.subscription.deleted',
        'customer.subscription.paused',
        'customer.subscription.resumed'
      ]);
      if (subscriptionEvents.has(event.type)) {
        const subscription = event.data?.object;
        const userId = await findUserIdForSubscription(subscription);
        if (userId) await applySubscription(userId, subscription);
      }
      res.json({ received: true });
    } catch (error) {
      res.status(500).json({ error: error?.message || 'Webhook processing failed.' });
    }
  });
}
