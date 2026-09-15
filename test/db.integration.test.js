import test from 'node:test';
import assert from 'node:assert/strict';
import { initDb, query } from '../db.js';

test('PostgreSQL schema initializes and preserves ownership/cascade integrity', async () => {
  assert.ok(process.env.DATABASE_URL, 'DATABASE_URL must be configured for the integration test');
  assert.equal(await initDb(), true);

  const email = `ci-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const user = await query(
    'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id',
    [email, 'integration-test-hash']
  );
  const userId = user.rows[0].id;

  const conversation = await query(
    'INSERT INTO conversations (user_id, title) VALUES ($1, $2) RETURNING id',
    [userId, 'Integration test']
  );
  const conversationId = conversation.rows[0].id;

  await query(
    'INSERT INTO chat_messages (user_id, conversation_id, role, content) VALUES ($1, $2, $3, $4)',
    [userId, conversationId, 'user', 'integration test message']
  );

  const counts = await query(
    `SELECT
       (SELECT COUNT(*) FROM conversations WHERE id = $1 AND user_id = $2) AS conversations,
       (SELECT COUNT(*) FROM chat_messages WHERE conversation_id = $1 AND user_id = $2) AS messages`,
    [conversationId, userId]
  );
  assert.equal(Number(counts.rows[0].conversations), 1);
  assert.equal(Number(counts.rows[0].messages), 1);

  await query('DELETE FROM users WHERE id = $1', [userId]);

  const cascaded = await query(
    `SELECT
       (SELECT COUNT(*) FROM conversations WHERE id = $1) AS conversations,
       (SELECT COUNT(*) FROM chat_messages WHERE conversation_id = $1) AS messages`,
    [conversationId]
  );
  assert.equal(Number(cascaded.rows[0].conversations), 0);
  assert.equal(Number(cascaded.rows[0].messages), 0);
});
