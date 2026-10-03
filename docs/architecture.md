# Architecture

## Goals
- One hand-edited source of truth for the weekly routine (`weekly_routine.yaml`).
- Zero-build frontend: plain ES modules + Tailwind CDN.
- Runs on free tiers (Render / Railway web service, Turso database).
- Easy to change: small surface area, pure logic isolated from I/O.

## Components

```
Browser                                    Server (Node/Express)               Turso (libsql)
┌────────────────────────────┐   HTTP/JSON  ┌────────────────────────┐  libsql  ┌─────────────┐
│ index.html (Tailwind CDN)  │ ───────────▶ │ server.js              │ ───────▶ │ tasks       │
│ js/app.js   (UI + tick)    │              │  - GET /api/routine    │          │ block_      │
│ js/schedule.js (pure)      │              │  - tasks + completions │          │ completions │
└────────────────────────────┘              │  - validation          │          └─────────────┘
                                            │ db.js (client, schema) │
                                            │ weekly_routine.yaml ◀──┘ read per request
                                            └────────────────────────┘
```

- **Frontend** fetches the routine once, resolves the timezone, then drives everything from a 1-second `tick()`:
  - recomputes the current weekday / HH:MM:SS in the active timezone,
  - updates the countdown (ring or hourglass, toggle persisted in `localStorage`),
  - re-renders the routine list once per minute to move the "now" highlight.
- **Server** is stateless apart from the database. It serves static files and a small JSON API.
- **schedule.js** has no DOM or network code. The server imports the same `nowInTz` function to validate "no past tasks", so client and server agree on the clock.

## Key decisions

### Timezone model
`timezone: auto` means the browser's zone. Block times are wall-clock times in that zone, so if you travel, your routine follows your local clock. Setting an explicit IANA name pins the routine to that zone regardless of the device.

### Time grammar
A block is `<start>-<end>`. Each side is `HH:MM` or an anchor name. Anchors are resolved from the `anchors:` map in the YAML, so changing prayer times for the season is a one-line edit and block keys (which use the raw time string) stay stable. Blocks must not cross midnight (`end > start`); invalid rows are skipped with a console warning rather than breaking the page.

### Tasks versus routine blocks
- **Tasks** are user-created rows in the `tasks` table. They are restricted to *today* and to times not in the past, checked in both the browser and the server (the server is authoritative).
- **Routine blocks** are the YAML entries. They are never stored as rows. Only their completion state is stored, keyed by `(date, block_key)`.

### Countdown
Shows time remaining in the active block. Between blocks it counts down to the next start. Both visuals are driven by one fraction `frac = remaining / duration`:
- Ring: `stroke-dashoffset = C * (1 - frac)`.
- Hourglass: top sand height `frac`, bottom sand height `1 - frac`.

### Why no build step
Tailwind's CDN play script is fine for a personal app. If you later want a smaller CSS bundle, add the Tailwind CLI and a `build` script. Nothing else changes.

## Failure modes
| Situation | Behaviour |
|---|---|
| Turso unreachable | API returns 500. The routine still renders (YAML only); completions and tasks show a banner. |
| Bad YAML | `/api/routine` returns 500. Fix the file and reload. |
| Unknown timezone in YAML | Falls back to the device timezone. |
| Device crosses midnight | `tick()` detects the new date and reloads the day. |

## Scaling notes
This is single-user by design. For multi-user, add auth (e.g. a session cookie or Turso per-user databases) and a `user_id` column; see `database-schema.md`.
