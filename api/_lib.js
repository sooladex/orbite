// Outils partagés des fonctions serveur d'Orbite (non exposé : préfixe « _ »).
const crypto = require('crypto');
const { neon } = require('@neondatabase/serverless');

const sql = neon(process.env.DATABASE_URL);
const SITE = (process.env.SITE_URL || 'https://orbite.sooladex.com').replace(/\/$/, '');
const SLUG_RE = /^[a-z0-9][a-z0-9_-]{2,29}$/;
const RESERVED = new Set(['app','api','admin','edit','editer','login','connexion','signup','inscription','compte','account','settings','orbite','www','help','aide','about','terms','privacy','static','assets','media','m','u','new','dashboard','explore']);
const COOKIE = 'orb_s';
const SESSION_DAYS = 60;

// Une image hébergée par Orbite : /m/<uuid>
const MEDIA_RE = /^\/m\/[0-9a-f-]{36}$/;
const okImg = u => (typeof u === 'string' && MEDIA_RE.test(u)) ? u : null;
const absImg = u => okImg(u) ? SITE + u : null;

function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('hex')}$${h.toString('hex')}`;
}
function checkPassword(pw, stored) {
  const [alg, saltHex, hashHex] = String(stored || '').split('$');
  if (alg !== 'scrypt' || !saltHex || !hashHex) return false;
  const h = crypto.scryptSync(pw, Buffer.from(saltHex, 'hex'), 64, { N: 16384, r: 8, p: 1 });
  const ref = Buffer.from(hashHex, 'hex');
  return ref.length === h.length && crypto.timingSafeEqual(ref, h);
}
const sha = t => crypto.createHash('sha256').update(t).digest('hex');

function readCookie(req, name) {
  const m = String(req.headers.cookie || '').split(/;\s*/).find(c => c.startsWith(name + '='));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : null;
}
async function newSession(res, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  await sql`insert into sessions (token_hash, user_id, expires_at) values (${sha(token)}, ${userId}, now() + make_interval(days => ${SESSION_DAYS}))`;
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`);
}
function clearSession(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}
async function currentUser(req) {
  const t = readCookie(req, COOKIE); if (!t) return null;
  const rows = await sql`select u.id, u.email from sessions s join users u on u.id = s.user_id where s.token_hash = ${sha(t)} and s.expires_at > now()`;
  return rows[0] || null;
}

// Adresse publique http(s) d'un site (pas d'adresse locale ou privée), forme normalisée.
function cleanUrl(u) {
  u = String(u || '').trim(); if (!u || u.length > 500) return '';
  if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = 'https://' + u;
  try {
    const p = new URL(u);
    if (!['http:', 'https:'].includes(p.protocol)) return '';
    // pas d'adresses locales ou privées
    if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[)/i.test(p.hostname) || !p.hostname.includes('.')) return '';
    return p.href;
  } catch (e) { return ''; }
}

function slugProblem(s) {
  if (!s) return 'Choisis un pseudo.';
  if (s.length < 3) return '3 caractères minimum.';
  if (!SLUG_RE.test(s)) return 'Lettres minuscules, chiffres, - et _ seulement.';
  if (RESERVED.has(s)) return 'Ce pseudo est réservé par Orbite.';
  return '';
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

module.exports = { cleanUrl, sql, SITE, SLUG_RE, RESERVED, okImg, absImg, hashPassword, checkPassword, sha, readCookie, newSession, clearSession, currentUser, slugProblem, json, COOKIE };
