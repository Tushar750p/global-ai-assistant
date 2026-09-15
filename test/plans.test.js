import test from 'node:test';
import assert from 'node:assert/strict';
import { getPlan, listPlans, normalizePlan, planLimits } from '../plans.js';

test('plans expose free and pro tiers', () => {
  assert.deepEqual(listPlans().map(plan => plan.id), ['free', 'pro']);
  assert.equal(getPlan('free').chats, 100);
  assert.equal(getPlan('pro').chats, 1000);
});

test('unknown plans safely fall back to free', () => {
  assert.equal(normalizePlan('enterprise'), 'free');
  assert.equal(normalizePlan('PRO'), 'pro');
  assert.deepEqual(planLimits('unknown'), planLimits('free'));
});

test('pro has higher usage limits than free', () => {
  const free = planLimits('free');
  const pro = planLimits('pro');
  assert.ok(pro.chats > free.chats);
  assert.ok(pro.inputChars > free.inputChars);
  assert.ok(pro.outputChars > free.outputChars);
});
