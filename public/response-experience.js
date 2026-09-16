(() => {
  const chat = document.querySelector('#chat');
  if (!chat) return;

  const style = document.createElement('style');
  style.textContent = `
    .ga-response-shell{position:relative}.ga-response-label{display:flex;align-items:center;gap:7px;margin:0 0 7px 3px;color:#7e899a;font-size:9px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.ga-response-label i{width:7px;height:7px;border-radius:50%;background:#d9dee7;box-shadow:0 0 0 3px rgba(217,222,231,.07)}
    .assistant .bubble{border-radius:4px 16px 16px 16px;background:linear-gradient(180deg,#121720,#10141b);box-shadow:0 8px 28px rgba(0,0,0,.12)}
    .user .bubble{border-radius:16px 4px 16px 16px}
    .ga-response-meta{display:flex;align-items:center;gap:6px;margin-top:8px;color:#687384;font-size:9px}.ga-response-meta button{border:0;background:transparent;color:#788496;padding:3px 6px;border-radius:6px;font-size:9px;cursor:pointer}.ga-response-meta button:hover{background:#1a2029;color:#e8ecf2}.ga-response-meta .ga-spacer{flex:1}
    .ga-tool-card{margin:10px 0 2px;border:1px solid #29313d;border-radius:11px;background:#0d1218;overflow:hidden}.ga-tool-head{display:flex;align-items:center;gap:8px;padding:9px 11px;color:#b8c1ce;font-size:10px;font-weight:800}.ga-tool-head i{width:7px;height:7px;border-radius:50%;background:#8894a5}.ga-tool-body{padding:0 11px 10px;color:#717d8f;font-size:10px;line-height:1.5}.ga-tool-card.done .ga-tool-head i{background:#75d69a}.ga-tool-card.research .ga-tool-head i{background:#9ca9ff}.ga-tool-card.agent .ga-tool-head i{background:#e4b66d}
    .ga-source-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:7px;margin-top:8px}.ga-source-card{display:block;text-decoration:none;border:1px solid #252d38;border-radius:10px;padding:9px;background:#0e1319;min-width:0}.ga-source-card:hover{border-color:#3b4554;background:#141a22}.ga-source-card strong{display:block;color:#cbd3df;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ga-source-card small{display:block;color:#697487;margin-top:4px;font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    @media(max-width:760px){.ga-source-grid{grid-template-columns:1fr}.ga-response-meta{opacity:1}}
  `;
  document.head.appendChild(style);

  const enhance = node => {
    if (!(node instanceof Element) || !node.classList.contains('message') || node.dataset.gaEnhanced) return;
    node.dataset.gaEnhanced = '1';
    const body = node.querySelector('.message-body');
    const bubble = node.querySelector('.bubble');
    if (!body || !bubble) return;
    if (node.classList.contains('assistant')) {
      const label = document.createElement('div'); label.className='ga-response-label'; label.innerHTML='<i></i><span>Global AI</span>';
      body.insertBefore(label, bubble);
      const meta = document.createElement('div'); meta.className='ga-response-meta';
      meta.innerHTML='<span>AI response</span><span class="ga-spacer"></span>';
      const copy = document.createElement('button'); copy.type='button'; copy.textContent='Copy'; copy.onclick=()=>navigator.clipboard?.writeText(bubble.textContent||'').then(()=>{copy.textContent='Copied';setTimeout(()=>copy.textContent='Copy',1000)});
      meta.appendChild(copy); body.appendChild(meta);
    }
  };
  chat.querySelectorAll('.message').forEach(enhance);
  new MutationObserver(muts => muts.forEach(m => m.addedNodes.forEach(n => { enhance(n); n.querySelectorAll?.('.message').forEach(enhance); }))).observe(chat,{childList:true});

  window.GlobalAIResponseUI = {
    activity(type,title,detail='') {
      const card=document.createElement('div'); card.className=`ga-tool-card ${type||''}`; card.innerHTML=`<div class="ga-tool-head"><i></i><span>${title}</span></div>${detail?`<div class="ga-tool-body">${detail}</div>`:''}`; chat.appendChild(card); chat.scrollTop=chat.scrollHeight; return card;
    },
    complete(card,detail='Completed') { if(!card)return; card.classList.add('done'); const body=card.querySelector('.ga-tool-body'); if(body)body.textContent=detail; }
  };
})();
