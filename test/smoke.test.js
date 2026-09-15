import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { hashPassword, verifyPassword, validateCredentials, sessionCookie, clearSessionCookie, createSessionToken, hashSessionToken } from '../auth.js';

let nextPort = 4317;
function startServer(env = {}) {
  const port = nextPort++;
  const child = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: String(port), OPENAI_API_KEY: '', DATABASE_URL: '', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
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
    const response = await request(server.port); assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual({ ok: body.ok, aiConfigured: body.aiConfigured, databaseConfigured: body.databaseConfigured }, { ok: true, aiConfigured: false, databaseConfigured: false });
    assert.equal(Number.isInteger(body.uptimeSeconds), true);
  });
}

test('API responses include a unique request ID', async t => { const a=startServer(); const b=startServer(); t.after(()=>{a.child.kill();b.child.kill();}); await Promise.all([a.ready,b.ready]); const [ra,rb]=await Promise.all([fetch(`http://127.0.0.1:${a.port}/api/health`),fetch(`http://127.0.0.1:${b.port}/api/health`)]); const ida=ra.headers.get('x-request-id'),idb=rb.headers.get('x-request-id'); assert.match(ida,/^[0-9a-f-]{36}$/); assert.match(idb,/^[0-9a-f-]{36}$/); assert.notEqual(ida,idb); });
test('password hashing verifies the original password only', async () => { const hash = await hashPassword('CorrectHorseBatteryStaple!'); assert.notEqual(hash, 'CorrectHorseBatteryStaple!'); assert.equal(await verifyPassword('CorrectHorseBatteryStaple!', hash), true); assert.equal(await verifyPassword('WrongPassword!', hash), false); });
test('password verification rejects unsupported scrypt parameters', async () => { const hash = await hashPassword('CorrectHorseBatteryStaple!'); const parts = hash.split('$'); parts[1] = '32768'; assert.equal(await verifyPassword('CorrectHorseBatteryStaple!', parts.join('$')), false); });
test('credential validation rejects weak or malformed credentials', () => { assert.match(validateCredentials('bad-email', 'long-enough'), /valid email/); assert.match(validateCredentials('user@example.com', 'short'), /at least 8/); assert.equal(validateCredentials('user@example.com', 'long-enough-password'), null); });
test('session tokens are random and hashed', () => { const a = createSessionToken(), b = createSessionToken(); assert.notEqual(a, b); assert.notEqual(hashSessionToken(a), a); assert.equal(hashSessionToken(a), hashSessionToken(a)); });
test('production cookie attributes are secure', () => { const old = process.env.NODE_ENV; process.env.NODE_ENV = 'production'; try { assert.match(sessionCookie('abc'), /HttpOnly/); assert.match(sessionCookie('abc'), /SameSite=Lax/); assert.match(sessionCookie('abc'), /Secure/); assert.match(clearSessionCookie(), /Secure/); } finally { if (old === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = old; } });
test('auth session endpoint is anonymous without a database', async t => { const s=startServer(); t.after(()=>s.child.kill()); await s.ready; const r=await fetch(`http://127.0.0.1:${s.port}/api/auth/me`); assert.equal(r.status,200); assert.deepEqual(await r.json(),{authenticated:false,databaseConfigured:false}); });
test('history endpoint requires database configuration', async t => { const s=startServer(); t.after(()=>s.child.kill()); await s.ready; const r=await fetch(`http://127.0.0.1:${s.port}/api/history`); assert.equal(r.status,503); assert.match((await r.json()).error,/DATABASE_URL/); });
for (const [method, path, body] of [
  ['GET','/api/conversations',undefined],
  ['POST','/api/conversations',JSON.stringify({title:'Test'})],
  ['GET','/api/conversations/1',undefined],
  ['PATCH','/api/conversations/1',JSON.stringify({title:'Renamed'})],
  ['DELETE','/api/conversations/1',undefined],
]) test(`conversation ${method} ${path} requires database`, async t => { const s=startServer(); t.after(()=>s.child.kill()); await s.ready; const headers=body?{'Content-Type':'application/json'}:undefined; const r=await fetch(`http://127.0.0.1:${s.port}${path}`,{method,headers,body}); assert.equal(r.status,503); });
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
