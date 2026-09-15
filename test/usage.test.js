import test from 'node:test';
import assert from 'node:assert/strict';
import { usageLimits, usagePeriodStart, usageAllowed, quotaError } from '../usage.js';

test('usage limits use configured positive integer values', () => {
  const previous = {
    chats: process.env.MONTHLY_CHAT_LIMIT,
    input: process.env.MONTHLY_INPUT_CHAR_LIMIT,
    output: process.env.MONTHLY_OUTPUT_CHAR_LIMIT
  };
  process.env.MONTHLY_CHAT_LIMIT = '25.9';
  process.env.MONTHLY_INPUT_CHAR_LIMIT = '5000';
  process.env.MONTHLY_OUTPUT_CHAR_LIMIT = '9000';
  assert.deepEqual(usageLimits(), { chats: 25, inputChars: 5000, outputChars: 9000 });
  if (previous.chats === undefined) delete process.env.MONTHLY_CHAT_LIMIT; else process.env.MONTHLY_CHAT_LIMIT = previous.chats;
  if (previous.input === undefined) delete process.env.MONTHLY_INPUT_CHAR_LIMIT; else process.env.MONTHLY_INPUT_CHAR_LIMIT = previous.input;
  if (previous.output === undefined) delete process.env.MONTHLY_OUTPUT_CHAR_LIMIT; else process.env.MONTHLY_OUTPUT_CHAR_LIMIT = previous.output;
});

test('usage period starts at UTC month boundary', () => {
  const start = usagePeriodStart(new Date('2026-09-15T18:30:00Z'));
  assert.equal(start.toISOString(), '2026-09-01T00:00:00.000Z');
});

test('usage quota allows usage below chat and input limits', () => {
  const usage = {
    used: { chats: 9, inputChars: 90, outputChars: 0 },
    limits: { chats: 10, inputChars: 100, outputChars: 200 }
  };
  assert.equal(usageAllowed(usage, 10), true);
  assert.equal(usageAllowed(usage, 11), false);
});

test('usage quota blocks exhausted chat or input limits', () => {
  const chatLimit = {
    used: { chats: 10, inputChars: 0, outputChars: 0 },
    limits: { chats: 10, inputChars: 100, outputChars: 200 }
  };
  const inputLimit = {
    used: { chats: 1, inputChars: 100, outputChars: 0 },
    limits: { chats: 10, inputChars: 100, outputChars: 200 }
  };
  assert.equal(usageAllowed(chatLimit, 0), false);
  assert.equal(usageAllowed(inputLimit, 1), false);
  assert.equal(quotaError(chatLimit), 'Monthly chat limit reached.');
  assert.equal(quotaError(inputLimit), 'Monthly input usage limit reached.');
});
