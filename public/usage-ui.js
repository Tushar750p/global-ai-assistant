(()=>{
  const authButton=document.querySelector('#auth-button');
  if(!authButton)return;
  const button=document.createElement('button');
  button.type='button';button.className='auth-button';button.textContent='Usage';button.title='View monthly AI usage';
  authButton.insertAdjacentElement('afterend',button);
  const modal=document.createElement('div');modal.hidden=true;modal.className='auth-modal';
  modal.innerHTML='<div class="auth-card usage-card" role="dialog" aria-modal="true" aria-labelledby="usage-title"><button class="auth-close usage-close" type="button" aria-label="Close">×</button><div class="eyebrow">GLOBAL AI ACCOUNT</div><h2 id="usage-title">Monthly usage</h2><p id="usage-period">Loading…</p><div id="usage-content"></div></div>';
  document.body.append(modal);
  const content=modal.querySelector('#usage-content'),period=modal.querySelector('#usage-period');
  const fmt=n=>new Intl.NumberFormat().format(Number(n)||0);
  const bar=(label,used,limit)=>{const pct=limit?Math.min(100,(used/limit)*100):0;return `<div class="usage-row"><div class="usage-label"><span>${label}</span><b>${fmt(used)} / ${fmt(limit)}</b></div><div class="usage-track"><div class="usage-fill" style="width:${pct}%"></div></div></div>`};
  async function load(){content.innerHTML='<p>Loading usage…</p>';try{const r=await fetch('/api/usage',{cache:'no-store'}),d=await r.json();if(r.status===401){content.innerHTML='<p>Please sign in to view cloud usage.</p>';return}if(!r.ok)throw Error(d.error||'Could not load usage.');period.textContent=`${d.plan?.name||'Free'} plan · Period started ${d.periodStart} · Resets on the first day of the next month.`;content.innerHTML=`<div class="usage-plan"><strong>${d.plan?.name||'Free'} plan</strong><span>${d.plan?.description||''}</span></div>`+bar('Chats',d.used.chats,d.limits.chats)+bar('Input characters',d.used.inputChars,d.limits.inputChars)+bar('Output characters',d.used.outputChars,d.limits.outputChars)+`<div class="usage-remaining">Remaining: <b>${fmt(d.remaining.chats)}</b> chats · <b>${fmt(d.remaining.inputChars)}</b> input chars · <b>${fmt(d.remaining.outputChars)}</b> output chars</div>`}catch(e){content.innerHTML=`<p>${e.message}</p>`}}
  function open(){modal.hidden=false;load()}function close(){modal.hidden=true}
  button.onclick=open;modal.querySelector('.usage-close').onclick=close;modal.addEventListener('click',e=>{if(e.target===modal)close()});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!modal.hidden)close()});
  const style=document.createElement('style');style.textContent='.usage-card{max-width:520px}.usage-plan{display:flex;flex-direction:column;gap:4px;margin:16px 0;padding:12px;border-radius:10px;background:rgba(127,127,127,.10)}.usage-plan strong{font-size:16px}.usage-plan span{font-size:13px;opacity:.75}.usage-row{margin:18px 0}.usage-label{display:flex;justify-content:space-between;gap:16px;margin-bottom:7px}.usage-track{height:8px;background:rgba(127,127,127,.18);border-radius:999px;overflow:hidden}.usage-fill{height:100%;background:currentColor;border-radius:999px;transition:width .25s ease}.usage-remaining{margin-top:20px;padding:12px;border-radius:10px;background:rgba(127,127,127,.10);font-size:13px}';document.head.append(style);
})();
