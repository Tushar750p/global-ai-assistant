(()=>{
  const authButton=document.querySelector('#auth-button');
  if(!authButton)return;
  const usageButton=[...document.querySelectorAll('.auth-button')].find(button=>button!==authButton&&button.textContent.trim()==='Usage');
  const anchor=usageButton||authButton;
  const button=document.createElement('button');
  button.type='button';button.className='auth-button';button.textContent='Pro';button.title='Manage your Pro plan';
  anchor.insertAdjacentElement('afterend',button);
  const modal=document.createElement('div');modal.hidden=true;modal.className='auth-modal';
  modal.innerHTML='<div class="auth-card billing-card" role="dialog" aria-modal="true" aria-labelledby="billing-title"><button class="auth-close billing-close" type="button" aria-label="Close">×</button><div class="eyebrow">GLOBAL AI BILLING</div><h2 id="billing-title">Pro plan</h2><p id="billing-status">Loading…</p><div id="billing-actions"></div></div>';
  document.body.append(modal);
  const status=modal.querySelector('#billing-status'),actions=modal.querySelector('#billing-actions');
  const close=()=>{modal.hidden=true};
  async function load(){
    status.textContent='Loading billing status…';actions.innerHTML='';
    try{
      const r=await fetch('/api/billing/status',{cache:'no-store'}),d=await r.json();
      if(r.status===401){status.textContent='Please sign in first.';return;}
      if(!r.ok)throw Error(d.error||'Could not load billing status.');
      const active=Boolean(d.subscription?.active&&d.plan==='pro');
      if(active){
        status.innerHTML='<strong>You are on Pro.</strong><br/>Your subscription is active.';
        const cancel=document.createElement('button');cancel.type='button';cancel.className='auth-submit billing-cancel';cancel.textContent='Cancel Pro subscription';
        cancel.onclick=async()=>{
          if(!confirm('Cancel your Pro subscription now? This ends the Stripe subscription immediately.'))return;
          cancel.disabled=true;cancel.textContent='Cancelling…';
          try{const response=await fetch('/api/billing/cancel',{method:'POST'}),data=await response.json();if(!response.ok)throw Error(data.error||'Could not cancel subscription.');await load();}catch(error){cancel.disabled=false;cancel.textContent='Cancel Pro subscription';status.textContent=error.message;}
        };
        actions.append(cancel);
      }else{
        status.innerHTML='<strong>Free plan</strong><br/>Upgrade to Pro for higher monthly AI limits.';
        const upgrade=document.createElement('button');upgrade.type='button';upgrade.className='auth-submit';upgrade.textContent='Upgrade to Pro';
        upgrade.onclick=async()=>{upgrade.disabled=true;upgrade.textContent='Opening Stripe…';try{const response=await fetch('/api/billing/checkout',{method:'POST'}),data=await response.json();if(!response.ok)throw Error(data.error||'Could not start checkout.');if(!data.url)throw Error('Stripe Checkout URL was not returned.');window.location.assign(data.url);}catch(error){upgrade.disabled=false;upgrade.textContent='Upgrade to Pro';status.textContent=error.message;}};
        actions.append(upgrade);
      }
    }catch(error){status.textContent=error.message;}
  }
  button.onclick=()=>{modal.hidden=false;load()};
  modal.querySelector('.billing-close').onclick=close;
  modal.addEventListener('click',event=>{if(event.target===modal)close()});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!modal.hidden)close()});
  const style=document.createElement('style');style.textContent='.billing-card{max-width:480px}.billing-card #billing-status{line-height:1.6;margin:18px 0}.billing-card #billing-actions{display:flex;flex-direction:column;gap:10px}.billing-card .auth-submit{width:100%;border:0;padding:12px 16px;border-radius:10px;cursor:pointer}.billing-card .auth-submit:disabled{opacity:.6;cursor:wait}.billing-cancel{background:transparent!important;border:1px solid currentColor!important}';document.head.append(style);
})();
