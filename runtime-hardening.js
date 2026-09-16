import express from 'express';
import { Responses } from 'openai/resources/responses/responses';
import { registerBillingRoutes } from './billing-routes.js';
import { registerResearchRoutes } from './deep-research.js';
import { registerVerificationRoutes } from './research-verification.js';
import { registerAgentRoutes } from './agent-engine.js';
import { registerBackgroundAgentRoutes, startBackgroundAgent } from './background-agent.js';
import { registerAgentGovernanceRoutes } from './agent-governance.js';
import { registerTaskCenterRoutes } from './task-center.js';
import { registerToolAuditRoutes } from './tool-execution.js';
import { registerExternalToolRoutes } from './external-tools.js';
import { registerAgentMemoryRoutes } from './agent-memory.js';
import { closeDb } from './db.js';
import { getSessionUser } from './auth.js';
import { patchOpenAIResponses, providerStatus } from './orchestrator.js';
import { requestContext } from './request-context.js';
const providers=providerStatus();
if(!providers.openai&&(providers.gemini||providers.openrouter))process.env.OPENAI_API_KEY='router-placeholder';
patchOpenAIResponses(Responses);
const originalPost=express.application.post;
express.application.post=function patchedPost(path,...handlers){if(path==='/api/chat'){const memoryContextMiddleware=async(req,res,next)=>{try{const user=await getSessionUser(req);return requestContext.run({userId:user?.id||null},next);}catch{return requestContext.run({userId:null},next);}};return originalPost.call(this,path,memoryContextMiddleware,...handlers);}return originalPost.call(this,path,...handlers);};
let shuttingDown=false;
const originalUse=express.application.use;
const billingMounted=Symbol.for('global-ai-assistant.billing-bootstrap'),researchMounted=Symbol.for('global-ai-assistant.research-bootstrap'),verificationMounted=Symbol.for('global-ai-assistant.verification-bootstrap'),agentMounted=Symbol.for('global-ai-assistant.agent-bootstrap'),backgroundAgentMounted=Symbol.for('global-ai-assistant.background-agent-bootstrap'),governanceMounted=Symbol.for('global-ai-assistant.agent-governance-bootstrap'),taskCenterMounted=Symbol.for('global-ai-assistant.task-center-bootstrap'),auditMounted=Symbol.for('global-ai-assistant.tool-audit-bootstrap'),externalToolsMounted=Symbol.for('global-ai-assistant.external-tools-bootstrap'),agentMemoryMounted=Symbol.for('global-ai-assistant.agent-memory-bootstrap');
express.application.use=function patchedUse(...args){if(!this[billingMounted]){registerBillingRoutes(this);this[billingMounted]=true;}const result=originalUse.apply(this,args);if(!this[researchMounted]){registerResearchRoutes(this);this[researchMounted]=true;}if(!this[verificationMounted]){registerVerificationRoutes(this);this[verificationMounted]=true;}if(!this[agentMounted]){registerAgentRoutes(this);this[agentMounted]=true;}if(!this[backgroundAgentMounted]){registerBackgroundAgentRoutes(this);this[backgroundAgentMounted]=true;}if(!this[governanceMounted]){registerAgentGovernanceRoutes(this,startBackgroundAgent);this[governanceMounted]=true;}if(!this[taskCenterMounted]){registerTaskCenterRoutes(this);this[taskCenterMounted]=true;}if(!this[auditMounted]){registerToolAuditRoutes(this);this[auditMounted]=true;}if(!this[externalToolsMounted]){registerExternalToolRoutes(this);this[externalToolsMounted]=true;}if(!this[agentMemoryMounted]){registerAgentMemoryRoutes(this);this[agentMemoryMounted]=true;}return result;};
function findHttpServers(){return process._getActiveHandles().filter(handle=>handle&&handle.constructor?.name==='Server'&&typeof handle.close==='function');}
function closeServer(server){return new Promise(resolve=>{if(server.listening)server.close(()=>resolve());else resolve();});}
async function shutdown(signal){if(shuttingDown)return;shuttingDown=true;console.log(`Received ${signal}; shutting down gracefully.`);const forceExit=setTimeout(()=>{console.error('Graceful shutdown timed out; forcing process exit.');process.exit(1);},10000);forceExit.unref();try{await Promise.all(findHttpServers().map(closeServer));await closeDb();clearTimeout(forceExit);process.exit(0);}catch(error){clearTimeout(forceExit);console.error('Graceful shutdown failed:',error?.message||error);process.exit(1);}}
process.once('SIGTERM',()=>{void shutdown('SIGTERM');});process.once('SIGINT',()=>{void shutdown('SIGINT');});
