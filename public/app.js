const form = document.querySelector('#chat-form');
const input = document.querySelector('#message');
const chat = document.querySelector('#chat');
const send = document.querySelector('#send');
const status = document.querySelector('#status');

const history = [];

function addMessage(role, text) {
  const wrapper = document.createElement('div');
  wrapper.className = `message ${role}`;
  wrapper.innerHTML = `<div class="avatar">${role === 'assistant' ? 'AI' : 'YOU'}</div><div class="bubble"></div>`;
  wrapper.querySelector('.bubble').textContent = text;
  chat.appendChild(wrapper);
  chat.scrollTop = chat.scrollHeight;
}

async function checkHealth() {
  try {
    const res = await fetch('/api/health');
    const data = await res.json();
    status.textContent = data.aiConfigured ? 'AI ready' : 'Add API key';
  } catch {
    status.textContent = 'Offline';
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = input.value.trim();
  if (!message || send.disabled) return;

  addMessage('user', message);
  input.value = '';
  send.disabled = true;
  send.textContent = 'Thinking…';

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');

    addMessage('assistant', data.reply);
    history.push({ role: 'user', content: message }, { role: 'assistant', content: data.reply });
  } catch (error) {
    addMessage('assistant', `Sorry — ${error.message}`);
  } finally {
    send.disabled = false;
    send.textContent = 'Send';
    input.focus();
  }
});

input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

checkHealth();
