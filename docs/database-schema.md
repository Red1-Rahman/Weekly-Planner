# Database schema

Engine: SQLite via Turso (libsql). Schema is created idempotently on startup in `db.js` (`CREATE ... IF NOT EXISTS`).

## Tables

### tasks
User-created, same-day tasks.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | INTEGER | no | autoincrement | Primary key |
| `date` | TEXT | no | | `YYYY-MM-DD`, user's local date |
| `time` | TEXT | no | | `HH:MM`, 24-hour |
| `title` | TEXT | no | | 1–200 chars (`CHECK`) |
| `done` | INTEGER | no | 0 | `0` or `1` (`CHECK`) |
| `created_at` | TEXT | no | `datetime('now')` | UTC, informational |

Index: `idx_tasks_date (date, time)`, used by `GET /api/tasks`.

### block_completions
Completion state for routine blocks. Blocks themselves live in YAML.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `date` | TEXT | no | | `YYYY-MM-DD` |
| `block_key` | TEXT | no | | `"<time>|<task>"`, see contracts.md |
| `done` | INTEGER | no | 1 | `0` or `1` (`CHECK`) |

Primary key: `(date, block_key)`. Writes are upserts (`ON CONFLICT DO UPDATE`).

## Relationships
None. Tasks and completions are independent. Block keys are not foreign keys because routine blocks are not stored in the database.

## Example rows
```
tasks:             (1, '2026-10-03', '18:30', 'Read chapter 4', 0, '2026-10-03 12:10:00')
block_completions: ('2026-10-03', 'Fajr-8:00|Structured Programming Language', 1)
```

## Migration policy
1. Additive changes only in `initDb()` (`ADD COLUMN` with a default, new tables, new indexes).
2. For destructive changes, add a numbered migration (`migrations/0002_*.sql`) and a `schema_version` table. Not needed yet.
3. Test on a separate Turso database first: `turso db create routine-tracker-staging`.

## Useful commands
```bash
turso db shell routine-tracker "SELECT * FROM tasks WHERE date = date('now');"
turso db shell routine-tracker ".schema"
```

## Future: multi-user
Add `user_id TEXT NOT NULL` to both tables, include it in the primary key of `block_completions`, and index `(user_id, date)`. Alternatively, use one Turso database per user.
