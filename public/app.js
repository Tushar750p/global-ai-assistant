const form = document.querySelector('#chat-form');
const input = document.querySelector('#message');
const chat = document.querySelector('#chat');
const send = document.querySelector('#send');
const status = document.querySelector('#status');
const sidebarStatus = document.querySelector('#sidebar-status');
const language = document.querySelector('#language');
const newChat = document.querySelector('#new-chat');
const fileInput = document.querySelector('#file-input');
const fileChip = document.querySelector('#file-chip');
const fileName = document.querySelector('#file-name');
const removeFile = document.querySelector('#remove-file');
const uploadStatus = document.querySelector('#upload-status');
const STORAGE_KEY = 'global-ai-chat-v1';
const LANGUAGE_KEY = 'global-ai-language-v1';

let history = loadHistory();
let attachedFileId = null;

function loadHistory() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(saved) ? saved.filter(item => item && ['user', 'assistant'].includes(item.role) && typeof item.content === 'string').slice(-40) : [];
  } catch { return []; }
}

function saveHistory() { localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(-40))); }

function addMessage(role, text) {
  const wrapper = document.createElement('div');
  wrapper.className = `message ${role}`;
  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.textContent = role === 'assistant' ? '✦' : 'YOU';
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = text;
  wrapper.append(avatar, bubble);
  chat.appendChild(wrapper);
  chat.scrollTop = chat.scrollHeight;
}

function renderWelcome() {
  chat.innerHTML = '<div class="welcome-card"><div class="welcome-icon">✦</div><h2>Welcome to Global AI</h2><p>Your multilingual AI workspace. Start a conversation below.</p><div class="suggestions"><button class="suggestion" type="button" data-prompt="Explain cloud computing in simple words.">☁️ Explain cloud computing</button><button class="suggestion" type="button" data-prompt="Help me write a professional email.">✍️ Write an email</button><button class="suggestion" type="button" data-prompt="Teach me Linux system administration step by step.">🛠️ Learn a skill</button></div></div>';
  document.querySelectorAll('.suggestion').forEach(button => button.addEventListener('click', () => { input.value = button.dataset.prompt || ''; input.focus(); form.requestSubmit(); }));
}

function renderHistory() {
  chat.innerHTML = '';
  if (!history.length) return renderWelcome();
  history.forEach(item => addMessage(item.role, item.content));
}

async function checkHealth() {
  try {
    const res = await fetch('/api/health', { headers: { Accept: 'application/json' } });
    const data = await res.json();
    const text = data.aiConfigured ? 'AI ready' : 'API key needed';
    status.textContent = text; sidebarStatus.textContent = text;
  } catch { status.textContent = 'Offline'; sidebarStatus.textContent = 'Offline'; }
}

function getLanguageInstruction() {
  const names = { en: 'English', hi: 'Hindi', mr: 'Marathi', es: 'Spanish', fr: 'French', de: 'German', pt: 'Portuguese', ja: 'Japanese', ko: 'Korean', ar: 'Arabic' };
  return language.value === 'auto' ? '' : `Please answer in ${names[language.value]}.`;
}

async function uploadFile(file) {
  if (!file) return;
  uploadStatus.textContent = 'Uploading…';
  fileInput.disabled = true;
  try {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/files', { method: 'POST', body: formData, headers: { Accept: 'application/json' } });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed');
    attachedFileId = data.fileId;
    fileName.textContent = data.name;
    fileChip.hidden = false;
    uploadStatus.textContent = 'Document ready';
  } catch (error) {
    attachedFileId = null;
    fileChip.hidden = true;
    uploadStatus.textContent = error.message;
  } finally {
    fileInput.disabled = false;
    fileInput.value = '';
  }
}

fileInput.addEventListener('change', () => uploadFile(fileInput.files?.[0]));
removeFile.addEventListener('click', () => { attachedFileId = null; fileChip.hidden = true; fileName.textContent = ''; uploadStatus.textContent = 'Files up to 10 MB'; });

form.addEventListener('submit', async event => {
  event.preventDefault();
  const message = input.value.trim();
  if (!message || send.disabled) return;

  addMessage('user', attachedFileId ? `📎 ${fileName.textContent}\n${message}` : message);
  input.value = '';
  send.disabled = true;
  send.querySelector('span').textContent = 'Thinking…';

  const requestHistory = [...history];
  const languageInstruction = getLanguageInstruction();
  const finalMessage = languageInstruction ? `${languageInstruction}\n\n${message}` : message;
  const currentFileId = attachedFileId;

  try {
    const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ message: finalMessage, history: requestHistory, fileId: currentFileId }) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    addMessage('assistant', data.reply);
    history.push({ role: 'user', content: message }, { role: 'assistant', content: data.reply });
    saveHistory();
  } catch (error) {
    addMessage('assistant', `Sorry — ${error.message}`);
  } finally {
    send.disabled = false;
    send.querySelector('span').textContent = 'Send';
    input.focus();
  }
});

newChat.addEventListener('click', () => { history = []; localStorage.removeItem(STORAGE_KEY); attachedFileId = null; fileChip.hidden = true; renderHistory(); input.focus(); });
language.value = localStorage.getItem(LANGUAGE_KEY) || 'auto';
language.addEventListener('change', () => localStorage.setItem(LANGUAGE_KEY, language.value));
input.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); form.requestSubmit(); } });
renderHistory();
checkHealth();
