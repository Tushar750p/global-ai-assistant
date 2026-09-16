import test from 'node:test';
import assert from 'node:assert/strict';
import { _test } from '../deep-research.js';

test('deep research extracts the latest text report from interaction steps', () => {
  const steps = [
    { type: 'model_output', content: [{ type: 'text', text: 'Planning...' }] },
    { type: 'model_output', content: [{ type: 'text', text: 'Final report with cited findings.' }] }
  ];
  assert.equal(_test.textFromSteps(steps), 'Final report with cited findings.');
});

test('deep research deduplicates citations and caps output', () => {
  const steps = [{ content: [{ type: 'text', text: 'report', annotations: [
    { type: 'url_citation', url: 'https://example.com/a', title: 'A' },
    { type: 'url_citation', url: 'https://example.com/a', title: 'A duplicate' },
    { type: 'url_citation', url: 'https://example.com/b', title: 'B' }
  ] }] }];
  assert.deepEqual(_test.citationsFromSteps(steps), [
    { title: 'A', url: 'https://example.com/a' },
    { title: 'B', url: 'https://example.com/b' }
  ]);
});

test('deep research enforces a bounded question length', () => {
  assert.equal(_test.MAX_QUERY_LENGTH, 12000);
  assert.equal(_test.allowIp('unit-test-ip'), true);
});
