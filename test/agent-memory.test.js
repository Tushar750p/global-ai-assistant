import test from 'node:test';
import assert from 'node:assert/strict';
import { _test, buildAgentMemoryContext, learnFromRun } from '../agent-memory.js';
test('agent memory limits are bounded',()=>{assert.equal(_test.MAX_GOAL,12000);assert.equal(_test.MAX_CONTEXT,24000);assert.equal(_test.MAX_LESSONS,12);});
test('agent memory retrieval is safe without a user context',async()=>{assert.equal(await buildAgentMemoryContext(null,'deploy the application'),'');});
test('agent learning is safe without a user context',async()=>{assert.equal(await learnFromRun({userId:null,runId:'test-run',goal:'test',results:{},status:'completed'}),null);});
