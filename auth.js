import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { query } from './db.js';

const scrypt = promisify(crypto.scrypt);
const SESSION_DAYS = 30;
const PASSWORD_MIN = 8;

export function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

export function validateCredentials(email, password) {
  const normalized = normalizeEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return 'Please provide a valid email address.';
  if (typeof password !== 'string' || password.length < PASSWORD_MIN) return `Password must be at least ${PASSWORD_MIN} characters.`;
  if (password.length > 128) return 'Password must be 128 characters or fewer.';
  return null;
}

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString('base64url')}$${Buffer.from(derived).toString('base64url')}`;
}

export async function verifyPassword(password, encoded) {
  try {
    const [scheme, n, r, p, saltText, hashText] = String(encoded).split('$');
    if (scheme !== 'scrypt') return false;
    const N = Number(n), R = Number(r), P = Number(p);
    if (N !== 16384 || R !== 8 || P !== 1 || !saltText || !hashText) return false;
    const expected = Buffer.from(hashText, 'base64url');
    if (expected.length !== 64) return false;
    const actual = await scrypt(password, Buffer.from(saltText, 'base64url'), expected.length, { N, r: R, p: P });
    return crypto.timingSafeEqual(Buffer.from(actual), expected);
  } catch { return false; }
}

export function createSessionToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashSessionToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function sessionCookie(token) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure}`;
}

export function clearSessionCookie() {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export function readSessionToken(req) {
  const header = req.headers.cookie || '';
  const match = header.split(';').map(part => part.trim()).find(part => part.startsWith('session='));
  if (!match) return null;
  try { return decodeURIComponent(match.slice(8)); } catch { return null; }
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
  const { rows } = await query(`SELECT u.id, u.email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.expires_at > NOW()`, [hashSessionToken(token)]);
  return rows[0] || null;
}

export async function deleteSession(req) {
  const token = readSessionToken(req);
  if (token) await query('DELETE FROM sessions WHERE token_hash = $1', [hashSessionToken(token)]);
}
