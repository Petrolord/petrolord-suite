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
| 2026-07-10 | `20260710200000_create_seismic_horizons.sql` | Seismolord Phase 3: `seismic_horizons` registry (user RLS, FK cascade to volumes; pick grids in Storage) | 2026-07-10 | 2026-07-10 (shared project) |
| 2026-07-10 | `20260710220000_create_seismic_faults.sql` | Seismolord Phase 4: `seismic_faults` (user RLS, FK cascade; sticks as compact jsonb) | 2026-07-10 | 2026-07-10 (shared project) |
| 2026-07-10 | `20260710233000_create_seismic_exported_surfaces.sql` | Seismolord Phase 5: cross-app surface handoff registry (user RLS; FKs set-null; provenance jsonb) | 2026-07-10 | 2026-07-10 (shared project) |
| 2026-07-11 | `20260711220000_create_seismic_wells.sql` | Seismolord wells W1: `seismic_wells` (user RLS; per-user, volume-independent — no volume FK by design; jsonb deviation/tops/checkshots) | 2026-07-11 | 2026-07-11 (shared project) |
| 2026-07-12 | `20260712120000_seismic_storage_quota.sql` | Seismolord: server-side 20 GiB per-user quota on the `seismic` bucket (INSERT policy gate + usage/quota functions; updates/deletes quota-free) | 2026-07-12 | 2026-07-12 (shared project) |
| 2026-07-12 | `20260712200000_archive_geoscience_shell_tiles.sql` | Geoscience G0 (Geoscience-ROADMAP.md): archive 6 shell `master_apps` tiles (well-correlation-tool, log-facies-analysis, petrophysical-integration-suite, earthmodel-studio, earthmodel-pro, routeless material-balance-volumetrics); rows preserved | 2026-07-12 | 2026-07-12 (shared project) |
| 2026-07-12 | `20260712220000_archive_mem_tile.sql` | MEM decision (MEM-AUDIT.md): archive `1d-mechanical-earth-model` tile until the Drilling-module rebuild ships; row preserved | 2026-07-12 | 2026-07-12 (shared project) |
| 2026-07-13 | `20260713100000_create_wells_registry.sql` | Well Data Manager G1.1: shared `geo_wells`/`geo_wells_tops`/`geo_wells_logs` registry (owner + org read-only RLS), private `wells` bucket + path policies, and the `is_org_member()` body upgrade to the three-table membership view (also serves epe/econ policies) | 2026-07-13 | 2026-07-13 (shared project; 14/14 live RLS pentest green) |
| 2026-07-13 | `20260713160000_migrate_seismic_wells_to_registry.sql` | Well Data Manager G1.4: `seismic_wells` data → `geo_wells` (ids preserved, jsonb tops normalized into `geo_wells_tops`), table replaced by a security_invoker COMPATIBILITY VIEW with INSTEAD OF triggers (undeployed prod clients keep writing until the next upload); hard drop scheduled at G1.5. Both tables were empty at apply time | 2026-07-13 | 2026-07-13 (shared project; 6/6 compat-view RLS probes green, rollback-wrapped dry run first) |

Staging and production frontends currently share one Supabase project
(`ssyckywijlrkgcwvkwlr`), so an applied migration is live in both. The
2026-07-10 `supabase db push` also applied the previously-unpushed
2026-07-08 migrations (all idempotent; the aquifer-influx-calculator
catalog seed inserted its row at that point).

Note: migrations before 2026-07-10 predate this log; see `supabase/migrations/`
for the full historical set.
