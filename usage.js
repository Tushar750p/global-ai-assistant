import { query } from './db.js';

const DEFAULT_CHAT_LIMIT = 100;
const DEFAULT_INPUT_CHAR_LIMIT = 800000;
const DEFAULT_OUTPUT_CHAR_LIMIT = 1200000;

function positiveLimit(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function usageLimits() {
  return {
    chats: positiveLimit(process.env.MONTHLY_CHAT_LIMIT, DEFAULT_CHAT_LIMIT),
    inputChars: positiveLimit(process.env.MONTHLY_INPUT_CHAR_LIMIT, DEFAULT_INPUT_CHAR_LIMIT),
    outputChars: positiveLimit(process.env.MONTHLY_OUTPUT_CHAR_LIMIT, DEFAULT_OUTPUT_CHAR_LIMIT)
  };
}

export function usagePeriodStart(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export async function getUsage(userId) {
  const limits = usageLimits();
  const period = usagePeriodStart();
  const result = await query(
    `SELECT chats, input_chars, output_chars, period_start
       FROM usage_monthly WHERE user_id = $1 AND period_start = $2`,
    [userId, period]
  );
  const row = result.rows[0] || { chats: 0, input_chars: 0, output_chars: 0, period_start: period };
  const used = { chats: Number(row.chats), inputChars: Number(row.input_chars), outputChars: Number(row.output_chars) };
  return {
    periodStart: new Date(row.period_start).toISOString().slice(0, 10),
    used,
    limits,
    remaining: {
      chats: Math.max(0, limits.chats - used.chats),
      inputChars: Math.max(0, limits.inputChars - used.inputChars),
      outputChars: Math.max(0, limits.outputChars - used.outputChars)
    }
  };
}

export function usageAllowed(usage, inputChars = 0) {
  const input = Math.max(0, Number(inputChars) || 0);
  return usage.used.chats < usage.limits.chats &&
    usage.used.inputChars + input <= usage.limits.inputChars;
}

export function quotaError(usage) {
  if (usage.used.chats >= usage.limits.chats) return 'Monthly chat limit reached.';
  if (usage.used.inputChars >= usage.limits.inputChars) return 'Monthly input usage limit reached.';
  return 'Monthly usage limit reached.';
}

export async function recordUsage(userId, inputChars, outputChars) {
  const period = usagePeriodStart();
  await query(
    `INSERT INTO usage_monthly (user_id, period_start, chats, input_chars, output_chars)
     VALUES ($1, $2, 1, $3, $4)
     ON CONFLICT (user_id, period_start) DO UPDATE SET
       chats = usage_monthly.chats + 1,
       input_chars = usage_monthly.input_chars + EXCLUDED.input_chars,
       output_chars = usage_monthly.output_chars + EXCLUDED.output_chars`,
    [userId, period, Math.max(0, Number(inputChars) || 0), Math.max(0, Number(outputChars) || 0)]
  );
}
