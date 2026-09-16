import test from 'node:test';
import assert from 'node:assert/strict';
import { _test } from '../tool-registry.js';

test('tool registry exposes safe read tools', () => {
  assert.equal(_test.toolAllowed('web_search', { web_read: true }), true);
  assert.equal(_test.toolAllowed('file_read', { file_read: true }), true);
  assert.equal(_test.toolAllowed('code_execution', { code_execution: true }), true);
});

test('external writes are denied without explicit permission', () => {
  assert.equal(_test.toolAllowed('external_write', { web_read: true, file_read: true }), false);
  assert.equal(_test.toolAllowed('external_write', { external_write: true }), true);
});

test('destructive actions require explicit destructive permission', () => {
  assert.equal(_test.toolAllowed('destructive_action', { external_write: true }), false);
  assert.equal(_test.toolAllowed('destructive_action', { destructive_actions: true }), true);
  assert.equal(_test.authorizeTool('destructive_action', {}).allowed, false);
});

test('unknown tools are denied', () => {
  assert.equal(_test.authorizeTool('made_up_tool', { web_read: true }).allowed, false);
});
