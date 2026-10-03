# Contracts

Covers the two interfaces other code depends on: the YAML file format and the HTTP API.

## weekly_routine.yaml format

```yaml
timezone: auto              # "auto" | IANA name (e.g. "Asia/Dhaka")
anchors:                    # required keys used by time tokens (optional if unused)
  Fajr:   "04:45"           # quoted "HH:MM", 24-hour
  Zuhr:   "12:05"
  Asr:    "15:35"
  Magrib: "18:00"
  Esha:   "19:20"
days:
  Sat:                      # Sun | Mon | Tue | Wed | Thu | Fri | Sat
    - time: "Fajr-8:00"     # "<token>-<token>"
      task: "Structured Programming Language"
```

### Time token grammar
```
block  := token "-" token
token  := HH:MM            (H or HH hour, MM minutes, 0-23 / 00-59)
        | anchor
anchor := Fajr | Zuhr | Asr | Magrib | Esha   (case-insensitive)
          aliases: Fazr, Zuhor, Dhuhr, Asor, Maghrib, Isha
```
Rules:
- `end` must be strictly after `start`. Blocks cannot cross midnight.
- Unknown or malformed blocks are skipped on the client and logged to the console.
- Blocks are displayed sorted by start time.
- The `task` string is free text. Keep it unique per (day, time) if you want completion keys to be unambiguous.

### Block key
`block_key = "<raw time string>|<task>"`, e.g. `Fajr-8:00|Structured Programming Language`. Changing an anchor value does not change the key. Renaming a task or time does, which resets that block's completion.

## HTTP API

Base URL: the app origin. All bodies are JSON (`Content-Type: application/json`). Dates are `YYYY-MM-DD` in the user's timezone. Times are `HH:MM` (24-hour).

Errors use a single shape: `{ "error": "<message>" }`, status 400 for validation, 404 for unknown id, 500 for server faults.

### GET /api/health
`200 { "ok": true }`. Used by the platform health check.

### GET /api/routine
Returns the parsed YAML.
```json
{
  "timezone": "auto",
  "anchors": { "Fajr": "04:45", "Zuhr": "12:05", "Asr": "15:35", "Magrib": "18:00", "Esha": "19:20" },
  "days": { "Sat": [ { "time": "Fajr-8:00", "task": "Structured Programming Language" } ] }
}
```

### GET /api/tasks?date=YYYY-MM-DD
```json
{ "tasks": [ { "id": 1, "date": "2026-10-03", "time": "18:30", "title": "Read chapter 4", "done": false } ] }
```
Sorted by `time`, then `id`. `400` if `date` is missing or malformed.

### POST /api/tasks
Request:
```json
{ "date": "2026-10-03", "time": "18:30", "title": "Read chapter 4", "tz": "Asia/Dhaka" }
```
| Field | Rules |
|---|---|
| `tz` | Required. Valid IANA zone. Used to decide "now". |
| `title` | Required. Trimmed, 1–200 chars. |
| `date` | Must equal today's date in `tz`. |
| `time` | `HH:MM`. Must be ≥ current `HH:MM` in `tz`. |

Responses:
- `201` with the created task object (same shape as above, `done: false`).
- `400` `{ "error": "Tasks can only be created for today" }`
- `400` `{ "error": "That time has already passed" }`
- `400` `{ "error": "Invalid timezone" }` and other validation messages.

### PATCH /api/tasks/:id
```json
{ "done": true }
```
`200` with the updated task. `404` if the id does not exist.

### DELETE /api/tasks/:id
`200 { "ok": true }`. `404` if the id does not exist.

### GET /api/completions?date=YYYY-MM-DD
```json
{ "completions": [ { "block_key": "Fajr-8:00|Structured Programming Language" } ] }
```
Only blocks marked done are returned.

### PUT /api/completions
```json
{ "date": "2026-10-03", "block_key": "Fajr-8:00|Structured Programming Language", "done": true }
```
Upserts the row. `200` echoes the request body. Unchecking stores `done: false` and the row is hidden from GET.

## Stability promises
- The YAML format and the HTTP contract above are versioned by convention. Breaking changes require updating this file and `database-schema.md` in the same commit.
- Adding optional fields is non-breaking. Clients must ignore unknown fields.
