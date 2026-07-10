# Migration log

Every schema change ships as a migration file under `supabase/migrations/`
and gets a row here (see CLAUDE.md database rules). Apply staging-first;
never hand-type DDL against production.

| Date (UTC) | Migration file | Purpose | Applied to staging | Applied to production |
|---|---|---|---|---|
| 2026-07-10 | `20260710120000_create_seismic_volumes.sql` | Seismolord: `seismic_volumes` table (user-scoped RLS) | pending | pending |
| 2026-07-10 | `20260710120500_seed_seismolord_app.sql` | Seismolord: `master_apps` catalog row (geoscience, Active) | pending | pending |

Note: migrations before 2026-07-10 predate this log; see `supabase/migrations/`
for the full historical set.
