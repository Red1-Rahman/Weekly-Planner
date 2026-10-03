# Routine Tracker

A minimal weekly-routine dashboard. You edit one file, `weekly_routine.yaml`; the app shows today's blocks, a countdown to the current block (ring or hourglass), and lets you tick off routine blocks and create same-day tasks.

**Stack:** HTML + vanilla JS + Tailwind (CDN) · Node/Express · Turso (libsql / SQLite)

## Quick start (local)

```bash
npm install
npm run dev          # http://localhost:3000, uses ./local.db
```

## Use your own routine

Edit `weekly_routine.yaml`. Time tokens are `HH:MM` or an anchor (`Fajr`, `Zuhr`, `Asr`, `Magrib`, `Esha`), joined by `-`. Update the `anchors` block seasonally. Full format: [docs/contracts.md](docs/contracts.md#weekly_routineyaml-format). No restart needed; the file is re-read on each request.

## Turso database (free tier)

```bash
turso auth login
turso db create routine-tracker
turso db show routine-tracker --url        # -> TURSO_DATABASE_URL
turso db tokens create routine-tracker     # -> TURSO_AUTH_TOKEN
```

Put both in `.env` locally. Tables are created automatically on startup (`CREATE TABLE IF NOT EXISTS`).

## Deploy

**Render:** push to GitHub, "New > Blueprint" (uses `render.yaml`), or "New > Web Service" with build `npm install` and start `npm start`. Set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` in the dashboard.

**Railway:** "New Project > Deploy from GitHub repo". Nixpacks detects Node automatically. Add the two Turso variables. Railway sets `PORT` for you.

## Project layout

```
weekly_routine.yaml   your routine (the only file you hand-edit)
server.js             Express API + static hosting
db.js                 Turso client + schema bootstrap
public/index.html     UI shell (Tailwind via CDN)
public/js/schedule.js pure time/routine logic (shared with server)
public/js/app.js      UI behaviour
docs/                 architecture, API contracts, database schema
```

## Roadmap

- **Next feature (recommended): Google Sheet → YAML importer.** `npm run import -- routine.csv` converts the exported CSV into `weekly_routine.yaml`, so re-planning a week is one command instead of hand-editing.
- Carry unfinished tasks into the next day.
- Per-day completion streaks.
- Auto-fetch prayer times for your city (e.g. Aladhan API) to replace the manual anchors.
