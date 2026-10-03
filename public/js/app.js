import { resolveTimezone, tzLabel, nowInTz, blocksForDay } from './schedule.js';

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const fmtMin = (m) => `${pad(Math.floor(m / 60))}:${pad(Math.floor(m % 60))}`;
const formatHMS = (sec) => `${pad(Math.floor(sec / 3600))}:${pad(Math.floor((sec % 3600) / 60))}:${pad(sec % 60)}`;
const clamp = (x) => Math.min(1, Math.max(0, x));
const RING_C = 2 * Math.PI * 54;
const TOKEN_KEY = 'ownerToken';
const FORK_DISMISS_KEY = 'forkBannerDismissed';

const state = {
  routine: null,
  tz: '',
  today: '',
  weekday: '',
  blocks: [],
  completions: new Set(),
  tasks: [],
  nowMin: 0,
  lastMinute: '',
  admin: false,
  ownerLoginEnabled: true,
};

// ---- api ------------------------------------------------------------------

async function api(path, { method = 'GET', body } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));

  if (res.status === 401 && state.admin) {
    // Session expired or server restarted: fall back to guest view.
    localStorage.removeItem(TOKEN_KEY);
    setAdmin(false);
    showBanner('Session ended. You are now viewing as guest.');
  }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function showBanner(msg) {
  const b = $('#banner');
  b.textContent = msg;
  b.classList.remove('hidden');
  clearTimeout(showBanner.timer);
  showBanner.timer = setTimeout(() => b.classList.add('hidden'), 4000);
}

// ---- fork banner ----------------------------------------------------------

function setupForkBanner() {
  const banner = $('#fork-banner');
  if (localStorage.getItem(FORK_DISMISS_KEY) === 'yes') return;
  banner.classList.remove('hidden');
  $('#fork-dismiss').addEventListener('click', () => {
    localStorage.setItem(FORK_DISMISS_KEY, 'yes');
    banner.classList.add('hidden');
  });
}

// ---- auth -----------------------------------------------------------------

function setAdmin(on, name = null) {
  state.admin = on;
  const badge = $('#role-badge');
  badge.textContent = on ? name || 'Redwan' : 'Guest';
  badge.className = `rounded-full px-3 py-1 text-sm ${on ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'}`;
  $('#logout-btn').classList.toggle('hidden', !on);
  $('#login-toggle').classList.toggle('hidden', on);
  $('#login-panel').classList.add('hidden');
  $('#readonly-note').classList.toggle('hidden', on || !state.ownerLoginEnabled);
  $('#task-form').querySelectorAll('input, select, button').forEach((el) => (el.disabled = !on));
  renderRoutine();
  renderTasks();
}

async function initAuth() {
  const status = await api('/api/auth/status');
  state.ownerLoginEnabled = status.owner_login_enabled;
  setAdmin(status.role === 'owner', status.name);
  if (status.role !== 'owner') localStorage.removeItem(TOKEN_KEY);
}

async function onLogin(e) {
  e.preventDefault();
  const err = $('#login-error');
  err.textContent = '';
  try {
    const { token, name } = await api('/api/auth/login', {
      method: 'POST',
      body: { password: $('#login-password').value },
    });
    localStorage.setItem(TOKEN_KEY, token);
    $('#login-password').value = '';
    setAdmin(true, name);
  } catch (error) {
    err.textContent = error.message;
  }
}

async function onLogout() {
  try {
    await api('/api/auth/logout', { method: 'POST' });
  } catch {
    /* clear locally regardless */
  }
  localStorage.removeItem(TOKEN_KEY);
  setAdmin(false);
}

// ---- day loading ----------------------------------------------------------

async function loadDay() {
  const now = nowInTz(state.tz);
  state.today = now.date;
  state.weekday = now.weekday;
  state.blocks = blocksForDay(state.routine, now.weekday);
  try {
    const [c, t] = await Promise.all([
      api(`/api/completions?date=${now.date}`),
      api(`/api/tasks?date=${now.date}`),
    ]);
    state.completions = new Set(c.completions.map((x) => x.block_key));
    state.tasks = t.tasks;
  } catch (err) {
    showBanner(err.message);
  }
  renderRoutine();
  renderTasks();
}

// ---- clock tick (1s) ------------------------------------------------------

function tick() {
  const now = nowInTz(state.tz);
  if (now.date !== state.today) return loadDay();

  state.nowMin = now.minutes;
  $('#clock').textContent = now.clock;
  $('#weekday').textContent = `${now.weekday} · ${now.date}`;
  refreshTimeOptions(now.minutes);

  const active = state.blocks.find((b) => now.minutes >= b.start && now.minutes < b.end);
  const next = state.blocks.find((b) => b.start > now.minutes);
  updateCountdown(active, next, now.minutes);

  if (now.time !== state.lastMinute) {
    state.lastMinute = now.time;
    renderRoutine();
  }
}

function updateCountdown(active, next, nowMin) {
  let label, frac, remainingSec, sub;
  if (active) {
    frac = clamp((active.end - nowMin) / (active.end - active.start));
    label = active.task;
    remainingSec = Math.max(0, Math.ceil((active.end - nowMin) * 60));
    sub = `ends at ${fmtMin(active.end)}`;
  } else if (next) {
    frac = 1;
    label = `Next: ${next.task}`;
    remainingSec = Math.max(0, Math.ceil((next.start - nowMin) * 60));
    sub = `starts at ${fmtMin(next.start)}`;
  } else {
    frac = 0;
    label = 'Nothing left in the routine';
    remainingSec = null;
    sub = state.blocks.length ? 'all done for today' : `no routine set for ${state.weekday}`;
  }

  $('#cd-label').textContent = label;
  $('#cd-time').textContent = remainingSec == null ? '--:--:--' : formatHMS(remainingSec);
  $('#cd-sub').textContent = sub;

  $('#ring-fg').setAttribute('stroke-dashoffset', (RING_C * (1 - frac)).toFixed(2));

  const top = frac * 46;
  const bottom = (1 - frac) * 46;
  $('#sand-top').setAttribute('y', (50 - top).toFixed(2));
  $('#sand-top').setAttribute('height', top.toFixed(2));
  $('#sand-bottom').setAttribute('y', (96 - bottom).toFixed(2));
  $('#sand-bottom').setAttribute('height', bottom.toFixed(2));
}

function setupCountdownControls() {
  const apply = (mode) => {
    const ring = mode === 'ring';
    $('#ring-view').classList.toggle('hidden', !ring);
    $('#hourglass-view').classList.toggle('hidden', ring);
    $('#mode-ring').setAttribute('aria-pressed', String(ring));
    $('#mode-hourglass').setAttribute('aria-pressed', String(!ring));
    localStorage.setItem('countdownMode', mode);
  };
  $('#mode-ring').addEventListener('click', () => apply('ring'));
  $('#mode-hourglass').addEventListener('click', () => apply('hourglass'));
  apply(localStorage.getItem('countdownMode') === 'hourglass' ? 'hourglass' : 'ring');
}

// ---- time picker ----------------------------------------------------------

function hourLabel(h) {
  if (h === 0) return '12 AM';
  if (h < 12) return `${h} AM`;
  if (h === 12) return '12 PM';
  return `${h - 12} PM`;
}

function buildTimeOptions() {
  const hourSel = $('#task-hour');
  const minSel = $('#task-minute');
  for (let h = 0; h < 24; h++) hourSel.append(new Option(hourLabel(h), String(h)));
  for (let m = 0; m < 60; m++) minSel.append(new Option(pad(m), String(m)));
}

function refreshTimeOptions(nowMinutes) {
  const hourSel = $('#task-hour');
  const minSel = $('#task-minute');
  const nowH = Math.floor(nowMinutes / 60);
  const nowM = Math.floor(nowMinutes % 60);

  for (const opt of hourSel.options) opt.disabled = Number(opt.value) < nowH;
  if (hourSel.value === '' || Number(hourSel.value) < nowH) hourSel.value = String(nowH);

  const selH = Number(hourSel.value);
  for (const opt of minSel.options) opt.disabled = selH === nowH && Number(opt.value) < nowM;
  if (minSel.value === '' || (selH === nowH && Number(minSel.value) < nowM)) {
    minSel.value = String(nowM);
  }
}

function selectedTime() {
  return `${pad($('#task-hour').value)}:${pad($('#task-minute').value)}`;
}

// ---- routine --------------------------------------------------------------

function renderRoutine() {
  const ul = $('#routine-list');
  ul.innerHTML = '';
  if (!state.blocks.length) {
    ul.innerHTML = `<li class="text-sm text-slate-500">No routine set for ${esc(state.weekday)}.</li>`;
    return;
  }
  for (const b of state.blocks) {
    const done = state.completions.has(b.key);
    const active = state.nowMin >= b.start && state.nowMin < b.end;
    const past = state.nowMin >= b.end;
    const li = document.createElement('li');
    li.className = `flex items-start gap-3 rounded-xl border p-3 ${active ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200'} ${past ? 'opacity-60' : ''}`;
    li.innerHTML = `
      <input type="checkbox" class="mt-1 h-5 w-5 accent-emerald-600" ${done ? 'checked' : ''} ${state.admin ? '' : 'disabled'} aria-label="Done: ${esc(b.task)}" />
      <div class="min-w-0 flex-1">
        <div class="font-mono text-xs text-slate-500">${fmtMin(b.start)} – ${fmtMin(b.end)}${active ? ' · now' : ''}</div>
        <div class="break-words ${done ? 'line-through text-slate-400' : ''}">${esc(b.task)}</div>
      </div>`;
    if (state.admin) {
      li.querySelector('input').addEventListener('change', (e) => toggleBlock(b.key, e.target.checked));
    }
    ul.append(li);
  }
}

async function toggleBlock(key, done) {
  if (done) state.completions.add(key);
  else state.completions.delete(key);
  renderRoutine();
  try {
    await api('/api/completions', { method: 'PUT', body: { date: state.today, block_key: key, done } });
  } catch (err) {
    if (done) state.completions.delete(key);
    else state.completions.add(key);
    renderRoutine();
    showBanner(err.message);
  }
}

// ---- tasks ----------------------------------------------------------------

function renderTasks() {
  const ul = $('#task-list');
  ul.innerHTML = '';
  if (!state.tasks.length) {
    ul.innerHTML = '<li class="text-sm text-slate-500">No tasks yet today.</li>';
    return;
  }
  for (const t of state.tasks) {
    const li = document.createElement('li');
    li.className = 'flex items-center gap-3 rounded-xl border border-slate-200 p-3';
    li.innerHTML = `
      <input type="checkbox" class="h-5 w-5 accent-emerald-600" ${t.done ? 'checked' : ''} ${state.admin ? '' : 'disabled'} aria-label="Done: ${esc(t.title)}" />
      <span class="font-mono text-xs text-slate-500 w-12">${esc(t.time)}</span>
      <span class="flex-1 break-words ${t.done ? 'line-through text-slate-400' : ''}">${esc(t.title)}</span>
      ${state.admin ? '<button class="text-sm text-red-600 hover:underline">Delete</button>' : ''}`;
    if (state.admin) {
      li.querySelector('input').addEventListener('change', (e) => updateTask(t.id, e.target.checked));
      li.querySelector('button').addEventListener('click', () => deleteTask(t.id));
    }
    ul.append(li);
  }
}

async function onAddTask(e) {
  e.preventDefault();
  const err = $('#task-error');
  err.textContent = '';
  const title = $('#task-title').value.trim();
  if (!title) return (err.textContent = 'Give the task a title.');

  const time = selectedTime();
  const now = nowInTz(state.tz);
  if (time < now.time) return (err.textContent = 'That time has already passed today.');

  try {
    const task = await api('/api/tasks', {
      method: 'POST',
      body: { date: now.date, time, title, tz: state.tz },
    });
    state.tasks.push(task);
    state.tasks.sort((a, b) => a.time.localeCompare(b.time) || a.id - b.id);
    $('#task-title').value = '';
    renderTasks();
  } catch (error) {
    err.textContent = error.message;
  }
}

async function updateTask(id, done) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return;
  task.done = done;
  renderTasks();
  try {
    await api(`/api/tasks/${id}`, { method: 'PATCH', body: { done } });
  } catch (err) {
    task.done = !done;
    renderTasks();
    showBanner(err.message);
  }
}

async function deleteTask(id) {
  try {
    await api(`/api/tasks/${id}`, { method: 'DELETE' });
    state.tasks = state.tasks.filter((t) => t.id !== id);
    renderTasks();
  } catch (err) {
    showBanner(err.message);
  }
}

// ---- boot -----------------------------------------------------------------

async function init() {
  setupForkBanner();
  $('#login-toggle').addEventListener('click', () => $('#login-panel').classList.toggle('hidden'));
  $('#login-cancel').addEventListener('click', () => $('#login-panel').classList.add('hidden'));
  $('#login-form').addEventListener('submit', onLogin);
  $('#logout-btn').addEventListener('click', onLogout);
  $('#task-form').addEventListener('submit', onAddTask);

  state.routine = await api('/api/routine');
  state.tz = resolveTimezone(state.routine.timezone);
  $('#tz-badge').textContent = `${state.tz} · ${tzLabel(state.tz)}`;
  setupCountdownControls();
  buildTimeOptions();
  await initAuth();
  await loadDay();
  tick();
  setInterval(tick, 1000);
}

init().catch((err) => showBanner(err.message));
