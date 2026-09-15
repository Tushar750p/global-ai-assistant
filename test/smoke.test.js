import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

let nextPort = 4317;
function startServer() {
  const port = nextPort++;
  const child = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: String(port), OPENAI_API_KEY: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server did not start in time.')), 10000);
    child.stdout.on('data', data => { if (data.toString().includes('Global AI Assistant running')) { clearTimeout(timer); resolve(); } });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('exit', code => { if (code !== 0) { clearTimeout(timer); reject(new Error(`Server exited with code ${code}.`)); } });
  });
  return { child, port, ready };
}

for (const [name, request] of [
  ['health endpoint responds correctly', async port => fetch(`http://127.0.0.1:${port}/api/health`)],
]) {
  test(name, async t => {
    const server = startServer(); t.after(() => server.child.kill()); await server.ready;
    const response = await request(server.port); assert.equal(response.status, 200); assert.deepEqual(await response.json(), { ok: true, aiConfigured: false });
  });
}

test('chat rejects an empty message', async t => { const s=startServer(); t.after(()=>s.child.kill()); await s.ready; const r=await fetch(`http://127.0.0.1:${s.port}/api/chat`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:'   '})}); assert.equal(r.status,400); assert.deepEqual(await r.json(),{error:'Please provide a message.'}); });
test('chat rejects messages over the size limit', async t => { const s=startServer(); t.after(()=>s.child.kill()); await s.ready; const r=await fetch(`http://127.0.0.1:${s.port}/api/chat`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:'x'.repeat(8001)})}); assert.equal(r.status,413); assert.match((await r.json()).error,/Maximum is 8000 characters/); });
test('chat rejects invalid file reference', async t => { const s=startServer(); t.after(()=>s.child.kill()); await s.ready; const r=await fetch(`http://127.0.0.1:${s.port}/api/chat`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:'Summarize',fileId:'../secret'})}); assert.equal(r.status,400); assert.deepEqual(await r.json(),{error:'Invalid file reference.'}); });
test('chat rejects invalid web search setting', async t => { const s=startServer(); t.after(()=>s.child.kill()); await s.ready; const r=await fetch(`http://127.0.0.1:${s.port}/api/chat`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:'Hello',webSearch:'true'})}); assert.equal(r.status,400); assert.deepEqual(await r.json(),{error:'Invalid web search setting.'}); });
test('image upload is safe without AI configuration', async t => { const s=startServer(); t.after(()=>s.child.kill()); await s.ready; const f=new FormData(); f.append('image',new Blob(['fake'],{type:'image/png'}),'test.png'); const r=await fetch(`http://127.0.0.1:${s.port}/api/images`,{method:'POST',body:f}); assert.equal(r.status,503); });
test('document upload is safe without AI configuration', async t => { const s=startServer(); t.after(()=>s.child.kill()); await s.ready; const f=new FormData(); f.append('file',new Blob(['hello'],{type:'text/plain'}),'notes.txt'); const r=await fetch(`http://127.0.0.1:${s.port}/api/files`,{method:'POST',body:f}); assert.equal(r.status,503); });
test('transcription is safe without AI configuration', async t => { const s=startServer(); t.after(()=>s.child.kill()); await s.ready; const f=new FormData(); f.append('audio',new Blob(['fake-audio'],{type:'audio/webm'}),'voice.webm'); const r=await fetch(`http://127.0.0.1:${s.port}/api/transcribe`,{method:'POST',body:f}); assert.equal(r.status,503); assert.deepEqual(await r.json(),{error:'AI is not configured yet.'}); });
test('speech generation is safe without AI configuration', async t => { const s=startServer(); t.after(()=>s.child.kill()); await s.ready; const r=await fetch(`http://127.0.0.1:${s.port}/api/speech`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:'Hello'})}); assert.equal(r.status,503); assert.deepEqual(await r.json(),{error:'AI is not configured yet.'}); });
test('static homepage is served', async t => { const s=startServer(); t.after(()=>s.child.kill()); await s.ready; const r=await fetch(`http://127.0.0.1:${s.port}/`); assert.equal(r.status,200); assert.match(await r.text(),/Global AI Assistant/); });
test('chat rate limit returns 429', async t => { const s=startServer(); t.after(()=>s.child.kill()); await s.ready; let last; for(let i=0;i<31;i++) last=await fetch(`http://127.0.0.1:${s.port}/api/chat`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:'Hello'})}); assert.equal(last.status,429); });
