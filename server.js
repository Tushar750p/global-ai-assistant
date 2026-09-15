import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import OpenAI from 'openai';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPool, query, initDb } from './db.js';
import { clearSessionCookie, createSession, deleteSession, getSessionUser, hashPassword, sessionCookie, validateCredentials, verifyPassword, normalizeEmail } from './auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = Number(process.env.PORT) || 3000;
const client = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

const MAX_MESSAGE_LENGTH = 8000;
const MAX_HISTORY_ITEMS = 12;
const MAX_HISTORY_ITEM_LENGTH = 8000;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_AUDIO_SIZE = 15 * 1024 * 1024;
const ALLOWED_FILE_TYPES = new Set(['application/pdf', 'text/plain', 'text/csv', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);
const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const ALLOWED_AUDIO_TYPES = new Set(['audio/webm', 'audio/ogg', 'audio/wav', 'audio/mpeg', 'audio/mp4']);
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 30;
const requests = new Map();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_SIZE, files: 1 }, fileFilter: (_req, file, cb) => cb(null, ALLOWED_FILE_TYPES.has(file.mimetype)) });
const imageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_SIZE, files: 1 }, fileFilter: (_req, file, cb) => cb(null, ALLOWED_IMAGE_TYPES.has(file.mimetype)) });
const audioUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_AUDIO_SIZE, files: 1 }, fileFilter: (_req, file, cb) => cb(null, ALLOWED_AUDIO_TYPES.has(file.mimetype)) });

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});

function clientKey(req) { return req.ip || req.socket.remoteAddress || 'unknown'; }
function rateLimit(req, res, next) {
  const now = Date.now(); const key = clientKey(req); const entry = requests.get(key);
  if (!entry || now - entry.start >= RATE_WINDOW_MS) { requests.set(key, { start: now, count: 1 }); return next(); }
  entry.count += 1;
  if (entry.count > RATE_LIMIT) return res.status(429).json({ error: 'Too many requests. Please wait a minute and try again.' });
  next();
}
function extractSources(response) {
  const sources = [];
  for (const item of response.output ?? []) {
    if (item.type !== 'message') continue;
    for (const content of item.content ?? []) {
      if (content.type !== 'output_text') continue;
      for (const annotation of content.annotations ?? []) {
        if (annotation.type !== 'url_citation' || !annotation.url) continue;
        if (!sources.some(source => source.url === annotation.url)) sources.push({ title: annotation.title || annotation.url, url: annotation.url });
      }
    }
  }
  return sources.slice(0, 10);
}
function requireDatabase(res) { if (!getPool()) { res.status(503).json({ error: 'Cloud accounts are not configured yet. Add DATABASE_URL to enable login and cloud history.' }); return false; } return true; }

app.get('/api/health', (_req, res) => res.json({ ok: true, aiConfigured: Boolean(client), databaseConfigured: Boolean(getPool()) }));

app.post('/api/auth/register', rateLimit, async (req, res) => {
  if (!requireDatabase(res)) return;
  const { email, password } = req.body ?? {};
  const error = validateCredentials(email, password);
  if (error) return res.status(400).json({ error });
  const normalized = normalizeEmail(email);
  try {
    const passwordHash = await hashPassword(password);
    const result = await query('INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email', [normalized, passwordHash]);
    const token = await createSession(result.rows[0].id);
    res.setHeader('Set-Cookie', sessionCookie(token));
    res.status(201).json({ user: result.rows[0] });
  } catch (error) {
    if (error?.code === '23505') return res.status(409).json({ error: 'An account with that email already exists.' });
    console.error('Registration failed:', error?.message || error);
    res.status(500).json({ error: 'Could not create the account.' });
  }
});

app.post('/api/auth/login', rateLimit, async (req, res) => {
  if (!requireDatabase(res)) return;
  const { email, password } = req.body ?? {};
  const error = validateCredentials(email, password);
  if (error) return res.status(400).json({ error });
  try {
    const { rows } = await query('SELECT id, email, password_hash FROM users WHERE email = $1', [normalizeEmail(email)]);
    if (!rows[0] || !(await verifyPassword(password, rows[0].password_hash))) return res.status(401).json({ error: 'Invalid email or password.' });
    await query('DELETE FROM sessions WHERE expires_at <= NOW()');
    const token = await createSession(rows[0].id);
    res.setHeader('Set-Cookie', sessionCookie(token));
    res.json({ user: { id: rows[0].id, email: rows[0].email } });
  } catch (error) { console.error('Login failed:', error?.message || error); res.status(500).json({ error: 'Could not sign in.' }); }
});

app.post('/api/auth/logout', rateLimit, async (req, res) => {
  if (getPool()) { try { await deleteSession(req); } catch (error) { console.error('Logout failed:', error?.message || error); } }
  res.setHeader('Set-Cookie', clearSessionCookie());
  res.json({ ok: true });
});

app.get('/api/auth/me', async (req, res) => {
  if (!getPool()) return res.json({ authenticated: false, databaseConfigured: false });
  try { const user = await getSessionUser(req); res.json({ authenticated: Boolean(user), user }); }
  catch (error) { console.error('Session lookup failed:', error?.message || error); res.status(500).json({ error: 'Could not check the session.' }); }
});

app.get('/api/history', async (req, res) => {
  if (!requireDatabase(res)) return;
  try {
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Please sign in to access cloud history.' });
    const { rows } = await query('SELECT role, content, created_at FROM chat_messages WHERE user_id = $1 ORDER BY created_at ASC LIMIT 200', [user.id]);
    res.json({ history: rows.map(row => ({ role: row.role, content: row.content })) });
  } catch (error) { console.error('History load failed:', error?.message || error); res.status(500).json({ error: 'Could not load cloud history.' }); }
});

app.post('/api/history', async (req, res) => {
  if (!requireDatabase(res)) return;
  try {
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Please sign in to save cloud history.' });
    const { messages } = req.body ?? {};
    if (!Array.isArray(messages) || messages.length > 20) return res.status(400).json({ error: 'Invalid history payload.' });
    for (const item of messages) {
      if (!item || !['user', 'assistant'].includes(item.role) || typeof item.content !== 'string' || !item.content.trim() || item.content.length > MAX_HISTORY_ITEM_LENGTH) return res.status(400).json({ error: 'Invalid history message.' });
      await query('INSERT INTO chat_messages (user_id, role, content) VALUES ($1, $2, $3)', [user.id, item.role, item.content.trim()]);
    }
    res.status(201).json({ ok: true });
  } catch (error) { console.error('History save failed:', error?.message || error); res.status(500).json({ error: 'Could not save cloud history.' }); }
});

app.post('/api/files', rateLimit, upload.single('file'), async (req, res) => {
  if (!client) return res.status(503).json({ error: 'AI is not configured yet.' });
  if (!req.file) return res.status(400).json({ error: 'Please upload a supported file: PDF, TXT, CSV, DOCX, or XLSX.' });
  try { const file = await client.files.create({ file: new File([req.file.buffer], req.file.originalname, { type: req.file.mimetype }), purpose: 'user_data' }); res.json({ fileId: file.id, name: req.file.originalname, size: req.file.size, type: req.file.mimetype }); }
  catch (error) { console.error('File upload failed:', error?.message || error); res.status(502).json({ error: 'The AI service could not process this file.' }); }
});

app.post('/api/images', rateLimit, imageUpload.single('image'), async (req, res) => {
  if (!client) return res.status(503).json({ error: 'AI is not configured yet.' });
  if (!req.file) return res.status(400).json({ error: 'Please upload a supported image: PNG, JPG, WEBP, or GIF.' });
  const dataUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
  res.json({ image: dataUrl, name: req.file.originalname, size: req.file.size, type: req.file.mimetype });
});

app.post('/api/transcribe', rateLimit, audioUpload.single('audio'), async (req, res) => {
  if (!client) return res.status(503).json({ error: 'AI is not configured yet.' });
  if (!req.file) return res.status(400).json({ error: 'Please provide a supported audio recording.' });
  try { const result = await client.audio.transcriptions.create({ file: new File([req.file.buffer], req.file.originalname || 'voice.webm', { type: req.file.mimetype }), model: process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-transcribe' }); res.json({ text: result.text || '' }); }
  catch (error) { console.error('Transcription failed:', error?.message || error); res.status(502).json({ error: 'Speech could not be transcribed.' }); }
});

app.post('/api/speech', rateLimit, async (req, res) => {
  const { text } = req.body ?? {};
  if (typeof text !== 'string' || !text.trim()) return res.status(400).json({ error: 'Please provide text.' });
  if (text.length > 8000) return res.status(413).json({ error: 'Text is too long for speech generation.' });
  if (!client) return res.status(503).json({ error: 'AI is not configured yet.' });
  try { const speech = await client.audio.speech.create({ model: process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts', voice: process.env.OPENAI_TTS_VOICE || 'coral', input: text, response_format: 'mp3' }); const buffer = Buffer.from(await speech.arrayBuffer()); res.json({ audio: `data:audio/mpeg;base64,${buffer.toString('base64')}` }); }
  catch (error) { console.error('Speech generation failed:', error?.message || error); res.status(502).json({ error: 'Voice response could not be generated.' }); }
});

app.post('/api/chat', rateLimit, async (req, res) => {
  const { message, history = [], fileId = null, webSearch = false, imageData = null } = req.body ?? {};
  if (typeof message !== 'string' || !message.trim()) return res.status(400).json({ error: 'Please provide a message.' });
  const cleanMessage = message.trim();
  if (cleanMessage.length > MAX_MESSAGE_LENGTH) return res.status(413).json({ error: `Message is too long. Maximum is ${MAX_MESSAGE_LENGTH} characters.` });
  if (fileId !== null && (typeof fileId !== 'string' || !/^file-[A-Za-z0-9_-]+$/.test(fileId))) return res.status(400).json({ error: 'Invalid file reference.' });
  if (typeof webSearch !== 'boolean') return res.status(400).json({ error: 'Invalid web search setting.' });
  if (imageData !== null && (typeof imageData !== 'string' || !/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(imageData) || imageData.length > 14 * 1024 * 1024)) return res.status(400).json({ error: 'Invalid or oversized image.' });
  if (!client) return res.status(503).json({ error: 'AI is not configured yet.' });
  const safeHistory = Array.isArray(history) ? history.slice(-MAX_HISTORY_ITEMS).filter(item => item && ['user', 'assistant'].includes(item.role) && typeof item.content === 'string' && item.content.trim() && item.content.length <= MAX_HISTORY_ITEM_LENGTH).map(item => ({ role: item.role, content: item.content.trim() })) : [];
  try {
    const content = [...(imageData ? [{ type: 'input_image', image_url: imageData, detail: 'auto' }] : []), ...(fileId ? [{ type: 'input_file', file_id: fileId }] : []), { type: 'input_text', text: cleanMessage }];
    const response = await client.responses.create({ model: process.env.OPENAI_MODEL || 'gpt-5.6-luna', instructions: 'You are Global AI Assistant, a helpful multilingual AI assistant. Reply in the language the user uses unless they ask for another language. If a document or image is attached, analyze it when relevant and clearly distinguish what is visible or supported by the attachment from assumptions. When web search is enabled, use current web information when useful, prefer authoritative sources, and make it clear which claims depend on web sources. Be clear, practical, and honest about uncertainty.', input: [...safeHistory, { role: 'user', content }], ...(webSearch ? { tools: [{ type: 'web_search' }] } : {}) });
    const reply = response.output_text || 'I could not generate a response.';
    let cloudSaved = false;
    if (getPool()) {
      try {
        const user = await getSessionUser(req);
        if (user) { await query('INSERT INTO chat_messages (user_id, role, content) VALUES ($1, $2, $3), ($1, $4, $5)', [user.id, 'user', cleanMessage, 'assistant', reply]); cloudSaved = true; }
      } catch (historyError) { console.error('Automatic history save failed:', historyError?.message || historyError); }
    }
    res.json({ reply, sources: webSearch ? extractSources(response) : [], cloudSaved });
  } catch (error) { console.error('OpenAI request failed:', error?.message || error); res.status(502).json({ error: 'The AI service could not complete the request. Please try again.' }); }
});

app.use(express.static(path.join(__dirname, 'public')));
app.get(/.*/, (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

async function start() {
  try { await initDb(); if (getPool()) console.log('PostgreSQL database initialized.'); }
  catch (error) { console.error('Database initialization failed:', error?.message || error); }
  app.listen(port, () => console.log(`Global AI Assistant running on http://localhost:${port}`));
}
start();
