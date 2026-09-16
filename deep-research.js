import { getPool, query } from './db.js';
import { getSessionUser } from './auth.js';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const DEFAULT_AGENT = process.env.GEMINI_DEEP_RESEARCH_AGENT || 'deep-research-preview-04-2026';
const MAX_QUERY_LENGTH = 12000;
const MAX_JOBS_PER_IP_PER_HOUR = 3;
const POLL_MS = 5000;
const MAX_RUNTIME_MS = 55 * 60 * 1000;
const ipWindows = new Map();
const activeJobs = new Map();
let tableReady = false;

function keyFor(req) { return req.ip || req.socket?.remoteAddress || 'unknown'; }
function allowIp(key) {
  const now = Date.now();
  const e = ipWindows.get(key);
  if (!e || now - e.start >= 60 * 60 * 1000) { ipWindows.set(key, { start: now, count: 1 }); return true; }
  if (e.count >= MAX_JOBS_PER_IP_PER_HOUR) return false;
  e.count += 1;
  return true;
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function apiKey() { return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || ''; }
function textFromSteps(steps = []) {
  const texts = [];
  for (const step of steps) for (const item of step?.content || []) {
    if (item?.type === 'text' && typeof item.text === 'string' && item.text.trim()) texts.push(item.text.trim());
  }
  return texts.at(-1) || texts.join('\n\n') || '';
}
function citationsFromSteps(steps = []) {
  const out = [];
  for (const step of steps) for (const item of step?.content || []) {
    for (const a of item?.annotations || []) {
      const url = a?.url || a?.uri;
      if (url && !out.some(x => x.url === url)) out.push({ title: a.title || url, url });
    }
  }
  return out.slice(0, 50);
}
async function ensureTable() {
  if (tableReady || !getPool()) return;
  await query(`CREATE TABLE IF NOT EXISTS research_jobs (
    id TEXT PRIMARY KEY,
    user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    query TEXT NOT NULL,
    provider TEXT NOT NULL,
    provider_job_id TEXT,
    status TEXT NOT NULL CHECK (status IN ('queued','running','completed','failed')),
    report TEXT,
    citations JSONB NOT NULL DEFAULT '[]'::jsonb,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
  )`);
  tableReady = true;
}
async function saveJob(job) {
  if (!getPool()) return;
  try {
    await ensureTable();
    await query(`INSERT INTO research_jobs
      (id,user_id,query,provider,provider_job_id,status,report,citations,error,created_at,updated_at,completed_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10,$11)`, [job.id, job.userId || null, job.query, job.provider, job.providerJobId || null, job.status, job.report || null, JSON.stringify(job.citations || []), job.error || null, new Date(job.createdAt), job.completedAt ? new Date(job.completedAt) : null]);
  } catch (e) { console.error('Research job persistence failed:', e?.message || e); }
}
async function updateJob(job) {
  if (!getPool()) return;
  try {
    await ensureTable();
    await query(`UPDATE research_jobs SET provider_job_id=$2,status=$3,report=$4,citations=$5,error=$6,updated_at=NOW(),completed_at=$7 WHERE id=$1`, [job.id, job.providerJobId || null, job.status, job.report || null, JSON.stringify(job.citations || []), job.error || null, job.completedAt ? new Date(job.completedAt) : null]);
  } catch (e) { console.error('Research job update failed:', e?.message || e); }
}
async function startGeminiResearch(queryText, visualization = false) {
  const key = apiKey();
  if (!key) throw new Error('Deep Research requires GEMINI_API_KEY or GOOGLE_API_KEY.');
  const body = {
    input: queryText,
    agent: DEFAULT_AGENT,
    background: true,
    agent_config: { type: 'deep-research', thinking_summaries: 'auto', ...(visualization ? { visualization: 'auto' } : {}) }
  };
  const response = await fetch(API_BASE, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || data?.message || `Gemini Deep Research start failed (${response.status}).`);
  if (!data.id) throw new Error('Gemini Deep Research did not return a job id.');
  return data;
}
async function pollGeminiResearch(providerJobId) {
  const key = apiKey();
  const started = Date.now();
  while (Date.now() - started < MAX_RUNTIME_MS) {
    const response = await fetch(`${API_BASE}/${encodeURIComponent(providerJobId)}`, { headers: { 'x-goog-api-key': key } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error?.message || data?.message || `Gemini Deep Research poll failed (${response.status}).`);
    if (data.status === 'completed') return data;
    if (data.status === 'failed') throw new Error(data?.error?.message || data?.error || 'Gemini Deep Research failed.');
    await sleep(POLL_MS);
  }
  throw new Error('Deep Research exceeded the maximum server runtime.');
}
async function runJob(job, visualization) {
  activeJobs.set(job.id, job);
  try {
    job.status = 'running'; await updateJob(job);
    const started = await startGeminiResearch(job.query, visualization);
    job.providerJobId = started.id; await updateJob(job);
    const result = await pollGeminiResearch(started.id);
    job.status = 'completed';
    job.report = textFromSteps(result.steps);
    job.citations = citationsFromSteps(result.steps);
    job.completedAt = Date.now();
    if (!job.report) throw new Error('Deep Research completed without a text report.');
    await updateJob(job);
  } catch (e) {
    job.status = 'failed'; job.error = e?.message || 'Deep Research failed.'; job.completedAt = Date.now(); await updateJob(job);
  } finally { activeJobs.delete(job.id); }
}
function serialize(job) { return { id: job.id, status: job.status, provider: job.provider, query: job.query, report: job.report || null, citations: job.citations || [], error: job.error || null, createdAt: job.createdAt, updatedAt: job.updatedAt || job.completedAt || job.createdAt, completedAt: job.completedAt || null }; }

export function registerResearchRoutes(app) {
  app.post('/api/research', async (req, res) => {
    const queryText = typeof req.body?.query === 'string' ? req.body.query.trim() : '';
    if (!queryText) return res.status(400).json({ error: 'Please provide a research question.' });
    if (queryText.length > MAX_QUERY_LENGTH) return res.status(413).json({ error: `Research question is too long. Maximum is ${MAX_QUERY_LENGTH} characters.` });
    if (!allowIp(keyFor(req))) return res.status(429).json({ error: 'Research rate limit reached. Please try again later.' });
    const user = getPool() ? await getSessionUser(req).catch(() => null) : null;
    const id = `research_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const job = { id, userId: user?.id || null, query: queryText, provider: 'gemini-deep-research', status: 'queued', report: null, citations: [], error: null, createdAt: Date.now() };
    await saveJob(job);
    void runJob(job, req.body?.visualization === true);
    res.status(202).json({ id, status: 'queued', provider: job.provider });
  });

  app.get('/api/research/:id', async (req, res) => {
    const id = String(req.params.id || '');
    if (!/^research_[A-Za-z0-9_]+$/.test(id)) return res.status(400).json({ error: 'Invalid research job.' });
    let job = activeJobs.get(id);
    if (!job && getPool()) {
      try {
        await ensureTable();
        const r = await query('SELECT id,user_id,query,provider,provider_job_id,status,report,citations,error,created_at,updated_at,completed_at FROM research_jobs WHERE id=$1', [id]);
        if (r.rows[0]) {
          const row = r.rows[0];
          const user = await getSessionUser(req).catch(() => null);
          if (row.user_id && (!user || Number(user.id) !== Number(row.user_id))) return res.status(404).json({ error: 'Research job not found.' });
          job = { id: row.id, userId: row.user_id, query: row.query, provider: row.provider, providerJobId: row.provider_job_id, status: row.status, report: row.report, citations: row.citations || [], error: row.error, createdAt: new Date(row.created_at).getTime(), updatedAt: new Date(row.updated_at).getTime(), completedAt: row.completed_at ? new Date(row.completed_at).getTime() : null };
        }
      } catch (e) { console.error('Research job lookup failed:', e?.message || e); }
    }
    if (!job) return res.status(404).json({ error: 'Research job not found.' });
    const user = getPool() ? await getSessionUser(req).catch(() => null) : null;
    if (job.userId && (!user || Number(user.id) !== Number(job.userId))) return res.status(404).json({ error: 'Research job not found.' });
    res.json(serialize(job));
  });
}

export const _test = { textFromSteps, citationsFromSteps, allowIp, MAX_QUERY_LENGTH };
