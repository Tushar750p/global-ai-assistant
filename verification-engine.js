const DEFAULT_MIN_CONFIDENCE=0.7;

function has(value){return typeof value==='string'&&value.trim().length>0;}
function cleanText(value){return typeof value==='string'?value.trim():'';}

function extractClaims(text){
  const source=cleanText(text);
  if(!source)return [];
  return source.split(/(?<=[.!?])\s+/).map(s=>s.replace(/^[-*]\s*/,'').trim()).filter(s=>s.length>=20).slice(0,20);
}

function verificationPrompt(question,claims,evidence){
  return `You are a verification engine. Verify factual claims conservatively. Do not treat model output as proof. For each claim return JSON with claim, verdict (supported|refuted|uncertain), confidence (0-1), evidence, and reason. If evidence is insufficient, use uncertain rather than guessing.\n\nQUESTION:\n${question}\n\nCLAIMS:\n${claims.map((c,i)=>`${i+1}. ${c}`).join('\n')}\n\nAVAILABLE EVIDENCE:\n${evidence||'No external evidence was supplied.'}`;
}

function parseVerification(text){
  try{const parsed=JSON.parse(text);if(Array.isArray(parsed))return parsed;if(Array.isArray(parsed?.claims))return parsed.claims;return null;}catch{return null;}
}

export function verificationStatus(items){
  const results=Array.isArray(items)?items:[];
  if(!results.length)return {status:'unverified',confidence:0,verified:0,refuted:0,uncertain:0};
  const verified=results.filter(x=>x?.verdict==='supported');
  const refuted=results.filter(x=>x?.verdict==='refuted');
  const uncertain=results.filter(x=>x?.verdict==='uncertain');
  const confidence=results.reduce((sum,x)=>sum+(Number(x?.confidence)||0),0)/results.length;
  return {status:refuted.length?'conflicted':confidence>=DEFAULT_MIN_CONFIDENCE?'verified':'partially_verified',confidence:Number(confidence.toFixed(3)),verified:verified.length,refuted:refuted.length,uncertain:uncertain.length};
}

export async function verifyAnswer({question,answer,evidence='',verify}){
  const claims=extractClaims(answer);
  if(!claims.length)return {claims:[],...verificationStatus([])};
  if(typeof verify!=='function')return {claims:claims.map(claim=>({claim,verdict:'uncertain',confidence:0,evidence:'',reason:'No verification provider configured.'})),...verificationStatus([])};
  const prompt=verificationPrompt(question,claims,evidence);
  const raw=await verify(prompt);
  const parsed=parseVerification(raw);
  if(!parsed)return {claims:claims.map(claim=>({claim,verdict:'uncertain',confidence:0,evidence:'',reason:'Verifier returned an invalid structured response.'})),...verificationStatus([])};
  const normalized=claims.map((claim,i)=>({claim,...(parsed[i]||{verdict:'uncertain',confidence:0,evidence:'',reason:'No result returned for this claim.'})}));
  return {...verificationStatus(normalized),claims:normalized};
}

export const _test={extractClaims,parseVerification,verificationPrompt,verificationStatus};
