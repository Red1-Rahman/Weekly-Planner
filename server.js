import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { db, initDb } from './db.js';
import { nowInTz, isValidTz } from './public/js/schedule.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROUTINE_PATH = path.join(__dirname, 'weekly_routine.yaml');
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// Owner password comes from Render's environment, never from the repo.
const OWNER_PASSWORD = process.env.OWNER_PASSWORD || '';
const OWNER_NAME = 'Redwan';
if (!OWNER_PASSWORD) {
  console.warn('OWNER_PASSWORD is not set: owner login is disabled, guests can only view.');
}

// Session tokens live in memory. A restart logs the owner out; that is fine for one user.
const sessions = new Map(); // token -> expiresAt (ms)
const SESSION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const app = express();
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const bad = (res, msg) => res.status(400).json({ error: msg });
const wrap = (fn) => (req, res) =>
  fn(req, res).catch((err) => {
    console.error(err);
    res.status(500).json({ error: 'Internal error' });
  });

// Constant-time comparison of two strings (hashing first so lengths don't leak).
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function isAdmin(req) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const exp = sessions.get(token);
  if (!exp) return false;
  if (Date.now() > exp) {
    sessions.delete(token);
    return false;
  }
  return true;
}

// Write routes require a valid owner session. Guests get 401.
function requireAdmin(req, res, next) {
  if (!OWNER_PASSWORD) return res.status(503).json({ error: 'Owner login is not configured' });
  if (!isAdmin(req)) return res.status(401).json({ error: 'Owner login required' });
  next();
}

async function loadRoutine() {
  const text = await fs.readFile(ROUTINE_PATH, 'utf8');
  const data = parseYaml(text) ?? {};
  return {
    timezone: data.timezone ?? 'auto',
    anchors: data.anchors ?? {},
    days: data.days ?? {},
  };
}

const mapTask = (r) => ({
  id: Number(r.id),
  date: r.date,
  time: r.time,
  title: r.title,
  done: Boolean(r.done),
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// ---- auth -----------------------------------------------------------------

// Guests are the default: no session means read-only.
app.get('/api/auth/status', (req, res) => {
  const owner = isAdmin(req);
  res.json({
    role: owner ? 'owner' : 'guest',
    name: owner ? OWNER_NAME : null,
    owner_login_enabled: Boolean(OWNER_PASSWORD),
  });
});

app.post('/api/auth/login', wrap(async (req, res) => {
  if (!OWNER_PASSWORD) return res.status(503).json({ error: 'Owner login is not configured' });
  const { password } = req.body ?? {};
  if (typeof password !== 'string' || !safeEqual(password, OWNER_PASSWORD)) {
    await new Promise((r) => setTimeout(r, 500)); // slows down guessing
    return res.status(401).json({ error: 'Wrong password' });
  }
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + SESSION_MS);
  res.json({ token, role: 'owner', name: OWNER_NAME, expires_in: SESSION_MS / 1000 });
}));

app.post('/api/auth/logout', (req, res) => {
  const token = (req.get('authorization') || '').replace(/^Bearer /, '');
  sessions.delete(token);
  res.json({ ok: true, role: 'guest' });
});

// ---- routine (public) -----------------------------------------------------

app.get('/api/routine', wrap(async (_req, res) => {
  res.json(await loadRoutine());
}));

// ---- tasks ----------------------------------------------------------------

// Guests and owner can read.
app.get('/api/tasks', wrap(async (req, res) => {
  const { date } = req.query;
  if (!DATE_RE.test(date ?? '')) return bad(res, 'date must be YYYY-MM-DD');
  const { rows } = await db.execute({
    sql: 'SELECT id, date, time, title, done FROM tasks WHERE date = ? ORDER BY time, id',
    args: [date],
  });
  res.json({ tasks: rows.map(mapTask) });
}));

// Owner only.
app.post('/api/tasks', requireAdmin, wrap(async (req, res) => {
  const { date, time, title, tz } = req.body ?? {};
  if (!isValidTz(tz)) return bad(res, 'Invalid timezone');
  if (typeof title !== 'string' || !title.trim() || title.trim().length > 200)
    return bad(res, 'Title must be 1-200 characters');
  if (!DATE_RE.test(date ?? '') || !TIME_RE.test(time ?? ''))
    return bad(res, 'date and time are required');

  const now = nowInTz(tz);
  if (date !== now.date) return bad(res, 'Tasks can only be created for today');
  if (time < now.time) return bad(res, 'That time has already passed');

  const { rows } = await db.execute({
    sql: 'INSERT INTO tasks (date, time, title) VALUES (?, ?, ?) RETURNING id, date, time, title, done',
    args: [date, time, title.trim()],
  });
  res.status(201).json(mapTask(rows[0]));
}));

app.patch('/api/tasks/:id', requireAdmin, wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return bad(res, 'Invalid id');
  if (typeof req.body?.done !== 'boolean') return bad(res, 'done must be boolean');
  const { rows } = await db.execute({
    sql: 'UPDATE tasks SET done = ? WHERE id = ? RETURNING id, date, time, title, done',
    args: [req.body.done ? 1 : 0, id],
  });
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(mapTask(rows[0]));
}));

app.delete('/api/tasks/:id', requireAdmin, wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return bad(res, 'Invalid id');
  const { rowsAffected } = await db.execute({
    sql: 'DELETE FROM tasks WHERE id = ?',
    args: [id],
  });
  if (!rowsAffected) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
}));

// ---- routine block completions -------------------------------------------

// Guests and owner can read.
app.get('/api/completions', wrap(async (req, res) => {
  const { date } = req.query;
  if (!DATE_RE.test(date ?? '')) return bad(res, 'date must be YYYY-MM-DD');
  const { rows } = await db.execute({
    sql: 'SELECT block_key FROM block_completions WHERE date = ? AND done = 1',
    args: [date],
  });
  res.json({ completions: rows.map((r) => ({ block_key: r.block_key })) });
}));

// Owner only.
app.put('/api/completions', requireAdmin, wrap(async (req, res) => {
  const { date, block_key, done } = req.body ?? {};
  if (!DATE_RE.test(date ?? '')) return bad(res, 'date must be YYYY-MM-DD');
  if (typeof block_key !== 'string' || !block_key || block_key.length > 300)
    return bad(res, 'block_key is required (max 300 chars)');
  if (typeof done !== 'boolean') return bad(res, 'done must be boolean');

  await db.execute({
    sql: `INSERT INTO block_completions (date, block_key, done) VALUES (?, ?, ?)
          ON CONFLICT (date, block_key) DO UPDATE SET done = excluded.done`,
    args: [date, block_key, done ? 1 : 0],
  });
  res.json({ date, block_key, done });
}));

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

await initDb();
const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`Routine tracker running on http://localhost:${port}`));