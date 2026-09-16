import { getSessionUser } from './auth.js';

const runs=new Map();
const MAX_RUNS=100;
const MAX_EVENTS=80;
const TERMINAL=new Set(['completed','failed','cancelled','blocked']);
function now(){return new Date().toISOString();}
function trim(){while(runs.size>MAX_RUNS){const first=runs.keys().next().value;runs.delete(first);}}
export function startProgress(runId,goal,plan=[],userId=null){const state={runId,goal,userId:userId||null,status:'planning',currentTask:null,completedTasks:0,totalTasks:Array.isArray(plan)?plan.length:0,events:[],updatedAt:now(),clients:new Set()};runs.set(runId,state);trim();return state;}
export function updateProgress(runId,patch={}){const state=runs.get(runId);if(!state)return null;Object.assign(state,patch,{updatedAt:now()});if(patch.event){state.events.push({at:now(),...patch.event});if(state.events.length>MAX_EVENTS)state.events.splice(0,state.events.length-MAX_EVENTS);}broadcast(runId,{type:'progress',progress:snapshot(state)});return state;}
export function finishProgress(runId,status='completed',patch={}){return updateProgress(runId,{...patch,status,currentTask:null});}
export function getProgress(runId){return runs.get(runId)||null;}
function snapshot(state){const {clients,userId,...safe}=state;return safe;}
function broadcast(runId,payload){const state=runs.get(runId);if(!state||!state.clients.size)return;const data=`data: ${JSON.stringify(payload)}\n\n`;for(const res of [...state.clients]){try{res.write(data);}catch{state.clients.delete(res);}}}
async function authorized(req,state){if(!state.userId)return true;const user=await getSessionUser(req).catch(()=>null);return Boolean(user?.id&&String(user.id)===String(state.userId));}
export function registerAgentProgressRoutes(app){
  app.get('/api/agent/:runId/progress',async(req,res)=>{const state=getProgress(String(req.params.runId));if(!state)return res.status(404).json({error:'Agent run not found or progress expired.'});if(!(await authorized(req,state)))return res.status(403).json({error:'Not authorized to view this agent run.'});res.set('Cache-Control','no-store');res.json({progress:snapshot(state)});});
  app.get('/api/agent/:runId/progress/stream',async(req,res)=>{const state=getProgress(String(req.params.runId));if(!state)return res.status(404).json({error:'Agent run not found or progress expired.'});if(!(await authorized(req,state)))return res.status(403).json({error:'Not authorized to view this agent run.'});res.status(200);res.set({'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-store','Connection':'keep-alive','X-Accel-Buffering':'no'});res.flushHeaders?.();state.clients.add(res);res.write(`event: ready\ndata: ${JSON.stringify({progress:snapshot(state)})}\n\n`);const heartbeat=setInterval(()=>{try{res.write(': heartbeat\n\n');}catch{}},15000);const cleanup=()=>{clearInterval(heartbeat);state.clients.delete(res);};req.on('close',cleanup);if(TERMINAL.has(state.status)){cleanup();res.end();}});
}
export const _test={runs,startProgress,updateProgress,finishProgress,getProgress,snapshot,broadcast,MAX_RUNS,MAX_EVENTS,TERMINAL,authorized};
