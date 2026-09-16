import { getPool, query } from './db.js';
import { getSessionUser } from './auth.js';

const TERMINAL = new Set(['completed', 'failed', 'cancelled', 'incomplete', 'budget_exceeded']);

async function currentUser(req) {
  return getPool() ? getSessionUser(req).catch(() => null) : null;
}

export function registerTaskCenterRoutes(app) {
  app.get('/api/tasks', async (req, res) => {
    const user = await currentUser(req);
    if (!user?.id || !getPool()) return res.status(401).json({ error: 'Login required to view task history.' });
    try {
      const result = await query(`
        SELECT * FROM (
          SELECT id, 'research' AS type, query AS goal, status, provider, report, citations,
                 error, created_at, updated_at, completed_at
          FROM research_jobs WHERE user_id = $1
          UNION ALL
          SELECT id, 'agent' AS type, goal, status, result::text AS provider, result::text AS report,
                 '[]'::jsonb AS citations, error, created_at, updated_at, completed_at
          FROM background_agent_runs WHERE user_id = $1
        ) tasks
        ORDER BY created_at DESC
        LIMIT 50`, [user.id]);
      res.set('Cache-Control', 'no-store');
      res.json({ tasks: result.rows.map(row => ({
        id: row.id, type: row.type, goal: row.goal, status: row.status, provider: row.provider,
        report: row.type === 'research' ? row.report : null,
        result: row.type === 'agent' ? safeJson(row.report) : null,
        citations: row.citations || [], error: row.error,
        createdAt: row.created_at, updatedAt: row.updated_at, completedAt: row.completed_at
      })) });
    } catch (error) { res.status(500).json({ error: 'Could not load task history.' }); }
  });

  app.get('/api/tasks/:type/:id', async (req, res) => {
    const user = await currentUser(req);
    if (!user?.id || !getPool()) return res.status(404).json({ error: 'Task not found.' });
    const type = String(req.params.type || ''), id = String(req.params.id || '');
    try {
      let row;
      if (type === 'research') {
        const result = await query(`SELECT id, query, provider, provider_job_id, status, report, citations, error, created_at, updated_at, completed_at FROM research_jobs WHERE id=$1 AND user_id=$2`, [id, user.id]);
        row = result.rows[0] ? { ...result.rows[0], type: 'research', goal: result.rows[0].query } : null;
        if (row) {
          try {
            const vr = await query(`SELECT result,created_at FROM research_verifications WHERE research_job_id=$1 ORDER BY created_at DESC LIMIT 1`, [id]);
            row.verification = vr.rows[0]?.result || null;
            row.verificationCreatedAt = vr.rows[0]?.created_at || null;
          } catch {}
        }
      } else if (type === 'agent') {
        const result = await query(`SELECT id, goal, provider_job_id, status, result, error, permissions, approval_id, created_at, updated_at, completed_at FROM background_agent_runs WHERE id=$1 AND user_id=$2`, [id, user.id]);
        row = result.rows[0] ? { ...result.rows[0], type: 'agent' } : null;
      }
      if (!row) return res.status(404).json({ error: 'Task not found.' });
      res.set('Cache-Control', 'no-store');
      res.json({ task: normalize(row) });
    } catch (error) { res.status(500).json({ error: 'Could not load task details.' }); }
  });
}

function safeJson(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return {}; }
}

function normalize(row) {
  const verification = row.verification ? safeJson(row.verification) : null;
  return {
    id: row.id, type: row.type, goal: row.goal || row.query, status: row.status,
    provider: row.provider || null, providerJobId: row.provider_job_id || null,
    report: row.type === 'research' ? row.report : null,
    result: row.type === 'agent' ? safeJson(row.result) : null,
    citations: row.citations || [], permissions: row.permissions || null,
    approvalId: row.approval_id || null, error: row.error || null,
    createdAt: row.created_at, updatedAt: row.updated_at, completedAt: row.completed_at,
    terminal: TERMINAL.has(row.status),
    verification: verification ? {
      claimsChecked: Number(verification.claimsChecked || 0),
      counts: verification.counts || {},
      claims: Array.isArray(verification.claims) ? verification.claims : [],
      independentCritic: verification.independentCritic || null,
      generatedAt: verification.generatedAt || null
    } : null
  };
}

export const _test = { safeJson, TERMINAL };
