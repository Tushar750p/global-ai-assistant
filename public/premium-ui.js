(() => {
  const chat = document.querySelector('#chat');
  const composer = document.querySelector('.composer-wrap');
  const sidebar = document.querySelector('.sidebar');
  if (!chat || !composer || !sidebar) return;

  const style = document.createElement('style');
  style.textContent = `
    :root{--ga-glow:rgba(151,167,255,.12);--ga-border:rgba(255,255,255,.08)}
    body{background:#07090d}
    .shell{background:radial-gradient(circle at 70% 18%,rgba(111,126,255,.055),transparent 28%),#080a0f}
    .sidebar{background:linear-gradient(180deg,rgba(14,17,23,.98),rgba(9,11,15,.98));border-right:1px solid rgba(255,255,255,.065);backdrop-filter:blur(18px)}
    .brand{height:58px;padding:0 16px;box-sizing:border-box}.brand-mark,.welcome-icon{background:linear-gradient(135deg,#f1f4ff,#8e9aff);color:#0a0c12;box-shadow:0 8px 30px rgba(142,154,255,.18)}
    .new-chat{height:42px;border:1px solid rgba(255,255,255,.09);background:linear-gradient(180deg,#191e27,#12161d);box-shadow:0 8px 25px rgba(0,0,0,.18);transition:.2s}.new-chat:hover{transform:translateY(-1px);border-color:rgba(255,255,255,.16)}
    .header{height:64px;background:rgba(8,10,14,.72);border-bottom:1px solid rgba(255,255,255,.055);backdrop-filter:blur(20px)}
    .topbar-title{font-size:13px;font-weight:800;letter-spacing:-.01em}.eyebrow{letter-spacing:.16em}
    .chat{scroll-behavior:smooth;padding-top:30px}
    .welcome-card{position:relative;overflow:hidden;width:min(760px,calc(100% - 32px));margin:clamp(24px,9vh,90px) auto 130px;padding:34px;border:1px solid rgba(255,255,255,.085);border-radius:24px;background:linear-gradient(145deg,rgba(19,23,31,.94),rgba(11,14,20,.96));box-shadow:0 35px 100px rgba(0,0,0,.28),inset 0 1px rgba(255,255,255,.035)}
    .welcome-card:before{content:"";position:absolute;width:320px;height:320px;right:-150px;top:-180px;border-radius:50%;background:radial-gradient(circle,var(--ga-glow),transparent 68%);pointer-events:none}.welcome-card h2{font-size:30px;letter-spacing:-.035em;margin:18px 0 8px}.welcome-card>p{max-width:600px;font-size:13px;line-height:1.7;color:#8994a6}.welcome-icon{width:48px;height:48px;border-radius:15px;display:grid;place-items:center;font-size:21px}
    .suggestions{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin-top:24px}.suggestion{min-height:70px;padding:13px;text-align:left;border:1px solid rgba(255,255,255,.07);border-radius:14px;background:rgba(255,255,255,.025);color:#cbd2de;font-size:11px;line-height:1.45;transition:.2s}.suggestion:hover{transform:translateY(-2px);background:rgba(255,255,255,.05);border-color:rgba(255,255,255,.14);box-shadow:0 12px 30px rgba(0,0,0,.18)}
    .composer-wrap{padding:0 22px 17px;background:linear-gradient(180deg,transparent 0%,rgba(8,10,14,.86) 26%,#080a0e 55%)}
    .composer{border:1px solid rgba(255,255,255,.11);border-radius:20px;background:linear-gradient(180deg,#131821,#0e1218);box-shadow:0 18px 55px rgba(0,0,0,.35),0 0 0 1px rgba(255,255,255,.015);transition:.2s}.composer:focus-within{border-color:rgba(174,184,255,.28);box-shadow:0 18px 55px rgba(0,0,0,.4),0 0 0 4px rgba(142,154,255,.045)}
    #message{font-size:13px;line-height:1.55;padding:17px 18px 10px}.composer-bottom{padding:6px 10px 10px}.icon-button,.mode-toggle,.mode-button{transition:.18s}.icon-button:hover,.mode-toggle:hover,.mode-button:hover{transform:translateY(-1px);filter:brightness(1.12)}
    .send-button{width:38px;height:38px;border-radius:12px;background:linear-gradient(135deg,#f0f3fa,#b9c2d3);color:#0a0d13;box-shadow:0 8px 22px rgba(0,0,0,.25)}.send-button b{font-size:17px}
    .message{max-width:880px;margin-left:auto;margin-right:auto;animation:ga-in .24s ease both}.message .bubble{font-size:13px;line-height:1.7}.message.assistant .bubble{border:1px solid rgba(255,255,255,.055)}
    .status{border:1px solid rgba(255,255,255,.07);padding:7px 9px;border-radius:9px;background:rgba(255,255,255,.02)}
    @keyframes ga-in{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}
    @media(max-width:760px){.welcome-card{padding:25px 20px;border-radius:19px;margin-top:30px}.welcome-card h2{font-size:24px}.suggestions{grid-template-columns:1fr}.composer-wrap{padding:0 10px 10px}.composer-right span{display:none}.header{padding-left:10px;padding-right:10px}.header-actions{gap:5px}}
    @media(prefers-reduced-motion:reduce){*,*:before,*:after{scroll-behavior:auto!important;animation:none!important;transition:none!important}}
  `;
  document.head.appendChild(style);

  const enhanceWelcome = () => {
    const card = chat.querySelector('.welcome-card');
    if (!card || card.dataset.premium) return;
    card.dataset.premium = '1';
    const p = card.querySelector('p');
    if (p) p.textContent = 'One workspace for everyday chat, documents, live web search, deep research, and controlled AI agents.';
  };
  enhanceWelcome();
  new MutationObserver(enhanceWelcome).observe(chat,{childList:true,subtree:true});
})();
