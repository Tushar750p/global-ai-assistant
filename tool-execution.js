import { getPool, query } from './db.js';
import { getSessionUser } from './auth.js';

const TOOL_POLICY = Object.freeze({
  research: { permission: 'web_read', label: 'Web research' },
  verify: { permission: 'web_read', label: 'Web verification' },
  synthesize: { permission: null, label: 'Answer synthesis' },
  github_read: { permission: 'file_read', label: 'GitHub read access' },
  aws_read: { permission: 'file_read', label: 'AWS read access' }
});

const TERMINAL = new Set(['completed', 'failed', 'blocked']);
let tableReady = false;

function normalizePermissions(value = {}) {
  return {
    web_read: value.web_read === true,
    file_read: value.file_read === true,
    code_execution: value.code_execution === true,
    external_write: value.external_write === true,
    destructive_actions: value.destructive_actions === true
  };
}
function policyFor(tool) { return TOOL_POLICY[tool] || null; }
function isAllowed(tool, permissions = {}) {
  const policy = policyFor(tool);
  if (!policy) return { allowed: false, reason: `Unsupported tool: ${tool}` };
  if (!policy.permission) return { allowed: true, reason: null };
  const normalized = normalizePermissions(permissions);
  return normalized[policy.permission] === true
    ? { allowed: true, reason: null }
    : { allowed: false, reason: `Permission '${policy.permission}' is required for ${policy.label}.` };
}
async function ensureAuditTable() {
  if (tableReady || !getPool()) return;
  await query(`CREATE TABLE IF NOT EXISTS agent_tool_audit (
    id TEXT PRIMARY KEY, run_id TEXT, user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    task_id TEXT, tool TEXT NOT NULL, status TEXT NOT NULL, input_summary TEXT,
    output_summary TEXT, error TEXT, permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), completed_at TIMESTAMPTZ
  )`); tableReady = true;
}
async function audit(row) {
  if (!getPool()) return;
  try { await ensureAuditTable(); await query(`INSERT INTO agent_tool_audit
    (id,run_id,user_id,task_id,tool,status,input_summary,output_summary,error,permissions,created_at,completed_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),$11)`, [row.id,row.runId||null,row.userId||null,row.taskId||null,row.tool,row.status,
      String(row.inputSummary||'').slice(0,2000),String(row.outputSummary||'').slice(0,4000),row.error||null,JSON.stringify(normalizePermissions(row.permissions)),row.completedAt||null]); }
  catch(error){ console.error('Agent tool audit failed:',error?.message||error); }
}
function summary(result) { if(!result)return ''; if(typeof result==='string')return result.slice(0,4000); return JSON.stringify(result).slice(0,4000); }
export async function executeTool(tool,input,context,options={}) {
  const permissions=normalizePermissions(options.permissions||{}); const check=isAllowed(tool,permissions);
  const auditId=`tool_${Date.now()}_${Math.random().toString(36).slice(2,9)}`;
  const base={id:auditId,runId:options.runId,userId:options.userId,taskId:options.taskId,tool,permissions,inputSummary:input};
  if(!check.allowed){const error=new Error(check.reason);await audit({...base,status:'blocked',error:error.message,completedAt:new Date().toISOString()});throw error;}
  const fn=options.registry?.[tool]; if(typeof fn!=='function'){const error=new Error(`Tool '${tool}' is not registered.`);await audit({...base,status:'blocked',error:error.message,completedAt:new Date().toISOString()});throw error;}
  try{const result=await fn(input,context,options.fetchImpl||fetch);await audit({...base,status:'completed',outputSummary:summary(result),completedAt:new Date().toISOString()});return result;}
  catch(error){await audit({...base,status:'failed',error:error?.message||'Tool execution failed.',completedAt:new Date().toISOString()});throw error;}
}
export function registerToolAuditRoutes(app){app.get('/api/agent/audit',async(req,res)=>{const user=getPool()?await getSessionUser(req).catch(()=>null):null;if(!user?.id||!getPool())return res.status(401).json({error:'Login required to view agent audit history.'});try{await ensureAuditTable();const result=await query(`SELECT id,run_id,task_id,tool,status,input_summary,output_summary,error,permissions,created_at,completed_at FROM agent_tool_audit WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100`,[user.id]);res.set('Cache-Control','no-store');res.json({events:result.rows});}catch{res.status(500).json({error:'Could not load agent audit history.'})}})}
export const _test={TOOL_POLICY,normalizePermissions,policyFor,isAllowed,summary,TERMINAL};
