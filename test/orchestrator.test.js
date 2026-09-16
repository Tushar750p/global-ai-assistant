import test from 'node:test';
import assert from 'node:assert/strict';
import { routeResponses, _test } from '../orchestrator.js';

test('provider status detects configured providers without exposing keys',()=>{
  const old={openai:process.env.OPENAI_API_KEY,gemini:process.env.GEMINI_API_KEY,router:process.env.OPENROUTER_API_KEY};
  process.env.OPENAI_API_KEY='x';process.env.GEMINI_API_KEY='';process.env.OPENROUTER_API_KEY='y';
  try{assert.deepEqual(_test.providerStatus(),{openai:true,gemini:false,openrouter:true});}finally{for(const [k,v] of Object.entries({OPENAI_API_KEY:old.openai,GEMINI_API_KEY:old.gemini,OPENROUTER_API_KEY:old.router}))v===undefined?delete process.env[k]:process.env[k]=v;}
});

test('OpenRouter response is normalized to Responses-style output_text',async()=>{
  const old=process.env.OPENROUTER_API_KEY;process.env.OPENROUTER_API_KEY='test-key';
  try{
    const fakeFetch=async(_url,options)=>{assert.equal(options.method,'POST');const body=JSON.parse(options.body);assert.equal(body.model,'openrouter/free');return new Response(JSON.stringify({choices:[{message:{content:'hello from router'}}]}),{status:200,headers:{'content-type':'application/json'}});};
    const r=await _test.callOpenRouter({instructions:'test',input:[{role:'user',content:'hello'}]},fakeFetch);
    assert.equal(r.output_text,'hello from router');assert.equal(r.provider,'openrouter');
  }finally{if(old===undefined)delete process.env.OPENROUTER_API_KEY;else process.env.OPENROUTER_API_KEY=old;}
});

test('auto routing can fall back to Gemini when OpenRouter fails',async()=>{
  const old={router:process.env.OPENROUTER_API_KEY,gemini:process.env.GEMINI_API_KEY,mode:process.env.AI_PROVIDER};
  process.env.OPENROUTER_API_KEY='router-key';process.env.GEMINI_API_KEY='gemini-key';delete process.env.AI_PROVIDER;
  try{
    let calls=[];
    const fakeFetch=async(url,options)=>{
      calls.push(url);
      if(url.includes('openrouter'))return new Response('rate limited',{status:429});
      assert.match(url,/generativelanguage\.googleapis\.com\/v1beta\/interactions/);
      const body=JSON.parse(options.body);assert.equal(body.model,'gemini-3.8-flash');
      return new Response(JSON.stringify({output_text:'hello from gemini',steps:[{type:'model_output',content:[{text:'hello from gemini'}]}]}),{status:200,headers:{'content-type':'application/json'}});
    };
    const r=await routeResponses(async()=>{throw new Error('OpenAI should not be used before free providers');},{instructions:'test',input:[{role:'user',content:'hello'}]},fakeFetch);
    assert.equal(r.output_text,'hello from gemini');assert.equal(r.provider,'gemini');assert.equal(calls.length,2);
  }finally{for(const [k,v] of Object.entries({OPENROUTER_API_KEY:old.router,GEMINI_API_KEY:old.gemini,AI_PROVIDER:old.mode}))v===undefined?delete process.env[k]:process.env[k]=v;}
});

test('OpenAI is preferred for file or web-tool requests in auto mode',async()=>{
  const old={openai:process.env.OPENAI_API_KEY,router:process.env.OPENROUTER_API_KEY,gemini:process.env.GEMINI_API_KEY,mode:process.env.AI_PROVIDER};
  process.env.OPENAI_API_KEY='openai-key';process.env.OPENROUTER_API_KEY='router-key';process.env.GEMINI_API_KEY='gemini-key';delete process.env.AI_PROVIDER;
  try{
    let called=false;const r=await routeResponses(async request=>{called=true;assert.ok(request.tools);return {output_text:'openai result',output:[]};},{instructions:'test',tools:[{type:'web_search'}],input:[{role:'user',content:'research'}]},async()=>{throw new Error('free provider should not be called first');});
    assert.equal(called,true);assert.equal(r.output_text,'openai result');
  }finally{for(const [k,v] of Object.entries({OPENAI_API_KEY:old.openai,OPENROUTER_API_KEY:old.router,GEMINI_API_KEY:old.gemini,AI_PROVIDER:old.mode}))v===undefined?delete process.env[k]:process.env[k]=v;}
});

test('AI Council runs independent answers, critics, conflict analysis, and synthesis',async()=>{
  const old={openai:process.env.OPENAI_API_KEY,router:process.env.OPENROUTER_API_KEY,gemini:process.env.GEMINI_API_KEY,council:process.env.AI_COUNCIL};
  process.env.OPENAI_API_KEY='';process.env.OPENROUTER_API_KEY='router-key';process.env.GEMINI_API_KEY='gemini-key';process.env.AI_COUNCIL='true';
  try{
    let calls=0;
    const fakeFetch=async(url,options)=>{
      calls+=1;
      const body=JSON.parse(options.body);
      if(url.includes('openrouter'))return new Response(JSON.stringify({choices:[{message:{content:`router response ${calls}`}}]}),{status:200,headers:{'content-type':'application/json'}});
      assert.match(url,/generativelanguage\.googleapis\.com\/v1beta\/interactions/);
      assert.equal(body.model,'gemini-3.8-flash');
      return new Response(JSON.stringify({output_text:`gemini response ${calls}`,steps:[{type:'model_output',content:[{text:`gemini response ${calls}`}]}]}),{status:200,headers:{'content-type':'application/json'}});
    };
    const r=await routeResponses(async()=>{throw new Error('OpenAI should not be used');},{instructions:'test',input:[{role:'user',content:'Explain distributed systems.'}]},fakeFetch);
    assert.equal(r.provider,'council');
    assert.deepEqual(r.council.members,['gemini','openrouter']);
    assert.equal(r.council.responses,2);
    assert.equal(r.council.critics,2);
    assert.equal(r.council.conflict_checker,'gemini');
    assert.equal(r.council.synthesizer,'gemini');
    assert.equal(calls,6);
  }finally{for(const [k,v] of Object.entries({OPENAI_API_KEY:old.openai,OPENROUTER_API_KEY:old.router,GEMINI_API_KEY:old.gemini,AI_COUNCIL:old.council}))v===undefined?delete process.env[k]:process.env[k]=v;}
});
