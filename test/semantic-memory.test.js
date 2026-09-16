import test from 'node:test';
import assert from 'node:assert/strict';
import { _test, cosineSimilarity } from '../semantic-memory.js';

test('semantic memory normalizes identifiers safely', () => {
  assert.equal(_test.validUserId(1), true);
  assert.equal(_test.validUserId('42'), true);
  assert.equal(_test.validUserId(0), false);
  assert.equal(_test.validUserId('nope'), false);
});

test('cosine similarity detects direction and rejects invalid vectors', () => {
  assert.ok(Math.abs(cosineSimilarity([1, 0], [1, 0]) - 1) < 1e-12);
  assert.ok(Math.abs(cosineSimilarity([1, 0], [0, 1])) < 1e-12);
  assert.equal(cosineSimilarity([1], [1, 2]), 0);
  assert.equal(cosineSimilarity([], []), 0);
});

test('semantic memory text cleaning is bounded', () => {
  assert.equal(_test.clean('  hello  '), 'hello');
  assert.equal(_test.clean(null), '');
  assert.equal(_test.clean('x'.repeat(3000)).length, 2000);
});
