(() => {
  const button = document.getElementById('agent-button');
  const message = document.getElementById('message');
  if (!button || !message) return;

  const style = document.createElement('style');
  style.textContent = `.agent-panel{margin:12px 0;padding:14px;border:1px solid rgba(255,255,255,.12);border-radius:14px;background:rgba(255,255,255,.04)}.agent-panel h3{margin:0 0 8px}.agent-meta{font-size:12px;opacity:.7;margin-bottom:10px}.agent-steps{max-height:260px;overflow:auto;font-size:13px}.agent-step{padding:7px 0;border-bottom:1px solid rgba(255,255,255,.07)}.agent-actions{display:flex;gap:8px;margin-top:10px}.agent-actions button{border:0;border-radius:9px;padding:8px 12px;cursor:pointer}.agent-cancel{background:rgba(255,80,80,.15)}.agent-approve{background:rgba(80,220,130,.18)}.agent-reject{background:rgba(255,255,255,.08)}`;
  document.head.appendChild(style);

  let panel = null;
  let timer = null;
  let activeId = null;

  function ensurePanel() {
    if (panel) return panel;
    panel = document.createElement('div');
    panel.className = 'agent-panel';
    panel.innerHTML = '<h3>🤖 Autonomous Agent</h3><div class="agent-meta">Preparing…</div><div class="agent-steps"></div><div class="agent-actions"></div>';
    const chat = document.getElementById('chat');
    chat?.appendChild(panel);
    return panel;
  }
  function render(text, meta, steps = [], actions = '') {
    const p = ensurePanel();
    p.querySelector('.agent-meta').textContent = meta;
    p.querySelector('.agent-steps').innerHTML = steps.map((s, i) => `<div class="agent-step"><b>${i + 1}. ${s.type || 'step'}</b>${s.content ? ` — ${String(s.content).slice(0,500)}` : ''}</div>`).join('') + (text ? `<div class="agent-step">${String(text).replace(/</g,'&lt;')}</div>` : '');
    p.querySelector('.agent-actions').innerHTML = actions;
  }
  function stopPolling() { if (timer) clearInterval(timer); timer = null; }

  async function poll(id) {
    try {
      const r = await fetch(`/api/agent/background/${encodeURIComponent(id)}`);
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Agent status failed.');
      render(data.output || '', `Status: ${data.status}`, data.steps || [], ['completed','failed','cancelled','incomplete','budget_exceeded'].includes(data.status) ? '' : `<button class="agent-cancel" id="agent-cancel">Cancel agent</button>`);
      const cancel = document.getElementById('agent-cancel');
      if (cancel) cancel.onclick = async () => { await fetch(`/api/agent/background/${encodeURIComponent(id)}/cancel`, { method:'POST' }); await poll(id); };
      if (['completed','failed','cancelled','incomplete','budget_exceeded'].includes(data.status)) stopPolling();
    } catch (e) { render('', `Error: ${e.message}`, []); stopPolling(); }
  }

  async function start(goal, approvalId = null, permissions = null) {
    const body = { goal };
    if (approvalId) { body.approvalId = approvalId; body.permissions = permissions; }
    const r = await fetch('/api/agent/background', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
    const data = await r.json();
    if (!r.ok) throw Object.assign(new Error(data.error || 'Agent failed to start.'), { status:r.status });
    activeId = data.id;
    render('', `Started — ${data.status} · risk: ${data.risk || 'unknown'}`, []);
    await poll(activeId);
    stopPolling();
    timer = setInterval(() => poll(activeId), 3500);
  }

  button.addEventListener('click', async () => {
    const goal = message.value.trim();
    if (!goal) { message.focus(); return; }
    button.disabled = true;
    try {
      const pre = await fetch('/api/agent/preflight', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({goal}) });
      const policy = await pre.json();
      if (!pre.ok) throw new Error(policy.error || 'Agent preflight failed.');
      if (policy.requiresApproval) {
        const approval = await fetch('/api/agent/approval', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({goal}) }).then(r=>r.json());
        if (!approval.id) throw new Error(approval.error || 'Could not create approval request.');
        render('', `⚠️ Human approval required · risk: ${approval.risk}`, [], `<button class="agent-approve" id="agent-approve">Approve & run</button><button class="agent-reject" id="agent-reject">Reject</button>`);
        document.getElementById('agent-approve').onclick = async () => {
          const r = await fetch(`/api/agent/approval/${encodeURIComponent(approval.id)}/decision`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({decision:'approved'}) });
          const data = await r.json(); if (!r.ok) throw new Error(data.error || 'Approval failed.');
          activeId = data.agent.id; render('', `Approved — ${data.agent.status}`, []); stopPolling(); await poll(activeId); timer = setInterval(() => poll(activeId), 3500);
        };
        document.getElementById('agent-reject').onclick = async () => { await fetch(`/api/agent/approval/${encodeURIComponent(approval.id)}/decision`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({decision:'rejected'}) }); render('', 'Agent rejected by user.', []); };
      } else {
        await start(goal);
      }
    } catch (e) { render('', `Error: ${e.message}`, []); }
    finally { button.disabled = false; }
  });
})();
