import { executeTool } from './tool-execution.js';

const GITHUB_API='https://api.github.com';
const MAX_OUTPUT=12000;

function clean(value){return String(value??'').trim().slice(0,MAX_OUTPUT)}
function githubToken(){return process.env.GITHUB_TOKEN||''}
function githubHeaders(){return {'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',...(githubToken()?{Authorization:`Bearer ${githubToken()}`}:{})}}
function parseRepo(value){const match=String(value||'').trim().match(/^(?:https?:\/\/github\.com\/)?([^/\s]+)\/([^/\s#]+?)(?:\.git)?$/);if(!match)throw new Error('GitHub repository must be owner/name.');return `${match[1]}/${match[2]}`}
async function githubRead(input,context,fetchImpl=fetch){const repo=parseRepo(input?.repo||input?.repository);const path=String(input?.path||'').replace(/^\/+/, '');if(!path)throw new Error('GitHub file path is required.');const ref=String(input?.ref||'').trim();const url=`${GITHUB_API}/repos/${repo}/contents/${path}${ref?`?ref=${encodeURIComponent(ref)}`:''}`;const r=await fetchImpl(url,{headers:githubHeaders()});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data?.message||`GitHub request failed (${r.status}).`);if(Array.isArray(data))return {repository:repo,path,items:data.slice(0,50).map(x=>({name:x.name,type:x.type,size:x.size,sha:x.sha}))};if(data.type!=='file')return {repository:repo,path,type:data.type||'unknown'};let content='';if(data.content)content=Buffer.from(String(data.content).replace(/\n/g,''),'base64').toString('utf8');return {repository:repo,path,ref:ref||null,sha:data.sha,size:data.size,content:clean(content)}}

function awsConfigured(){return Boolean(process.env.AWS_ACCESS_KEY_ID&&process.env.AWS_SECRET_ACCESS_KEY&&process.env.AWS_REGION)}
async function awsRead(input){if(!awsConfigured())throw new Error('AWS read tool is not configured. Set AWS credentials and AWS_REGION on the server.');const service=String(input?.service||'').toLowerCase();const action=String(input?.action||'').toLowerCase();if(!['sts'].includes(service)||action!=='getcalleridentity')throw new Error('AWS read tool currently supports only STS GetCallerIdentity.');const {STSClient,GetCallerIdentityCommand}=await import('@aws-sdk/client-sts');const client=new STSClient({region:process.env.AWS_REGION});const out=await client.send(new GetCallerIdentityCommand({}));return {account:out.Account||null,arn:out.Arn||null,userId:out.UserId||null,service:'sts',action:'getcalleridentity'}}

export const INTEGRATION_TOOL_REGISTRY={github_read:githubRead,aws_read:awsRead};
export const INTEGRATION_TOOL_METADATA={
  github_read:{description:'Read a GitHub repository file or directory.',permission:'file_read',risk:'low'},
  aws_read:{description:'Read limited AWS identity information without changing resources.',permission:'file_read',risk:'low'}
};
export async function executeIntegrationTool(tool,input,context,options={}){return executeTool(tool,input,context,{...options,registry:INTEGRATION_TOOL_REGISTRY})}
export const _test={parseRepo,clean,githubHeaders,awsConfigured,INTEGRATION_TOOL_METADATA};
