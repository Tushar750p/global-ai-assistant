import test from 'node:test';
import assert from 'node:assert/strict';
import { billingConfigured, isActiveSubscription } from '../billing.js';

test('only active and trialing subscriptions grant Pro access', () => {
  assert.equal(isActiveSubscription('active'), true);
  assert.equal(isActiveSubscription('trialing'), true);
  assert.equal(isActiveSubscription('past_due'), false);
  assert.equal(isActiveSubscription('canceled'), false);
  assert.equal(isActiveSubscription('incomplete'), false);
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
