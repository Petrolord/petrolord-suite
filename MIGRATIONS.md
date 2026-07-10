# Migration log

Every schema change ships as a migration file under `supabase/migrations/`
and gets a row here (see CLAUDE.md database rules). Apply staging-first;
never hand-type DDL against production.

| Date (UTC) | Migration file | Purpose | Applied to staging | Applied to production |
|---|---|---|---|---|
| 2026-07-10 | `20260710120000_create_seismic_volumes.sql` | Seismolord: `seismic_volumes` table (user-scoped RLS) | 2026-07-10 | 2026-07-10 (shared project) |
| 2026-07-10 | `20260710120500_seed_seismolord_app.sql` | Seismolord: `master_apps` catalog row (geoscience, Active) | 2026-07-10 | 2026-07-10 (shared project) |
| 2026-07-10 | `20260710150000_remove_legacy_seismic_master_apps.sql` | Remove 6 legacy seismic `master_apps` rows (apps deleted in PR #21 / never built) | 2026-07-10 | 2026-07-10 (shared project) |
| 2026-07-10 | `20260710153000_remove_depth_conversion_engine_row.sql` | Remove `depth-conversion-engine` row (also deleted in PR #21) | 2026-07-10 | 2026-07-10 (shared project) |
| 2026-07-10 | `20260710170000_seismic_bucket_storage_policies.sql` | Seismolord Phase 0: owner-path RLS policies on `seismic` bucket (storage.objects) | 2026-07-10 | 2026-07-10 (shared project) |
| 2026-07-10 | `20260710171500_drop_legacy_seismic_storage_policies.sql` | Drop legacy project-scheme storage policies on `seismic` bucket (uuid-cast errors, dead scheme) | 2026-07-10 | 2026-07-10 (shared project) |

Staging and production frontends currently share one Supabase project
(`ssyckywijlrkgcwvkwlr`), so an applied migration is live in both. The
2026-07-10 `supabase db push` also applied the previously-unpushed
2026-07-08 migrations (all idempotent; the aquifer-influx-calculator
catalog seed inserted its row at that point).

Note: migrations before 2026-07-10 predate this log; see `supabase/migrations/`
for the full historical set.
