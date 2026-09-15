import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

let nextPort = 4317;

function startServer() {
  const port = nextPort++;
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: String(port), OPENAI_API_KEY: '' },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server did not start in time.')), 10000);
    child.stdout.on('data', data => {
      if (data.toString().includes('Global AI Assistant running')) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.on('error', error => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('exit', code => {
      if (code !== 0) {
        clearTimeout(timer);
        reject(new Error(`Server exited with code ${code}.`));
      }
    });
  });

  return { child, port, ready };
}

async function startAndFetch(path, options = {}) {
  const server = startServer();
  await server.ready;
  const response = await fetch(`http://127.0.0.1:${server.port}${path}`, options);
  return { ...server, response };
}

test('health endpoint responds correctly', async t => {
  const server = startServer();
  t.after(() => server.child.kill());
  await server.ready;

  const response = await fetch(`http://127.0.0.1:${server.port}/api/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, aiConfigured: false });
});

test('chat rejects an empty message', async t => {
  const server = startServer();
  t.after(() => server.child.kill());
  await server.ready;

  const response = await fetch(`http://127.0.0.1:${server.port}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: '   ' })
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'Please provide a message.' });
});

test('chat rejects messages over the size limit', async t => {
  const server = startServer();
  t.after(() => server.child.kill());
  await server.ready;

  const response = await fetch(`http://127.0.0.1:${server.port}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'x'.repeat(8001) })
  });

  assert.equal(response.status, 413);
  assert.match((await response.json()).error, /Maximum is 8000 characters/);
});

test('chat returns a safe response when AI is not configured', async t => {
  const server = startServer();
  t.after(() => server.child.kill());
  await server.ready;

  const response = await fetch(`http://127.0.0.1:${server.port}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'Hello' })
  });

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'AI is not configured yet.' });
});

test('static homepage is served', async t => {
  const server = startServer();
  t.after(() => server.child.kill());
  await server.ready;

  const response = await fetch(`http://127.0.0.1:${server.port}/`);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Global AI Assistant/);
});

test('chat rate limit returns 429 after excessive requests', async t => {
  const server = startServer();
  t.after(() => server.child.kill());
  await server.ready;

  let lastResponse;
  for (let i = 0; i < 31; i += 1) {
    lastResponse = await fetch(`http://127.0.0.1:${server.port}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Hello' })
    });
  }

  assert.equal(lastResponse.status, 429);
  assert.deepEqual(await lastResponse.json(), {
    error: 'Too many requests. Please wait a minute and try again.'
  });
});
