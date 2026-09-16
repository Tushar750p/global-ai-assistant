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
      assert.match(url,/generativelanguage\.googleapis\.com/);
      return new Response(JSON.stringify({candidates:[{content:{parts:[{text:'hello from gemini'}]}}]}),{status:200,headers:{'content-type':'application/json'}});
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
