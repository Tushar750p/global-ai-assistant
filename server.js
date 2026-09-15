import 'dotenv/config';
import express from 'express';
import OpenAI from 'openai';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = process.env.PORT || 3000;
const client = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (_req, res) => res.json({ ok: true, aiConfigured: Boolean(client) }));

app.post('/api/chat', async (req, res) => {
  const { message, history = [] } = req.body ?? {};
  if (!message || typeof message !== 'string') return res.status(400).json({ error: 'Please provide a message.' });
  if (!client) return res.status(503).json({ error: 'AI is not configured yet. Add OPENAI_API_KEY to your .env file.' });

  try {
    const safeHistory = Array.isArray(history)
      ? history.slice(-12).filter(item => item && ['user', 'assistant'].includes(item.role))
      : [];
    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || 'gpt-5-mini',
      instructions: 'You are Global AI Assistant, a helpful multilingual AI assistant. Reply in the language the user uses unless they ask for another language. Be clear, practical, and honest about uncertainty.',
      input: [...safeHistory.map(item => ({ role: item.role, content: item.content })), { role: 'user', content: message }]
    });
    res.json({ reply: response.output_text || 'I could not generate a response.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'AI request failed. Please try again.' });
  }
});

app.get(/.*/, (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(port, () => console.log(`Global AI Assistant running on http://localhost:${port}`));
