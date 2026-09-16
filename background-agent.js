import { getPool, query } from './db.js';
import { getSessionUser } from './auth.js';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const DEFAULT_AGENT = process.env.GEMINI_MANAGED_AGENT || 'antigravity-preview-05-2026';
const MAX_GOAL_LENGTH = 12000;
const MAX_BACKGROUND_PER_IP_PER_HOUR = 3;
const ipWindows = new Map();
let tableReady = false;

function keyFor(req) { return req.ip || req.socket?.remoteAddress || 'unknown'; }
function apiKey() { return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || ''; }
function allowIp(key) {
  const now = Date.now(); const entry = ipWindows.get(key);
  if (!entry || now - entry.start >= 3600000) { ipWindows.set(key, { start: now, count: 1 }); return true; }
  if (entry.count >= MAX_BACKGROUND_PER_IP_PER_HOUR) return false;
  entry.count += 1; return true;
}
async function ensureTable() {
  if (tableReady || !getPool()) return;
  await query(`CREATE TABLE IF NOT EXISTS background_agent_runs (
    id TEXT PRIMARY KEY,
    user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    provider_job_id TEXT NOT NULL,
    goal TEXT NOT NULL,
    status TEXT NOT NULL,
    result JSONB NOT NULL DEFAULT '{}'::jsonb,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
  )`);
  tableReady = true;
}
async function save(row) {
  if (!getPool()) return;
  await ensureTable();
  await query(`INSERT INTO background_agent_runs (id,user_id,provider_job_id,goal,status,result,error,created_at,updated_at,completed_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,NOW(),NOW(),$8)
    ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status,result=EXCLUDED.result,error=EXCLUDED.error,updated_at=NOW(),completed_at=EXCLUDED.completed_at`,
    [row.id,row.userId||null,row.providerJobId,row.goal,row.status,JSON.stringify(row.result||{}),row.error||null,row.completedAt||null]);
}
async function fetchInteraction(id) {
  const key = apiKey();
  if (!key) throw new Error('Gemini background agent requires GEMINI_API_KEY or GOOGLE_API_KEY.');
  const response = await fetch(`${API_BASE}/${encodeURIComponent(id)}`, { headers: { 'x-goog-api-key': key, 'Api-Revision': '2026-05-20' } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || `Agent status failed (${response.status}).`);
  return data;
}
function outputText(data) {
  if (typeof data?.output_text === 'string') return data.output_text;
  return (data?.steps || []).flatMap(s => s?.content || []).map(x => x?.text || '').filter(Boolean).join('\n').trim();
}
async function startBackgroundAgent(goal, userId = null) {
  const key = apiKey();
  if (!key) throw new Error('Gemini background agent is not configured.');
  const clean = String(goal || '').trim();
  if (!clean) throw new Error('Agent goal is required.');
  if (clean.length > MAX_GOAL_LENGTH) throw new Error('Agent goal is too long.');
  const body = {
    agent: DEFAULT_AGENT,
    input: `You are an autonomous execution agent. Complete the user's goal using only capabilities available to this managed agent. Work carefully, verify important results, and never claim an action succeeded unless you actually completed it.\n\nUSER GOAL:\n${clean}`,
    background: true,
    store: true,
    environment: 'remote'
  };
  const response = await fetch(API_BASE, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key, 'Api-Revision': '2026-05-20' }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || `Background agent failed to start (${response.status}).`);
  const id = `bagent_${Date.now()}_${Math.random().toString(36).slice(2,9)}`;
  await save({ id, userId, providerJobId: data.id, goal: clean, status: data.status || 'in_progress', result: { provider: DEFAULT_AGENT, providerJobId: data.id } });
  return { id, providerJobId: data.id, status: data.status || 'in_progress', goal: clean };
}
async function getOwnedRun(id, userId) {
  if (!getPool()) return null;
  await ensureTable();
  const result = await query('SELECT * FROM background_agent_runs WHERE id=$1', [id]);
  const row = result.rows[0];
  if (!row || (row.user_id && (!userId || Number(row.user_id) !== Number(userId)))) return null;
  return row;
}
export function registerBackgroundAgentRoutes(app) {
  app.post('/api/agent/background', async (req,res) => {
    if (!allowIp(keyFor(req))) return res.status(429).json({ error: 'Background agent rate limit reached. Try again later.' });
    const user = getPool() ? await getSessionUser(req).catch(() => null) : null;
    try { res.status(202).json(await startBackgroundAgent(req.body?.goal, user?.id || null)); }
    catch (error) { console.error('Background agent start failed:', error?.message || error); res.status(400).json({ error: error?.message || 'Background agent failed to start.' }); }
  });
  app.get('/api/agent/background/:id', async (req,res) => {
    const user = getPool() ? await getSessionUser(req).catch(() => null) : null;
    try {
      const row = await getOwnedRun(req.params.id, user?.id || null);
      if (!row) return res.status(404).json({ error: 'Background agent run not found.' });
      const data = await fetchInteraction(row.provider_job_id);
      const terminal = ['completed','failed','cancelled','incomplete','budget_exceeded'].includes(data.status);
      const result = { id: row.id, providerJobId: row.provider_job_id, goal: row.goal, status: data.status, output: outputText(data), steps: data.steps || [], error: data.error || null };
      if (terminal) await save({ id: row.id, userId: row.user_id, providerJobId: row.provider_job_id, goal: row.goal, status: data.status, result, error: data.error?.message || null, completedAt: new Date().toISOString() });
      else await save({ id: row.id, userId: row.user_id, providerJobId: row.provider_job_id, goal: row.goal, status: data.status, result });
      res.json(result);
    } catch (error) { res.status(400).json({ error: error?.message || 'Background agent status failed.' }); }
  });
  app.post('/api/agent/background/:id/cancel', async (req,res) => {
    const user = getPool() ? await getSessionUser(req).catch(() => null) : null;
    try {
      const row = await getOwnedRun(req.params.id, user?.id || null);
      if (!row) return res.status(404).json({ error: 'Background agent run not found.' });
      const key = apiKey();
      const response = await fetch(`${API_BASE}/${encodeURIComponent(row.provider_job_id)}/cancel`, { method: 'POST', headers: { 'x-goog-api-key': key, 'Api-Revision': '2026-05-20' } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error?.message || `Agent cancellation failed (${response.status}).`);
      const result = { id: row.id, providerJobId: row.provider_job_id, status: data.status || 'cancelled' };
      await save({ id: row.id, userId: row.user_id, providerJobId: row.provider_job_id, goal: row.goal, status: result.status, result, completedAt: new Date().toISOString() });
      res.json(result);
    } catch (error) { res.status(400).json({ error: error?.message || 'Background agent cancellation failed.' }); }
  });
}
export const _test = { allowIp, outputText, MAX_GOAL_LENGTH, MAX_BACKGROUND_PER_IP_PER_HOUR, DEFAULT_AGENT };
