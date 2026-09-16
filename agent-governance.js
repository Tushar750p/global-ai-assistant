import { getPool, query } from './db.js';
import { getSessionUser } from './auth.js';

const MAX_APPROVAL_GOAL_LENGTH = 12000;
const approvalWindows = new Map();

function has(value) { return typeof value === 'string' && value.trim().length > 0; }
function keyFor(req) { return req.ip || req.socket?.remoteAddress || 'unknown'; }
function riskForGoal(goal) {
  const text = String(goal || '').toLowerCase();
  const high = /delete|destroy|drop database|terminate|shutdown|restart production|deploy production|publish|send email|send message|transfer money|purchase|buy|change password|rotate secret|revoke|grant access|modify aws|modify cloud|terraform apply|kubectl delete|git push|merge pull request/.test(text);
  const medium = /create|update|edit|deploy|install|configure|run command|execute|upload|download|github|aws|cloud|database|server|infrastructure/.test(text);
  return high ? 'high' : medium ? 'medium' : 'low';
}
function requiresApproval(risk) { return risk === 'high'; }
export function permissionsForRisk(risk) {
  if (risk === 'high') return { web_read: true, file_read: true, code_execution: false, external_write: false, destructive_actions: false };
  if (risk === 'medium') return { web_read: true, file_read: true, code_execution: true, external_write: false, destructive_actions: false };
  return { web_read: true, file_read: true, code_execution: true, external_write: false, destructive_actions: false };
}
async function ensureTable() {
  if (!getPool()) return;
  await query(`CREATE TABLE IF NOT EXISTS agent_approvals (
    id TEXT PRIMARY KEY,
    user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
    goal TEXT NOT NULL,
    risk TEXT NOT NULL CHECK (risk IN ('low','medium','high')),
    permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL CHECK (status IN ('pending','approved','rejected','expired')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    decided_at TIMESTAMPTZ
  )`);
}
function allowApprovalRequest(key) {
  const now = Date.now();
  const current = approvalWindows.get(key);
  if (!current || now - current.start >= 3600000) { approvalWindows.set(key, { start: now, count: 1 }); return true; }
  if (current.count >= 10) return false;
  current.count += 1;
  return true;
}
async function createApproval(userId, goal) {
  const clean = String(goal || '').trim();
  if (!clean || clean.length > MAX_APPROVAL_GOAL_LENGTH) throw new Error('Invalid agent goal.');
  const risk = riskForGoal(clean);
  const id = `approval_${Date.now()}_${Math.random().toString(36).slice(2,9)}`;
  const permissions = permissionsForRisk(risk);
  if (getPool()) {
    await ensureTable();
    await query('INSERT INTO agent_approvals (id,user_id,goal,risk,permissions,status) VALUES($1,$2,$3,$4,$5,$6)', [id,userId||null,clean,risk,JSON.stringify(permissions),'pending']);
  }
  return { id, goal: clean, risk, permissions, status: 'pending' };
}
async function getApproval(id, userId) {
  if (!getPool()) return null;
  await ensureTable();
  const r = await query('SELECT * FROM agent_approvals WHERE id=$1', [id]);
  const row = r.rows[0];
  if (!row || (row.user_id && (!userId || Number(row.user_id) !== Number(userId)))) return null;
  return row;
}
export function registerAgentGovernanceRoutes(app, startAgent) {
  app.post('/api/agent/preflight', async (req,res) => {
    const goal = String(req.body?.goal || '').trim();
    if (!goal) return res.status(400).json({ error: 'Agent goal is required.' });
    const risk = riskForGoal(goal);
    res.json({ risk, requiresApproval: requiresApproval(risk), permissions: permissionsForRisk(risk) });
  });
  app.post('/api/agent/approval', async (req,res) => {
    if (!allowApprovalRequest(keyFor(req))) return res.status(429).json({ error: 'Approval request rate limit reached.' });
    const user = getPool() ? await getSessionUser(req).catch(() => null) : null;
    try {
      const approval = await createApproval(user?.id || null, req.body?.goal);
      res.status(201).json(approval);
    } catch (e) { res.status(400).json({ error: e?.message || 'Approval request failed.' }); }
  });
  app.post('/api/agent/approval/:id/decision', async (req,res) => {
    const user = getPool() ? await getSessionUser(req).catch(() => null) : null;
    const approval = await getApproval(req.params.id, user?.id || null);
    if (!approval) return res.status(404).json({ error: 'Approval request not found.' });
    if (approval.status !== 'pending') return res.status(409).json({ error: 'Approval request is no longer pending.' });
    const decision = req.body?.decision === 'approved' ? 'approved' : req.body?.decision === 'rejected' ? 'rejected' : null;
    if (!decision) return res.status(400).json({ error: 'Decision must be approved or rejected.' });
    if (getPool()) await query('UPDATE agent_approvals SET status=$1,decided_at=NOW() WHERE id=$2', [decision, approval.id]);
    if (decision === 'rejected') return res.json({ id: approval.id, status: 'rejected' });
    try {
      const started = await startAgent(approval.goal, user?.id || null, { permissions: approval.permissions, approvalId: approval.id });
      res.json({ id: approval.id, status: 'approved', agent: started });
    } catch (e) { res.status(400).json({ error: e?.message || 'Approved agent failed to start.' }); }
  });
}
export const _test = { riskForGoal, requiresApproval, permissionsForRisk, allowApprovalRequest, MAX_APPROVAL_GOAL_LENGTH };
