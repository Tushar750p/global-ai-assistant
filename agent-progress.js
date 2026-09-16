const runs=new Map();
const MAX_RUNS=100;
const MAX_EVENTS=80;
const TERMINAL=new Set(['completed','failed','cancelled','blocked']);
function now(){return new Date().toISOString();}
function trim(){while(runs.size>MAX_RUNS){const first=runs.keys().next().value;runs.delete(first);}}
export function startProgress(runId,goal,plan=[]){const state={runId,goal,status:'planning',currentTask:null,completedTasks:0,totalTasks:Array.isArray(plan)?plan.length:0,events:[],updatedAt:now()};runs.set(runId,state);trim();return state;}
export function updateProgress(runId,patch={}){const state=runs.get(runId);if(!state)return null;Object.assign(state,patch,{updatedAt:now()});if(patch.event){state.events.push({at:now(),...patch.event});if(state.events.length>MAX_EVENTS)state.events.splice(0,state.events.length-MAX_EVENTS);}return state;}
export function finishProgress(runId,status='completed',patch={}){return updateProgress(runId,{...patch,status,currentTask:null});}
export function getProgress(runId){return runs.get(runId)||null;}
export function registerAgentProgressRoutes(app){app.get('/api/agent/:runId/progress',async(req,res)=>{const state=getProgress(String(req.params.runId));if(!state)return res.status(404).json({error:'Agent run not found or progress expired.'});res.set('Cache-Control','no-store');res.json({progress:state});});}
export const _test={runs,startProgress,updateProgress,finishProgress,getProgress,MAX_RUNS,MAX_EVENTS,TERMINAL};
