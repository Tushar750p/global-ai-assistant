import { getPool, query } from './db.js';

const MAX_GOAL=12000;
const MAX_CONTEXT=24000;
const MAX_LESSONS=12;

function clean(v,max=MAX_CONTEXT){return String(v??'').trim().slice(0,max);}

export async function ensureAgentMemorySchema(){
  if(!getPool())return false;
  await query(`CREATE TABLE IF NOT EXISTS agent_run_memories (id BIGSERIAL PRIMARY KEY,user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,run_id TEXT NOT NULL,goal TEXT NOT NULL,summary TEXT NOT NULL,success BOOLEAN NOT NULL DEFAULT FALSE,lessons JSONB NOT NULL DEFAULT '[]'::jsonb,tools JSONB NOT NULL DEFAULT '[]'::jsonb,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()); CREATE INDEX IF NOT EXISTS agent_run_memories_user_created_idx ON agent_run_memories(user_id,created_at DESC); CREATE INDEX IF NOT EXISTS agent_run_memories_user_success_idx ON agent_run_memories(user_id,success,created_at DESC);`);
  return true;
}

export async function saveAgentRunMemory({userId=null,runId,goal,summary='',success=false,lessons=[],tools=[]}={}){
  if(!getPool()||!runId||!goal)return null;
  await ensureAgentMemorySchema();
  const normalizedLessons=Array.isArray(lessons)?lessons.slice(0,MAX_LESSONS).map(x=>clean(x,1000)).filter(Boolean):[];
  const normalizedTools=Array.isArray(tools)?tools.slice(0,32).map(x=>clean(x,120)).filter(Boolean):[];
  const r=await query(`INSERT INTO agent_run_memories(user_id,run_id,goal,summary,success,lessons,tools) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb) RETURNING id,created_at`,[userId,runId,clean(goal,MAX_GOAL),clean(summary,MAX_CONTEXT),Boolean(success),JSON.stringify(normalizedLessons),JSON.stringify(normalizedTools)]);
  return r.rows[0]||null;
}

export async function listAgentRunMemories(userId,limit=8){
  if(!getPool()||!userId)return [];
  await ensureAgentMemorySchema();
  const safeLimit=Math.max(1,Math.min(20,Number(limit)||8));
  const r=await query(`SELECT id,run_id,goal,summary,success,lessons,tools,created_at FROM agent_run_memories WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2`,[userId,safeLimit]);
  return r.rows;
}

export async function buildAgentMemoryContext(userId,goal,limit=6){
  const rows=await listAgentRunMemories(userId,limit);
  if(!rows.length)return '';
  const q=clean(goal,MAX_GOAL);
  const terms=new Set(q.toLowerCase().split(/[^a-z0-9]+/).filter(x=>x.length>2).slice(0,40));
  const scored=rows.map(row=>{const hay=`${row.goal} ${row.summary} ${(row.lessons||[]).join(' ')}`.toLowerCase();let score=row.success?1:0.2;for(const term of terms)if(hay.includes(term))score+=1;return{row,score};}).sort((a,b)=>b.score-a.score).slice(0,limit);
  return scored.map(({row})=>`Past run (${row.success?'successful':'unsuccessful'}): ${clean(row.goal,3000)}\nOutcome: ${clean(row.summary,4000)}\nLessons: ${Array.isArray(row.lessons)?row.lessons.join('; '):''}`).join('\n\n');
}

export async function learnFromRun({userId=null,runId,goal,results,status}={}){
  if(!getPool()||!userId||!runId)return null;
  const success=status==='completed';
  const toolNames=Object.keys(results||{});
  const resultText=clean(JSON.stringify(results||{}),18000);
  const summary=success?`Completed the agent run using ${toolNames.length} tool result(s). Evidence was collected and processed.`:`Agent run ended with status ${status||'failed'}. Preserve the failure as a lesson for future planning.`;
  const lessons=[];
  if(toolNames.length)lessons.push(`Tools used: ${toolNames.join(', ')}`);
  if(!success)lessons.push('A previous strategy did not complete; future runs should inspect available evidence and consider an alternate strategy.');
  if(success)lessons.push('A previous run completed successfully; reuse relevant evidence patterns when the future goal is similar.');
  if(resultText.length>500)lessons.push(`Run evidence was available (${resultText.length} characters); do not assume it remains current without re-checking.`);
  return saveAgentRunMemory({userId,runId,goal,summary,success,lessons,tools:toolNames});
}

export const _test={clean,MAX_GOAL,MAX_CONTEXT,MAX_LESSONS};
