# Routine Tracker

A minimal weekly-routine dashboard. You edit one file, `weekly_routine.yaml`. The app shows today's blocks, a countdown to the current block (ring or hourglass), lets you tick off routine blocks, and lets you create same-day tasks.

Anyone can view it. Only the owner (you) can add, change, or tick things, after logging in with a password.

**Stack:** HTML + vanilla JS + Tailwind (CDN) · Node/Express · Turso (libsql / SQLite)

---

## 1. Create your own planner (fork)

1. Open the repo on GitHub and click **Fork** (top right).
2. Keep the name `routine-tracker`, or pick your own.
3. Clone your fork to your computer:

```bash
   git clone https://github.com/YOUR-USERNAME/routine-tracker.git
   cd routine-tracker
   npm install
```

---

## 2. Change the routine to yours

Open `weekly_routine.yaml` and edit it.

- `timezone: auto` uses the timezone of the device opening the app. Or set one, e.g. `timezone: "Asia/Dhaka"`.
- `anchors` are your prayer (or other reference) times. Update them as the seasons change.
- `days` holds one list per weekday (`Sat`, `Sun`, `Mon`, `Tue`, `Wed`, `Thu`, `Fri`). Each entry is:

```yaml
  - time: "8:00-10:00"        # start-end, HH:MM or an anchor name
    task: "Leetcode"
```

  Time tokens are `HH:MM` or an anchor (`Fajr`, `Zuhr`, `Asr`, `Magrib`, `Esha`), joined by `-`. Blocks must not cross midnight.

Full format: [docs/contracts.md](docs/contracts.md#weekly_routineyaml-format).

Commit your changes:

```bash
git add weekly_routine.yaml
git commit -m "My routine"
git push
```

---

## 3. Create a free Turso database

Turso gives you a hosted SQLite database with a free tier.

1. Sign up at [turso.tech](https://turso.tech) (GitHub login works).
2. Install the Turso CLI:

```bash
   # macOS / Linux
   curl -sSfL https://get.tur.so/install.sh | bash

   # Windows (PowerShell)
   irm https://get.tur.so/install.ps1 | iex
```

3. Log in and create the database:

```bash
   turso auth login
   turso db create routine-tracker
```

4. Get the two values you need:

```bash
   turso db show routine-tracker --url        # copy this -> TURSO_DATABASE_URL
   turso db tokens create routine-tracker     # copy this -> TURSO_AUTH_TOKEN
```

   The URL starts with `libsql://`. The token is a long string. Keep it private.

Tables are created automatically the first time the app starts, so you don't need to run any SQL.

---

## 4. Test locally (optional but recommended)

Create a `.env` file in the project folder (it's git-ignored, so it won't be pushed):

```bash
TURSO_DATABASE_URL=libsql://your-db-your-name.turso.io
TURSO_AUTH_TOKEN=your-token-here
OWNER_PASSWORD=choose-a-password
```

Leave the Turso lines empty to use a local `local.db` file instead.

Start the app:

```bash
npm run dev          # http://localhost:3000
```

Open the page, click **Login as Redwan** (or your name, see step 6), and enter your password.

> If you see "Owner login is not configured", the server didn't read `OWNER_PASSWORD`. Make sure it's in `.env` and restart the server.

---

## 5. Deploy the web app (Render, free)

The database is on Turso; the web app runs on Render's free web service.

### Option A: Blueprint (easiest)

1. Push your fork to GitHub (you already did this in step 2).
2. Sign up at [render.com](https://render.com) with GitHub.
3. Click **New → Blueprint** and select your `routine-tracker` repo.
4. Render reads `render.yaml` and proposes a service named `routine-tracker`. Click **Apply**.
5. It will ask for three values. Fill them in:

   | Key | Value |
   |---|---|
   | `TURSO_DATABASE_URL` | the `libsql://...` URL from step 3 |
   | `TURSO_AUTH_TOKEN` | the token from step 3 |
   | `OWNER_PASSWORD` | your owner password (choose a long one) |

6. Wait for the build to finish (a few minutes). Open the `*.onrender.com` URL that appears at the top of the service page.

### Option B: Manual web service

If you don't want to use the Blueprint:

1. **New → Web Service**, connect your repo.
2. Use these settings:

   | Setting | Value |
   |---|---|
   | Runtime | Node |
   | Build command | `npm install` |
   | Start command | `npm start` |
   | Instance type | Free |

3. Under **Environment**, add `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `OWNER_PASSWORD`, and `NODE_VERSION` = `20`.
4. Click **Create Web Service**.

### Check it works

- Visit `https://your-service.onrender.com/api/health`. You should see `{"ok":true}`.
- Open the main page. You should see the timezone badge and today's routine.

> **Free tier note:** Render's free service sleeps after about 15 minutes without visitors. The first load after that takes around 30–60 seconds. This is normal.

### Updating later

Push to your `main` branch and Render redeploys automatically. Changes to `weekly_routine.yaml` also need a push, because the file is deployed with the code.

---

## 6. Make it yours: change the name and password

The owner login button and badge say **Redwan** by default. Change this to your name:

1. Open `server.js` and find:

```javascript
   const OWNER_NAME = 'Redwan';
```

   Replace `Redwan` with your name, e.g. `const OWNER_NAME = 'Tasnim';`.

2. Open `public/index.html` and change the text **Login as Redwan** to **Login as Tasnim** (in the header button).

3. Open `public/js/app.js` and change the fallback `'Redwan'` in `setAdmin` to your name. Search for `Redwan` to find every place.

4. Also update the read-only note in `public/index.html` ("Log in as Redwan to add or change tasks") to your name.

5. Commit and push:

```bash
   git add .
   git commit -m "Personalize owner name"
   git push
```

6. Set your password in Render: **Environment → OWNER_PASSWORD**. Then click **Save**. Render restarts the service with the new value.

Never write the password into any file in the repo. The repo is public-safe as long as the password only lives in Render's environment settings and in your local `.env`.

---

## Project layout

- weekly_routine.yaml your routine (the only file you hand-edit)
- server.js Express API, login, static hosting
- db.js Turso client + schema bootstrap
- public/index.html UI shell (Tailwind via CDN)
- public/js/schedule.js pure time/routine logic (shared with server)
- public/js/app.js UI behaviour
- docs/ architecture, API contracts, database schema


## Railway (alternative to Render)

1. **New Project → Deploy from GitHub repo** and select your fork.
2. Railway detects Node automatically (Nixpacks). Set the start command to `npm start` if asked.
3. Under **Variables**, add `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, and `OWNER_PASSWORD`.
4. Generate a public domain under **Settings → Networking**.

Railway sets `PORT` for you, so nothing else is needed.

## Roadmap

- **Next feature (recommended): Google Sheet → YAML importer.** `npm run import -- routine.csv` converts an exported CSV into `weekly_routine.yaml`, so re-planning a week is one command.
- Carry unfinished tasks into the next day.
- Per-day completion streaks.
- Auto-fetch prayer times for your city (e.g. Aladhan API) to replace the manual anchors.
