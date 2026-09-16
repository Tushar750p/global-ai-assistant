import test from 'node:test';
import assert from 'node:assert/strict';
import { _test, verifyAnswer } from '../verification-engine.js';

test('claim extraction creates bounded factual candidates',()=>{
  const claims=_test.extractClaims('This is a short sentence. AWS launched a service in 2020 and it changed the market significantly. Another useful statement follows here.');
  assert.equal(claims.length,2);
  assert.match(claims[0],/AWS launched/);
});

test('verification status detects conflicts',()=>{
  const status=_test.verificationStatus([{verdict:'supported',confidence:.9},{verdict:'refuted',confidence:.8}]);
  assert.equal(status.status,'conflicted');
  assert.equal(status.verified,1);
  assert.equal(status.refuted,1);
});

test('verification falls back to uncertainty on invalid verifier output',async()=>{
  const result=await verifyAnswer({question:'Test?',answer:'This is a sufficiently long factual claim that should be checked carefully.',verify:async()=>'{bad json'});
  assert.equal(result.claims[0].verdict,'uncertain');
});

test('verification normalizes structured verifier output',async()=>{
  const result=await verifyAnswer({question:'Test?',answer:'This is a sufficiently long factual claim that should be checked carefully.',evidence:'Evidence text.',verify:async()=>JSON.stringify([{verdict:'supported',confidence:.9,evidence:'Evidence text.',reason:'Matches the supplied evidence.'}])});
  assert.equal(result.status,'verified');
  assert.equal(result.claims[0].verdict,'supported');
  assert.equal(result.claims[0].confidence,.9);
});
