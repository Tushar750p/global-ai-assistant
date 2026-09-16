(() => {
  const button = document.getElementById('deep-research-button');
  const message = document.getElementById('message');
  if (!button || !message) return;

  const style = document.createElement('style');
  style.textContent = `
    .research-overlay{position:fixed;inset:0;background:rgba(0,0,0,.62);display:flex;align-items:center;justify-content:center;padding:20px;z-index:9999}
    .research-panel{width:min(1000px,96vw);max-height:90vh;overflow:auto;background:#10131a;border:1px solid rgba(255,255,255,.12);border-radius:18px;box-shadow:0 24px 80px rgba(0,0,0,.45);padding:24px;color:#eef2f7}
    .research-head{display:flex;align-items:center;justify-content:space-between;gap:16px}.research-head h2{margin:0;font-size:20px}.research-close{border:0;background:transparent;color:inherit;font-size:26px;cursor:pointer}
    .research-status{margin:16px 0;padding:12px 14px;border-radius:10px;background:rgba(255,255,255,.06);font-size:14px}.research-report{line-height:1.65;white-space:pre-wrap}.research-citations{margin-top:22px;padding-top:16px;border-top:1px solid rgba(255,255,255,.1)}.research-citations a{display:block;margin:7px 0;color:#8fc7ff;overflow-wrap:anywhere}
    .research-options{display:flex;gap:12px;align-items:center;margin-top:12px;font-size:13px}.research-options label{display:flex;gap:7px;align-items:center}.research-toggle{cursor:pointer}
  `;
  document.head.appendChild(style);

  function openPanel(query) {
    const overlay = document.createElement('div');
    overlay.className = 'research-overlay';
    overlay.innerHTML = `<section class="research-panel" role="dialog" aria-modal="true" aria-labelledby="research-title">
      <div class="research-head"><h2 id="research-title">🔬 Deep Research</h2><button class="research-close" aria-label="Close">×</button></div>
      <div class="research-status">Starting autonomous research…</div>
      <div class="research-report"></div>
      <div class="research-citations" hidden><strong>Sources</strong><div></div></div>
    </section>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector('.research-close').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    return { overlay, status: overlay.querySelector('.research-status'), report: overlay.querySelector('.research-report'), citations: overlay.querySelector('.research-citations'), close };
  }

  async function poll(id, view) {
    for (;;) {
      const r = await fetch(`/api/research/${encodeURIComponent(id)}`, { credentials: 'same-origin', cache: 'no-store' });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || 'Could not load research status.');
      if (data.status === 'completed') {
        view.status.textContent = 'Research complete.';
        view.report.textContent = data.report || 'No report was returned.';
        if (Array.isArray(data.citations) && data.citations.length) {
          view.citations.hidden = false;
          const box = view.citations.querySelector('div');
          box.textContent = '';
          for (const source of data.citations) {
            const a = document.createElement('a');
            a.href = source.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = source.title || source.url;
            box.appendChild(a);
          }
        }
        return;
      }
      if (data.status === 'failed') throw new Error(data.error || 'Deep Research failed.');
      view.status.textContent = data.status === 'running' ? 'Researching: searching, reading, checking, and synthesizing…' : 'Research job queued…';
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  button.addEventListener('click', async () => {
    const query = message.value.trim();
    if (!query) { message.focus(); return; }
    const view = openPanel(query);
    button.disabled = true;
    try {
      const r = await fetch('/api/research', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, visualization: false })
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || 'Could not start Deep Research.');
      await poll(data.id, view);
    } catch (e) {
      view.status.textContent = 'Research failed.';
      view.report.textContent = e?.message || 'Unknown research error.';
    } finally { button.disabled = false; }
  });
})();
