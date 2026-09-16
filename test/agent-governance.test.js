import test from 'node:test';
import assert from 'node:assert/strict';
import { _test } from '../agent-governance.js';

test('agent governance classifies risky goals', () => {
  assert.equal(_test.riskForGoal('Explain Kubernetes networking'), 'low');
  assert.equal(_test.riskForGoal('Deploy an application to AWS'), 'medium');
  assert.equal(_test.riskForGoal('Delete the production database'), 'high');
  assert.equal(_test.requiresApproval('high'), true);
  assert.equal(_test.requiresApproval('medium'), false);
});

test('agent governance produces restrictive permissions', () => {
  const permissions = _test.permissionsForRisk('high');
  assert.equal(permissions.destructive_actions, false);
  assert.equal(permissions.external_write, false);
  assert.equal(permissions.web_read, true);
});

test('approval rate limiter allows ten requests and blocks the next', () => {
  const key = `approval-${Date.now()}-${Math.random()}`;
  for (let i = 0; i < 10; i += 1) assert.equal(_test.allowApprovalRequest(key), true);
  assert.equal(_test.allowApprovalRequest(key), false);
});
