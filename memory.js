import { query } from './db.js';

const MAX_MEMORY_LENGTH = 2000;
const DEFAULT_LIMIT = 20;

function clean(value) {
  return typeof value === 'string' ? value.trim().slice(0, MAX_MEMORY_LENGTH) : '';
}

export function normalizeMemory(input = {}) {
  const content = clean(input.content);
  const category = clean(input.category || 'general').toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 64) || 'general';
  const importance = Math.min(1, Math.max(0, Number(input.importance ?? 0.6) || 0.6));
  return { content, category, importance };
}

export async function saveMemory(userId, input) {
  if (!Number.isSafeInteger(Number(userId))) throw new Error('Invalid user id.');
  const memory = normalizeMemory(input);
  if (!memory.content) throw new Error('Memory content is required.');
  const result = await query(`
    INSERT INTO user_memories(user_id, content, category, importance)
    VALUES($1,$2,$3,$4)
    RETURNING id, content, category, importance, created_at, updated_at
  `, [userId, memory.content, memory.category, memory.importance]);
  return result.rows[0];
}

export async function listMemories(userId, limit = DEFAULT_LIMIT) {
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || DEFAULT_LIMIT));
  const result = await query(`
    SELECT id, content, category, importance, created_at, updated_at
    FROM user_memories
    WHERE user_id=$1
    ORDER BY importance DESC, updated_at DESC
    LIMIT $2
  `, [userId, safeLimit]);
  return result.rows;
}

export async function deleteMemory(userId, memoryId) {
  const result = await query('DELETE FROM user_memories WHERE id=$1 AND user_id=$2', [memoryId, userId]);
  return result.rowCount > 0;
}

export async function buildMemoryContext(userId, limit = 12) {
  const memories = await listMemories(userId, limit);
  if (!memories.length) return '';
  return memories.map((m, i) => `[Memory ${i + 1} | ${m.category} | importance ${Number(m.importance).toFixed(2)}] ${m.content}`).join('\n');
}

export const _test = { clean, normalizeMemory };
