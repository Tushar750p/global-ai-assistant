import 'dotenv/config';
import express from 'express';
import OpenAI from 'openai';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = Number(process.env.PORT) || 3000;
const client = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

const MAX_MESSAGE_LENGTH = 8000;
const MAX_HISTORY_ITEMS = 12;
const MAX_HISTORY_ITEM_LENGTH = 8000;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 30;
const requests = new Map();

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

function clientKey(req) {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function rateLimit(req, res, next) {
  const now = Date.now();
  const key = clientKey(req);
  const entry = requests.get(key);

  if (!entry || now - entry.start >= RATE_WINDOW_MS) {
    requests.set(key, { start: now, count: 1 });
    return next();
  }

  entry.count += 1;
  if (entry.count > RATE_LIMIT) {
    return res.status(429).json({ error: 'Too many requests. Please wait a minute and try again.' });
  }
  next();
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, aiConfigured: Boolean(client) });
});

app.post('/api/chat', rateLimit, async (req, res) => {
  const { message, history = [] } = req.body ?? {};

  if (typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'Please provide a message.' });
  }

  const cleanMessage = message.trim();
  if (cleanMessage.length > MAX_MESSAGE_LENGTH) {
    return res.status(413).json({ error: `Message is too long. Maximum is ${MAX_MESSAGE_LENGTH} characters.` });
  }

  if (!client) {
    return res.status(503).json({ error: 'AI is not configured yet.' });
  }

  const safeHistory = Array.isArray(history)
    ? history
        .slice(-MAX_HISTORY_ITEMS)
        .filter(item =>
          item &&
          ['user', 'assistant'].includes(item.role) &&
          typeof item.content === 'string' &&
          item.content.trim() &&
          item.content.length <= MAX_HISTORY_ITEM_LENGTH
        )
        .map(item => ({ role: item.role, content: item.content.trim() }))
    : [];

  try {
    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || 'gpt-5.6-luna',
      instructions: 'You are Global AI Assistant, a helpful multilingual AI assistant. Reply in the language the user uses unless they ask for another language. Be clear, practical, and honest about uncertainty.',
      input: [...safeHistory, { role: 'user', content: cleanMessage }]
    });

    res.json({ reply: response.output_text || 'I could not generate a response.' });
  } catch (error) {
    console.error('OpenAI request failed:', error?.message || error);
    res.status(502).json({ error: 'The AI service could not complete the request. Please try again.' });
  }
});

app.get(/.*/, (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(port, () => console.log(`Global AI Assistant running on http://localhost:${port}`));
