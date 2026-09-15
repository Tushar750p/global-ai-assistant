import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { billingConfigured, checkoutConfigured, isActiveSubscription, verifyStripeSignature } from '../billing.js';

test('only active and trialing subscriptions grant Pro access', () => {
  assert.equal(isActiveSubscription('active'), true);
  assert.equal(isActiveSubscription('trialing'), true);
  assert.equal(isActiveSubscription('past_due'), false);
  assert.equal(isActiveSubscription('canceled'), false);
  assert.equal(isActiveSubscription('incomplete'), false);
  assert.equal(isActiveSubscription('unpaid'), false);
  assert.equal(isActiveSubscription('paused'), false);
});

test('billing configuration requires both Stripe secrets', () => {
  const previousSecret = process.env.STRIPE_SECRET_KEY;
  const previousWebhook = process.env.STRIPE_WEBHOOK_SECRET;
  process.env.STRIPE_SECRET_KEY = 'test-secret';
  process.env.STRIPE_WEBHOOK_SECRET = 'test-webhook';
  assert.equal(billingConfigured(), true);
  delete process.env.STRIPE_WEBHOOK_SECRET;
  assert.equal(billingConfigured(), false);
  if (previousSecret === undefined) delete process.env.STRIPE_SECRET_KEY; else process.env.STRIPE_SECRET_KEY = previousSecret;
  if (previousWebhook === undefined) delete process.env.STRIPE_WEBHOOK_SECRET; else process.env.STRIPE_WEBHOOK_SECRET = previousWebhook;
});

test('checkout configuration requires Stripe secret and Pro price', () => {
  const previousSecret = process.env.STRIPE_SECRET_KEY;
  const previousPrice = process.env.STRIPE_PRO_PRICE_ID;
  process.env.STRIPE_SECRET_KEY = 'test-secret';
  process.env.STRIPE_PRO_PRICE_ID = 'price_test';
  assert.equal(checkoutConfigured(), true);
  delete process.env.STRIPE_PRO_PRICE_ID;
  assert.equal(checkoutConfigured(), false);
  if (previousSecret === undefined) delete process.env.STRIPE_SECRET_KEY; else process.env.STRIPE_SECRET_KEY = previousSecret;
  if (previousPrice === undefined) delete process.env.STRIPE_PRO_PRICE_ID; else process.env.STRIPE_PRO_PRICE_ID = previousPrice;
});

test('Stripe webhook signatures verify and reject tampering', () => {
  const payload = JSON.stringify({ id: 'evt_test', type: 'customer.subscription.updated' });
  const secret = 'whsec_test';
  const timestamp = Math.floor(Date.now() / 1000);
  const digest = crypto.createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  const signature = `t=${timestamp},v1=${digest}`;
  assert.equal(verifyStripeSignature(Buffer.from(payload), signature, secret), true);
  assert.equal(verifyStripeSignature(Buffer.from(`${payload} `), signature, secret), false);
  assert.equal(verifyStripeSignature(Buffer.from(payload), `t=${timestamp},v1=bad`, secret), false);
});

test('Stripe webhook signatures reject stale timestamps', () => {
  const payload = '{}';
  const secret = 'whsec_test';
  const timestamp = Math.floor(Date.now() / 1000) - 301;
  const digest = crypto.createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  assert.equal(verifyStripeSignature(payload, `t=${timestamp},v1=${digest}`, secret), false);
});
