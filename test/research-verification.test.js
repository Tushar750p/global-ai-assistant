import test from 'node:test';
import assert from 'node:assert/strict';
import { _test } from '../research-verification.js';

test('research verification JSON parser handles fenced JSON', () => {
  assert.deepEqual(_test.parseJson('```json\n{"verdict":"supported"}\n```'), { verdict: 'supported' });
});

test('research verification output extraction reads output and steps', () => {
  assert.equal(_test.outputText({ output_text: 'hello' }), 'hello');
  assert.equal(_test.outputText({ steps: [{ content: [{ type: 'text', text: 'one' }] }, { content: [{ type: 'text', text: 'two' }] }] }), 'one\ntwo');
});

test('research verification limits are bounded', () => {
  assert.equal(_test.MAX_REPORT_LENGTH, 50000);
  assert.equal(_test.MAX_CLAIMS, 24);
});

test('research verification IP limiter allows the first request', () => {
  assert.equal(_test.allowIp(`verification-test-${Date.now()}-${Math.random()}`), true);
});
