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
const imageInput = document.querySelector('#image-input');
const imageChip = document.querySelector('#image-chip');
const imagePreview = document.querySelector('#image-preview');
const imageName = document.querySelector('#image-name');
const removeImage = document.querySelector('#remove-image');
const uploadStatus = document.querySelector('#upload-status');
const webSearch = document.querySelector('#web-search');
const voiceButton = document.querySelector('#voice-button');
const voiceStatus = document.querySelector('#voice-status');
const speakAnswer = document.querySelector('#speak-answer');
const STORAGE_KEY = 'global-ai-chat-v1';
const LANGUAGE_KEY = 'global-ai-language-v1';
const WEB_SEARCH_KEY = 'global-ai-web-search-v1';
const SPEAK_KEY = 'global-ai-speak-v1';

let history = loadHistory();
let attachedFileId = null;
let attachedImageData = null;
let mediaRecorder = null;
let audioChunks = [];

function loadHistory() {
  try { const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); return Array.isArray(saved) ? saved.filter(item => item && ['user', 'assistant'].includes(item.role) && typeof item.content === 'string').slice(-40) : []; }
  catch { return []; }
}
function saveHistory() { localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(-40))); }
function addMessage(role, text) {
  const wrapper = document.createElement('div'); wrapper.className = `message ${role}`;
  const avatar = document.createElement('div'); avatar.className = 'avatar'; avatar.textContent = role === 'assistant' ? '✦' : 'YOU';
  const bubble = document.createElement('div'); bubble.className = 'bubble'; bubble.textContent = text;
  wrapper.append(avatar, bubble); chat.appendChild(wrapper); chat.scrollTop = chat.scrollHeight; return bubble;
}
function addSources(sources) {
  if (!Array.isArray(sources) || !sources.length) return;
  const block = document.createElement('div'); block.className = 'sources'; const title = document.createElement('div'); title.className = 'sources-title'; title.textContent = 'Sources'; block.appendChild(title);
  sources.forEach(source => { if (!source || typeof source.url !== 'string' || !/^https?:\/\//i.test(source.url)) return; const link = document.createElement('a'); link.href = source.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = source.title || source.url; block.appendChild(link); });
  if (block.querySelector('a')) chat.appendChild(block); chat.scrollTop = chat.scrollHeight;
}
function renderWelcome() {
  chat.innerHTML = '<div class="welcome-card"><div class="welcome-icon">✦</div><h2>Welcome to Global AI</h2><p>Your multilingual AI workspace. Start typing or use the microphone.</p><div class="suggestions"><button class="suggestion" type="button" data-prompt="Explain cloud computing in simple words.">☁️ Explain cloud computing</button><button class="suggestion" type="button" data-prompt="Help me write a professional email.">✍️ Write an email</button><button class="suggestion" type="button" data-prompt="Teach me Linux system administration step by step.">🛠️ Learn a skill</button></div></div>';
  document.querySelectorAll('.suggestion').forEach(button => button.addEventListener('click', () => { input.value = button.dataset.prompt || ''; input.focus(); form.requestSubmit(); }));
}
function renderHistory() { chat.innerHTML = ''; if (!history.length) return renderWelcome(); history.forEach(item => addMessage(item.role, item.content)); }
async function checkHealth() { try { const res = await fetch('/api/health', { headers: { Accept: 'application/json' } }); const data = await res.json(); const text = data.aiConfigured ? 'AI ready' : 'API key needed'; status.textContent = text; sidebarStatus.textContent = text; } catch { status.textContent = 'Offline'; sidebarStatus.textContent = 'Offline'; } }
function getLanguageInstruction() { const names = { en:'English',hi:'Hindi',mr:'Marathi',es:'Spanish',fr:'French',de:'German',pt:'Portuguese',ja:'Japanese',ko:'Korean',ar:'Arabic' }; return language.value === 'auto' ? '' : `Please answer in ${names[language.value]}.`; }

async function uploadFile(file) { if (!file) return; uploadStatus.textContent = 'Uploading document…'; fileInput.disabled = true; try { const formData = new FormData(); formData.append('file', file); const res = await fetch('/api/files', { method:'POST', body:formData, headers:{Accept:'application/json'} }); const data = await res.json(); if (!res.ok) throw new Error(data.error || 'Upload failed'); attachedFileId = data.fileId; fileName.textContent = data.name; fileChip.hidden = false; uploadStatus.textContent = 'Document ready'; } catch (error) { attachedFileId = null; fileChip.hidden = true; uploadStatus.textContent = error.message; } finally { fileInput.disabled = false; fileInput.value = ''; } }
async function uploadImage(file) { if (!file) return; uploadStatus.textContent = 'Preparing image…'; imageInput.disabled = true; try { if (!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type)) throw new Error('Please choose PNG, JPG, WEBP, or GIF.'); if (file.size > 10*1024*1024) throw new Error('Image must be 10 MB or smaller.'); const formData = new FormData(); formData.append('image', file); const res = await fetch('/api/images', { method:'POST', body:formData, headers:{Accept:'application/json'} }); const data = await res.json(); if (!res.ok) throw new Error(data.error || 'Image upload failed'); attachedImageData=data.image; imagePreview.src=data.image; imageName.textContent=data.name; imageChip.hidden=false; uploadStatus.textContent='Image ready'; } catch(error) { attachedImageData=null; imageChip.hidden=true; uploadStatus.textContent=error.message; } finally { imageInput.disabled=false; imageInput.value=''; } }

async function toggleRecording() {
  if (mediaRecorder && mediaRecorder.state === 'recording') { mediaRecorder.stop(); return; }
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { voiceStatus.textContent = 'Voice recording is not supported in this browser.'; return; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const preferred = ['audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus'].find(type => MediaRecorder.isTypeSupported(type));
    mediaRecorder = preferred ? new MediaRecorder(stream, { mimeType: preferred }) : new MediaRecorder(stream);
    audioChunks = [];
    mediaRecorder.ondataavailable = event => { if (event.data.size) audioChunks.push(event.data); };
    mediaRecorder.onstop = async () => { stream.getTracks().forEach(track => track.stop()); const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType || 'audio/webm' }); await transcribeAudio(blob); mediaRecorder = null; };
    mediaRecorder.start(); voiceButton.classList.add('recording'); voiceButton.textContent = '⏹️'; voiceStatus.textContent = 'Recording… click again to stop';
  } catch { voiceStatus.textContent = 'Microphone permission was not granted.'; }
}
async function transcribeAudio(blob) {
  voiceButton.disabled = true; voiceStatus.textContent = 'Transcribing…';
  try { const formData = new FormData(); const ext = blob.type.includes('ogg') ? 'ogg' : blob.type.includes('mp4') ? 'm4a' : 'webm'; formData.append('audio', blob, `voice.${ext}`); const res = await fetch('/api/transcribe',{method:'POST',body:formData,headers:{Accept:'application/json'}}); const data=await res.json(); if(!res.ok) throw new Error(data.error || 'Transcription failed'); if(data.text) { input.value = data.text; input.focus(); voiceStatus.textContent='Transcript ready — press Send'; } else voiceStatus.textContent='No speech detected.'; } catch(error) { voiceStatus.textContent=error.message; } finally { voiceButton.disabled=false; voiceButton.classList.remove('recording'); voiceButton.textContent='🎙️'; }
}
async function speak(text) {
  if (!speakAnswer.checked || !text) return;
  try { const res = await fetch('/api/speech',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({text})}); const data=await res.json(); if(!res.ok) throw new Error(data.error || 'Voice response failed'); const audio=new Audio(data.audio); await audio.play(); } catch(error) { console.warn('Speech playback failed:', error.message); }
}

fileInput.addEventListener('change',()=>uploadFile(fileInput.files?.[0])); imageInput.addEventListener('change',()=>uploadImage(imageInput.files?.[0])); voiceButton.addEventListener('click',toggleRecording);
removeFile.addEventListener('click',()=>{attachedFileId=null;fileChip.hidden=true;fileName.textContent='';uploadStatus.textContent='Files up to 10 MB';}); removeImage.addEventListener('click',()=>{attachedImageData=null;imageChip.hidden=true;imagePreview.removeAttribute('src');imageName.textContent='';uploadStatus.textContent='Files up to 10 MB';});

form.addEventListener('submit', async event => {
  event.preventDefault(); const message=input.value.trim(); if(!message || send.disabled) return;
  const attachmentLabel=[attachedFileId?`📎 ${fileName.textContent}`:'',attachedImageData?`🖼️ ${imageName.textContent}`:''].filter(Boolean).join('  '); addMessage('user',attachmentLabel?`${attachmentLabel}\n${message}`:message); input.value=''; send.disabled=true; send.querySelector('span').textContent='Thinking…';
  const requestHistory=[...history]; const languageInstruction=getLanguageInstruction(); const finalMessage=languageInstruction?`${languageInstruction}\n\n${message}`:message; const currentFileId=attachedFileId; const currentImageData=attachedImageData; const useWebSearch=webSearch.checked;
  try { const res=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({message:finalMessage,history:requestHistory,fileId:currentFileId,webSearch:useWebSearch,imageData:currentImageData})}); const data=await res.json(); if(!res.ok) throw new Error(data.error||'Request failed'); addMessage('assistant',data.reply); addSources(data.sources); history.push({role:'user',content:message},{role:'assistant',content:data.reply}); saveHistory(); await speak(data.reply); } catch(error) { addMessage('assistant',`Sorry — ${error.message}`); } finally { send.disabled=false; send.querySelector('span').textContent='Send'; input.focus(); }
});

newChat.addEventListener('click',()=>{history=[];localStorage.removeItem(STORAGE_KEY);attachedFileId=null;attachedImageData=null;fileChip.hidden=true;imageChip.hidden=true;renderHistory();input.focus();}); language.value=localStorage.getItem(LANGUAGE_KEY)||'auto'; language.addEventListener('change',()=>localStorage.setItem(LANGUAGE_KEY,language.value)); webSearch.checked=localStorage.getItem(WEB_SEARCH_KEY)==='true'; webSearch.addEventListener('change',()=>localStorage.setItem(WEB_SEARCH_KEY,String(webSearch.checked))); speakAnswer.checked=localStorage.getItem(SPEAK_KEY)==='true'; speakAnswer.addEventListener('change',()=>localStorage.setItem(SPEAK_KEY,String(speakAnswer.checked))); input.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();form.requestSubmit();}}); renderHistory(); checkHealth();
