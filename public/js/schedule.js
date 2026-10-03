// Pure helpers shared by the browser and the server. No DOM, no network.

export const ANCHOR_ALIASES = {
  fajr: 'Fajr', fazr: 'Fajr',
  zuhr: 'Zuhr', zuhor: 'Zuhr', dhuhr: 'Zuhr',
  asr: 'Asr', asor: 'Asr',
  magrib: 'Magrib', maghrib: 'Magrib',
  esha: 'Esha', isha: 'Esha',
};

const pad = (n) => String(n).padStart(2, '0');

export function isValidTz(tz) {
  if (typeof tz !== 'string' || !tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// "auto" (or missing) -> the device's timezone; otherwise the IANA name if valid.
export function resolveTimezone(setting) {
  const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (!setting || setting === 'auto') return detected;
  return isValidTz(setting) ? setting : detected;
}

// e.g. "GMT+6"
export function tzLabel(tz, d = new Date()) {
  const part = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' })
    .formatToParts(d)
    .find((p) => p.type === 'timeZoneName');
  return part ? part.value : '';
}

// Current wall-clock in a timezone: weekday ("Sat"), date, HH:MM, HH:MM:SS, and minutes since midnight (fractional).
export function nowInTz(tz, d = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(d)
      .map(({ type, value }) => [type, value]),
  );
  const h = Number(p.hour);
  const m = Number(p.minute);
  const s = Number(p.second);
  return {
    weekday: p.weekday,
    date: `${p.year}-${p.month}-${p.day}`,
    time: `${pad(h)}:${pad(m)}`,
    clock: `${pad(h)}:${pad(m)}:${pad(s)}`,
    minutes: h * 60 + m + s / 60,
  };
}

// "HH:MM" -> minutes, or an anchor name -> minutes, or null.
export function parseClock(token, anchors = {}) {
  const t = String(token).trim();
  const hm = t.match(/^(\d{1,2}):(\d{2})$/);
  if (hm) return Number(hm[1]) * 60 + Number(hm[2]);

  const canon = ANCHOR_ALIASES[t.toLowerCase()];
  const value = canon && anchors[canon];
  if (!value) return null;
  const v = String(value).match(/^(\d{1,2}):(\d{2})$/);
  return v ? Number(v[1]) * 60 + Number(v[2]) : null;
}

// "Fajr-8:00" -> { start, end } in minutes, or null if invalid.
export function parseRange(str, anchors = {}) {
  const parts = String(str).split('-').map((s) => s.trim());
  if (parts.length !== 2) return null;
  const start = parseClock(parts[0], anchors);
  const end = parseClock(parts[1], anchors);
  if (start == null || end == null || end <= start) return null;
  return { start, end };
}

// Blocks for one weekday, sorted by start time. Invalid rows are skipped with a warning.
export function blocksForDay(routine, weekday) {
  const rows = routine?.days?.[weekday] ?? [];
  const out = [];
  for (const row of rows) {
    const range = parseRange(row.time, routine.anchors);
    if (!range) {
      console.warn(`Skipping unparseable time "${row.time}" (${weekday})`);
      continue;
    }
    out.push({
      key: `${row.time}|${row.task}`, // stable across edits to anchors
      task: row.task,
      raw: row.time,
      ...range,
    });
  }
  return out.sort((a, b) => a.start - b.start);
}
