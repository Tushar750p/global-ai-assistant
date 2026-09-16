import test from 'node:test';
import assert from 'node:assert/strict';
import { _test, runAgent } from '../agent-engine.js';

const { heuristicPlan, parseJson, validatePlan, topologicalTasks } = _test;

test('agent parser handles fenced JSON', () => {
  assert.deepEqual(parseJson('```json\n{"tasks":[]}\n```'), { tasks: [] });
});

test('heuristic planner creates research verification and synthesis flow', () => {
  const plan = heuristicPlan('Research the latest Kubernetes security guidance and verify the claims.');
  assert.deepEqual(plan.tasks.map(t => t.tool), ['research', 'verify', 'synthesize']);
  validatePlan(plan);
});

test('topological executor orders dependencies', () => {
  const ordered = topologicalTasks([
    { id: 'c', tool: 'synthesize', depends_on: ['b'] },
    { id: 'a', tool: 'research', depends_on: [] },
    { id: 'b', tool: 'verify', depends_on: ['a'] }
  ]);
  assert.deepEqual(ordered.map(t => t.id), ['a', 'b', 'c']);
});

test('agent rejects dependency cycles', () => {
  assert.throws(() => topologicalTasks([
    { id: 'a', tool: 'research', depends_on: ['b'] },
    { id: 'b', tool: 'verify', depends_on: ['a'] }
  ]), /dependency cycle/);
});

test('agent executes an injected deterministic plan without network', async () => {
  const plan = { objective: 'test', tasks: [
    { id: 'one', title: 'Research', tool: 'research', input: 'test', depends_on: [], risk: 'low' },
    { id: 'two', title: 'Verify', tool: 'verify', input: 'verify', depends_on: ['one'], risk: 'low' },
    { id: 'three', title: 'Synthesize', tool: 'synthesize', input: 'final', depends_on: ['two'], risk: 'low' }
  ] };
  const fetchImpl = async (_url, _options) => ({ ok: true, json: async () => ({ output_text: 'tool result' }) });
  const result = await runAgent('test', { plan, fetchImpl });
  assert.equal(result.status, 'completed');
  assert.deepEqual(Object.keys(result.results), ['one', 'two', 'three']);
});
