import { query } from './db.js';
import { saveMemory } from './memory.js';

const DEFAULT_MODEL = process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-2';
const DEFAULT_DIMENSIONS = Math.min(3072, Math.max(768, Number(process.env.GEMINI_EMBEDDING_DIMENSIONS) || 768));
const DEFAULT_LIMIT = 8;
const MAX_TEXT = 2000;
let schemaReady = false;

function clean(value, max = MAX_TEXT) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}
function validUserId(userId) {
  return Number.isSafeInteger(Number(userId)) && Number(userId) > 0;
}

export async function ensureSemanticMemorySchema() {
  if (schemaReady) return;
  await query(`
    CREATE TABLE IF NOT EXISTS user_memory_embeddings (
      memory_id BIGINT PRIMARY KEY REFERENCES user_memories(id) ON DELETE CASCADE,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      embedding JSONB NOT NULL,
      model TEXT NOT NULL,
      dimensions INTEGER NOT NULL CHECK(dimensions > 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS user_memory_embeddings_user_idx ON user_memory_embeddings(user_id);
  `);
  schemaReady = true;
}

export async function embedText(text, options = {}) {
  const value = clean(text);
  if (!value) throw new Error('Text is required for embedding.');
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error('Gemini API key is not configured.');
  const model = clean(options.model || DEFAULT_MODEL, 128) || DEFAULT_MODEL;
  const dimensions = Math.min(3072, Math.max(1, Number(options.dimensions) || DEFAULT_DIMENSIONS));
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:embedContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({ model: `models/${model}`, content: { parts: [{ text: value }] }, output_dimensionality: dimensions }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Gemini embedding ${response.status}: ${body.slice(0, 300)}`);
  }
  const data = await response.json();
  const values = data?.embedding?.values || data?.embeddings?.[0]?.values;
  if (!Array.isArray(values) || !values.length || values.some(v => !Number.isFinite(Number(v)))) throw new Error('Gemini returned an invalid embedding.');
  return values.map(Number);
}

export function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || !a.length) return 0;
  let dot = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i += 1) {
    const x = Number(a[i]), y = Number(b[i]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return 0;
    dot += x * y; aa += x * x; bb += y * y;
  }
  if (!aa || !bb) return 0;
  return dot / (Math.sqrt(aa) * Math.sqrt(bb));
}

export async function saveMemoryEmbedding(memoryId, userId, embedding, options = {}) {
  if (!validUserId(userId) || !Number.isSafeInteger(Number(memoryId)) || Number(memoryId) < 1) throw new Error('Invalid memory reference.');
  if (!Array.isArray(embedding) || !embedding.length) throw new Error('Embedding is required.');
  await ensureSemanticMemorySchema();
  const model = clean(options.model || DEFAULT_MODEL, 128) || DEFAULT_MODEL;
  const result = await query(`
    INSERT INTO user_memory_embeddings(memory_id,user_id,embedding,model,dimensions)
    VALUES($1,$2,$3::jsonb,$4,$5)
    ON CONFLICT(memory_id) DO UPDATE SET user_id=EXCLUDED.user_id,embedding=EXCLUDED.embedding,model=EXCLUDED.model,dimensions=EXCLUDED.dimensions,updated_at=NOW()
    RETURNING memory_id,user_id,model,dimensions,updated_at
  `, [memoryId, userId, JSON.stringify(embedding), model, embedding.length]);
  return result.rows[0];
}

export async function indexMemory(memory) {
  if (!memory || !validUserId(memory.user_id) || !Number.isSafeInteger(Number(memory.id))) throw new Error('Invalid memory.');
  const embedding = await embedText(memory.content);
  await saveMemoryEmbedding(memory.id, memory.user_id, embedding);
  return { ...memory, embeddingIndexed: true };
}

export async function indexUnindexedMemories(userId, limit = 20) {
  if (!validUserId(userId)) return 0;
  await ensureSemanticMemorySchema();
  const result = await query(`
    SELECT m.id,m.user_id,m.content,m.category,m.importance,m.created_at,m.updated_at
    FROM user_memories m
    LEFT JOIN user_memory_embeddings e ON e.memory_id=m.id
    WHERE m.user_id=$1 AND e.memory_id IS NULL
    ORDER BY m.updated_at DESC LIMIT $2
  `, [userId, Math.min(50, Math.max(1, Number(limit) || 20))]);
  let count = 0;
  for (const memory of result.rows) {
    try { await indexMemory(memory); count += 1; } catch (error) { console.warn('Memory indexing failed:', error?.message || error); }
  }
  return count;
}

export async function semanticSearchMemories(userId, queryText, limit = DEFAULT_LIMIT, minScore = 0.45) {
  if (!validUserId(userId)) throw new Error('Invalid user id.');
  const text = clean(queryText);
  if (!text) return [];
  await ensureSemanticMemorySchema();
  const safeLimit = Math.min(50, Math.max(1, Number(limit) || DEFAULT_LIMIT));
  const threshold = Math.min(1, Math.max(-1, Number(minScore) || 0.45));
  const queryEmbedding = await embedText(text);
  const result = await query(`
    SELECT m.id,m.user_id,m.content,m.category,m.importance,m.created_at,m.updated_at,e.embedding
    FROM user_memories m INNER JOIN user_memory_embeddings e ON e.memory_id=m.id
    WHERE m.user_id=$1 AND e.user_id=$1 ORDER BY m.updated_at DESC LIMIT 500
  `, [userId]);
  return result.rows.map(row => ({ ...row, score: cosineSimilarity(queryEmbedding, row.embedding) }))
    .filter(row => row.score >= threshold)
    .sort((a, b) => b.score - a.score || Number(b.importance) - Number(a.importance))
    .slice(0, safeLimit)
    .map(({ embedding, ...memory }) => memory);
}

export async function buildSemanticMemoryContext(userId, queryText, limit = DEFAULT_LIMIT) {
  try {
    await indexUnindexedMemories(userId);
    const memories = await semanticSearchMemories(userId, queryText, limit);
    if (!memories.length) return '';
    return memories.map((m, i) => `[Semantic Memory ${i + 1} | ${m.category} | similarity ${Number(m.score).toFixed(3)} | importance ${Number(m.importance).toFixed(2)}] ${m.content}`).join('\n');
  } catch (error) {
    console.warn('Semantic memory unavailable:', error?.message || error);
    return '';
  }
}

function parseMemoryCandidates(text) {
  if (typeof text !== 'string') return [];
  const cleaned = text.replace(/```json|```/g, '').trim();
  try {
    const parsed = JSON.parse(cleaned);
    const items = Array.isArray(parsed) ? parsed : parsed?.memories;
    if (!Array.isArray(items)) return [];
    return items.map(item => ({ content: clean(item?.content), category: clean(item?.category || 'general', 64), importance: Number(item?.importance ?? 0.6) }))
      .filter(item => item.content && item.importance >= 0.6)
      .slice(0, 5);
  } catch { return []; }
}

export async function extractAndSaveMemories(userId, text) {
  if (!validUserId(userId) || !clean(text)) return 0;
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) return 0;
  try {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        model: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
        store: false,
        system_instruction: 'Extract only stable, useful user preferences, goals, recurring projects, or explicit long-term facts. Never infer sensitive traits. Ignore transient requests and ordinary conversation. Return JSON only: {"memories":[{"content":"...","category":"...","importance":0.0}]} and return an empty list when nothing should be remembered.',
        input: `User message:\n${clean(text)}`,
      }),
    });
    if (!response.ok) return 0;
    const data = await response.json();
    const raw = data?.output_text || data?.steps?.filter(s => s.type === 'model_output').flatMap(s => s.content || []).map(x => x.text).filter(Boolean).join('');
    const candidates = parseMemoryCandidates(raw);
    let saved = 0;
    for (const candidate of candidates) {
      const duplicate = await query('SELECT id FROM user_memories WHERE user_id=$1 AND lower(content)=lower($2) LIMIT 1', [userId, candidate.content]);
      if (duplicate.rows[0]) continue;
      const memory = await saveMemory(userId, candidate);
      try { await indexMemory(memory); } catch (error) { console.warn('New memory embedding failed:', error?.message || error); }
      saved += 1;
    }
    return saved;
  } catch (error) {
    console.warn('Memory extraction unavailable:', error?.message || error);
    return 0;
  }
}

export const _test = { clean, validUserId, cosineSimilarity, parseMemoryCandidates };
