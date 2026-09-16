(() => {
  'use strict';
  const style = document.createElement('style');
  style.textContent = `
    .gai-response-shell{position:relative}
    .gai-response-label{display:flex;align-items:center;gap:8px;margin:0 0 8px 2px;font-size:12px;font-weight:700;letter-spacing:.02em;opacity:.72}
    .gai-response-label .gai-spark{width:7px;height:7px;border-radius:50%;background:currentColor;box-shadow:0 0 10px currentColor}
    .gai-response-meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:8px 0 0 2px;font-size:11px;opacity:.58}
    .gai-tool-card{display:flex;align-items:flex-start;gap:10px;margin:10px 0;padding:10px 12px;border:1px solid rgba(127,127,127,.18);border-radius:12px;background:rgba(127,127,127,.06)}
    .gai-tool-icon{width:26px;height:26px;display:grid;place-items:center;border-radius:8px;background:rgba(127,127,127,.1);font-size:13px;flex:0 0 auto}
    .gai-tool-copy{min-width:0}.gai-tool-title{font-size:12px;font-weight:700}.gai-tool-detail{font-size:11px;opacity:.62;margin-top:2px;white-space:pre-wrap;overflow-wrap:anywhere}
    .gai-tool-card.is-complete .gai-tool-icon::after{content:'✓';font-size:11px}
    .gai-tool-card.is-complete .gai-tool-icon{font-size:0}
    .gai-source-card{border-radius:12px}
  `;
  document.head.appendChild(style);
  const toText = (value, fallback = '') => value == null ? fallback : String(value);
  function createToolCard(type, title, detail, complete = false) {
    const card = document.createElement('div');
    card.className = `gai-tool-card${complete ? ' is-complete' : ''}`;
    card.dataset.toolType = toText(type, 'tool');
    const icon = document.createElement('div');
    icon.className = 'gai-tool-icon';
    icon.textContent = type === 'research' ? 'R' : type === 'agent' ? 'A' : '•';
    const copy = document.createElement('div');
    copy.className = 'gai-tool-copy';
    const titleEl = document.createElement('div');
    titleEl.className = 'gai-tool-title';
    titleEl.textContent = toText(title, 'Working');
    const detailEl = document.createElement('div');
    detailEl.className = 'gai-tool-detail';
    detailEl.textContent = toText(detail);
    copy.append(titleEl, detailEl);
    card.append(icon, copy);
    return card;
  }
  function enhance(message) {
    if (!message || message.dataset.gaiEnhanced === '1' || !message.classList.contains('assistant')) return;
    const body = message.querySelector('.message-body');
    if (!body) return;
    message.dataset.gaiEnhanced = '1';
    message.classList.add('gai-response-shell');
    const label = document.createElement('div');
    label.className = 'gai-response-label';
    const spark = document.createElement('span');
    spark.className = 'gai-spark';
    const name = document.createElement('span');
    name.textContent = 'Global AI';
    label.append(spark, name);
    body.prepend(label);
    const meta = document.createElement('div');
    meta.className = 'gai-response-meta';
    const metaText = document.createElement('span');
    metaText.textContent = 'AI response';
    meta.appendChild(metaText);
    body.appendChild(meta);
  }
  function scan(root = document) {
    root.querySelectorAll?.('.message.assistant').forEach(enhance);
  }
  window.GlobalAIResponseUI = {
    activity(type, title, detail) {
      const host = document.querySelector('.messages, #messages, .chat-messages');
      if (!host) return null;
      const card = createToolCard(type, title, detail, false);
      host.appendChild(card);
      host.scrollTop = host.scrollHeight;
      return card;
    },
    complete(card, detail) {
      if (!card) return;
      card.classList.add('is-complete');
      const detailEl = card.querySelector('.gai-tool-detail');
      if (detailEl && detail !== undefined) detailEl.textContent = toText(detail);
    }
  };
  scan();
  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType !== 1) return;
        if (node.matches?.('.message.assistant')) enhance(node);
        scan(node);
      });
    }
  }).observe(document.body, { childList: true, subtree: true });
})();
