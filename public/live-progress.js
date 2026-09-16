(() => {
  'use strict';
  const terminal=new Set(['completed','failed','cancelled','blocked','incomplete','budget_exceeded']);
  let source=null;
  function render(p){
    const detail=document.querySelector('.gai-task-detail');
    if(!detail||!p)return;
    let box=detail.querySelector('.gai-live-progress');
    if(!box){box=document.createElement('div');box.className='gai-live-progress gai-task-detail-section';detail.querySelector('.gai-task-detail-card')?.appendChild(box);}
    box.replaceChildren();
    const h=document.createElement('h4');h.textContent=`Live execution · ${p.completedTasks||0}/${p.totalTasks||0}`;box.appendChild(h);
    const current=document.createElement('div');current.className='gai-task-verification-summary';current.textContent=p.currentTask?`Running: ${p.currentTask.title||p.currentTask.tool||'task'}`:`Status: ${p.status||'unknown'}`;box.appendChild(current);
    const list=document.createElement('div');
    for(const e of Array.isArray(p.events)?p.events.slice(-8):[]){const row=document.createElement('div');row.className='gai-task-step';const dot=document.createElement('span');dot.className='gai-task-step-dot';const tx=document.createElement('div');tx.className='gai-task-verification-summary';tx.textContent=`${e.type||'event'}${e.title?` · ${e.title}`:''}${e.tool?` · ${e.tool}`:''}${e.error?` — ${e.error}`:''}`;row.append(dot,tx);list.appendChild(row)}
    box.appendChild(list);
  }
  window.GlobalAILiveProgress={connect(runId){if(source)source.close();if(!runId)return;source=new EventSource(`/api/agent/${encodeURIComponent(runId)}/progress/stream`,{withCredentials:true});source.addEventListener('ready',e=>{try{render(JSON.parse(e.data).progress)}catch{}});source.addEventListener('message',e=>{try{const p=JSON.parse(e.data).progress;render(p);if(terminal.has(p?.status))source.close()}catch{}});source.onerror=()=>{if(source&&source.readyState===EventSource.CLOSED)source=null;};}};
})();
