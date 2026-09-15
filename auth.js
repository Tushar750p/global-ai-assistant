import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { query } from './db.js';

const scrypt = promisify(crypto.scrypt);
const SESSION_DAYS = 30;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;
const EMAIL_MAX = 254;
const SESSION_BYTES = 32;
const SESSION_COOKIE_NAME = '__Host-session';

export function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

export function validateCredentials(email, password) {
  const normalized = normalizeEmail(email);
  if (normalized.length > EMAIL_MAX || !/^\S+@[^\s@]+\.[^\s@]+$/.test(normalized)) return 'Please provide a valid email address.';
  if (typeof password !== 'string' || password.length < PASSWORD_MIN) return `Password must be at least ${PASSWORD_MIN} characters.`;
  if (password.length > PASSWORD_MAX) return `Password must be ${PASSWORD_MAX} characters or fewer.`;
  return null;
}

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString('base64url')}$${Buffer.from(derived).toString('base64url')}`;
}

export async function verifyPassword(password, encoded) {
  try {
    if (typeof password !== 'string' || typeof encoded !== 'string') return false;
    const [scheme, n, r, p, saltText, hashText] = encoded.split('$');
    if (scheme !== 'scrypt') return false;
    const N = Number(n), R = Number(r), P = Number(p);
    if (N !== 16384 || R !== 8 || P !== 1 || !saltText || !hashText) return false;
    const salt = Buffer.from(saltText, 'base64url');
    const expected = Buffer.from(hashText, 'base64url');
    if (salt.length !== 16 || expected.length !== 64) return false;
    const actual = await scrypt(password, salt, expected.length, { N, r: R, p: P });
    return crypto.timingSafeEqual(Buffer.from(actual), expected);
  } catch { return false; }
}

export function createSessionToken() {
  return crypto.randomBytes(SESSION_BYTES).toString('base64url');
}

export function hashSessionToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

export function sessionCookie(token) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure}`;
}

export function clearSessionCookie() {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export function readSessionToken(req) {
  const header = req.headers.cookie || '';
  const prefix = `${SESSION_COOKIE_NAME}=`;
  const match = header.split(';').map(part => part.trim()).find(part => part.startsWith(prefix));
  if (!match) return null;
  try {
    const token = decodeURIComponent(match.slice(prefix.length));
    return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
  } catch { return null; }
}

export async function cleanupExpiredSessions() {
  await query('DELETE FROM sessions WHERE expires_at <= NOW()');
}

export async function createSession(userId) {
  await cleanupExpiredSessions();
  const token = createSessionToken();
  const tokenHash = hashSessionToken(token);
  await query(`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL '${SESSION_DAYS} days')`, [tokenHash, userId]);
  return token;
}

export async function getSessionUser(req) {
  const token = readSessionToken(req);
  if (!token) return null;
  const { rows } = await query('SELECT u.id, u.email, u.plan FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.expires_at > NOW()', [hashSessionToken(token)]);
  return rows[0] || null;
}

export async function deleteSession(req) {
  const token = readSessionToken(req);
  if (token) await query('DELETE FROM sessions WHERE token_hash = $1', [hashSessionToken(token)]);
}
