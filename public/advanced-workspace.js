(() => {
  const app = document.querySelector('.app');
  const composer = document.querySelector('.composer');
  const chat = document.querySelector('#chat');
  if (!app || !composer || !chat) return;

  const style = document.createElement('style');
  style.textContent = `
    .gai-workspace-bar{display:flex;align-items:center;gap:7px;padding:7px 12px;border:1px solid #252c36;border-radius:12px;background:rgba(13,17,23,.72);backdrop-filter:blur(14px);margin:0 auto 9px;width:min(920px,calc(100% - 24px));box-sizing:border-box;color:#7f8999;font-size:9px}
    .gai-workspace-bar .pulse{width:6px;height:6px;border-radius:50%;background:#78d69a;box-shadow:0 0 0 4px rgba(120,214,154,.08)}
    .gai-workspace-bar strong{color:#cbd2dc;font-size:9px}.gai-workspace-bar .spacer{flex:1}.gai-chip{border:1px solid #2b323e;background:#151a22;color:#aeb7c5;border-radius:999px;padding:4px 8px;font-size:8px}
    .gai-composer-focus{border-color:#3b4553!important;box-shadow:0 14px 50px rgba(0,0,0,.25),0 0 0 3px rgba(255,255,255,.025)!important}
    .gai-char-count{font-variant-numeric:tabular-nums;opacity:.7}.gai-char-count.warn{color:#e7b66d;opacity:1}.gai-char-count.danger{color:#e98282;opacity:1}
    .gai-shortcuts{position:absolute;right:10px;bottom:10px;color:#596474;font-size:8px;pointer-events:none}.gai-shortcuts kbd{border:1px solid #2b323e;border-radius:4px;padding:2px 4px;background:#0c1016;color:#8e98a8}
    .gai-scroll-bottom{position:fixed;right:24px;bottom:132px;width:34px;height:34px;border:1px solid #303744;border-radius:50%;background:#11161e;color:#dce2ea;display:none;place-items:center;z-index:30;cursor:pointer;box-shadow:0 10px 30px rgba(0,0,0,.35)}
    .gai-scroll-bottom.show{display:grid}.gai-scroll-bottom:hover{background:#1b212a}
    .gai-activity{display:flex;align-items:center;gap:8px;margin:5px auto;width:min(920px,calc(100% - 24px));color:#707b8d;font-size:9px}.gai-activity i{width:6px;height:6px;border-radius:50%;background:#8792a3}.gai-activity.research i{background:#9ca9ff}.gai-activity.agent i{background:#e4b66d}
    @media(max-width:760px){.gai-workspace-bar{width:calc(100% - 16px);margin-bottom:6px}.gai-chip:nth-last-child(-n+2){display:none}.gai-shortcuts{display:none}.gai-scroll-bottom{right:14px;bottom:116px}}
  `;
  document.head.appendChild(style);

  const bar = document.createElement('div');
  bar.className = 'gai-workspace-bar';
  bar.innerHTML = '<span class="pulse"></span><strong>Global AI workspace</strong><span>Ready</span><span class="spacer"></span><span class="gai-chip">Multilingual</span><span class="gai-chip">Memory</span><span class="gai-chip">Secure</span>';
  const header = app.querySelector('.header');
  if (header) header.after(bar);

  const composerWrap = document.querySelector('.composer-wrap');
  const count = document.createElement('span');
  count.className = 'gai-char-count';
  count.textContent = '0 / 8000';
  const composerRight = document.querySelector('.composer-right');
  if (composerRight) composerRight.prepend(count);

  const updateCount = () => {
    const n = composer.querySelector('textarea')?.value.length || 0;
    count.textContent = `${n} / 8000`;
    count.classList.toggle('warn', n >= 6500 && n < 7600);
    count.classList.toggle('danger', n >= 7600);
  };
  const textarea = composer.querySelector('textarea');
  textarea?.addEventListener('input', updateCount);
  textarea?.addEventListener('focus', () => composer.classList.add('gai-composer-focus'));
  textarea?.addEventListener('blur', () => composer.classList.remove('gai-composer-focus'));
  updateCount();

  if (composerWrap) {
    const hint = document.createElement('div');
    hint.className = 'gai-shortcuts';
    hint.innerHTML = '<kbd>Enter</kbd> send · <kbd>Shift</kbd> + <kbd>Enter</kbd> new line';
    composerWrap.appendChild(hint);
  }

  const scrollButton = document.createElement('button');
  scrollButton.className = 'gai-scroll-bottom';
  scrollButton.type = 'button';
  scrollButton.setAttribute('aria-label', 'Scroll to latest message');
  scrollButton.textContent = '↓';
  scrollButton.addEventListener('click', () => chat.scrollTo({top: chat.scrollHeight, behavior: 'smooth'}));
  document.body.appendChild(scrollButton);
  const updateScroll = () => {
    const distance = chat.scrollHeight - chat.scrollTop - chat.clientHeight;
    scrollButton.classList.toggle('show', distance > 260);
  };
  chat.addEventListener('scroll', updateScroll, {passive:true});
  new MutationObserver(updateScroll).observe(chat, {childList:true, subtree:true});

  const addActivity = (type, label) => {
    const row = document.createElement('div');
    row.className = `gai-activity ${type || ''}`;
    const dot = document.createElement('i');
    const text = document.createElement('span');
    text.textContent = label;
    row.append(dot, text);
    chat.appendChild(row);
    chat.scrollTop = chat.scrollHeight;
    return row;
  };

  document.querySelector('#deep-research-button')?.addEventListener('click', () => addActivity('research', 'Deep Research workspace started'));
  document.querySelector('#agent-button')?.addEventListener('click', () => addActivity('agent', 'Agent workspace ready'));

  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      document.querySelector('#new-chat')?.click();
    }
  });
})();
