import test from 'node:test';
import assert from 'node:assert/strict';
import { _test } from '../background-agent.js';

test('background agent output extraction handles output_text and steps', () => {
  assert.equal(_test.outputText({ output_text: 'done' }), 'done');
  assert.equal(_test.outputText({ steps: [{ content: [{ type: 'text', text: 'a' }] }, { content: [{ type: 'text', text: 'b' }] }] }), 'a\nb');
});

test('background agent goal length is bounded', () => {
  assert.equal(_test.MAX_GOAL_LENGTH, 12000);
  assert.equal(typeof _test.DEFAULT_AGENT, 'string');
});

test('background agent IP limiter allows three requests then blocks', () => {
  const key = `test-${Date.now()}-${Math.random()}`;
  assert.equal(_test.allowIp(key), true);
  assert.equal(_test.allowIp(key), true);
  assert.equal(_test.allowIp(key), true);
  assert.equal(_test.allowIp(key), false);
});
