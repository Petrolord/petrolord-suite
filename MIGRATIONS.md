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
| 2026-07-13 | `20260713200000_seed_well_data_manager_app.sql` | Well Data Manager G1.5: `master_apps` tile (Geoscience, slug `well-data-manager`, Active, flat 899 via %ROWTYPE template copy of the seismolord row); route ships in the same PR | 2026-07-13 | 2026-07-13 (shared project) |
| 2026-07-13 | `20260713210000_drop_seismic_wells_compat_view.sql` | Well Data Manager G1.5 close-out: drop the `seismic_wells` compat view + its INSTEAD OF triggers/functions — the name is retired; `geo_wells` untouched. View was empty its whole life; stale prod bundles error on their wells panel until the next prod upload (accepted) | 2026-07-13 | 2026-07-13 (shared project) |
| 2026-07-13 | `20260713220000_create_petro_zones_and_projects.sql` | Petrophysics Studio G2.2: shared `geo_wells_zones` (normalized zones + published `properties` jsonb; tops-pattern RLS — child of the well's visibility, owner-only writes) and app-private `petro_projects` (workspace state, owner-only RLS) | 2026-07-13 | 2026-07-13 (shared project; pentest blocks 8–9 executed live, 6/6 green) |
| 2026-07-13 | `20260713230000_seed_petrophysics_studio_app.sql` | Petrophysics Studio G2.6 close-out: `master_apps` tile (Geoscience, slug `petrophysics-studio`, Active, flat 899 via %ROWTYPE template copy). Supersedes 5 shallow tiles (2 already Archived; 3 never catalogued — their routes redirect to the successor in the SPA) | 2026-07-13 | 2026-07-13 (shared project) |
| 2026-07-13 | `20260713240000_create_correlation_sections.sql` | Well Correlation G3.1: app-private `geo_correlation_sections` (ordered `well_ids`, datum + track-layout jsonb; owner-only RLS, petro_projects pattern). No change to `geo_wells_tops`/`_zones` — G3 edits those rows via new owner-only per-top service functions | 2026-07-13 | 2026-07-13 (shared project; pentest blocks 10–11 executed live, green) |
| 2026-07-13 | `20260713250000_seed_well_correlation_app.sql` | Well Correlation G3.3 close-out: `master_apps` tile (Geoscience, slug `well-correlation`, Active, flat 899 via %ROWTYPE template copy). Legacy `well-correlation-tool` stays Archived; its route redirects to the successor in the SPA | 2026-07-13 | 2026-07-13 (shared project) |
| 2026-07-13 | `20260713260000_create_geo_surfaces.sql` | Mapping & Surface Studio G4.2: shared `geo_surfaces` registry (row-major f32 grids in a private `surfaces` bucket; org-read RLS, geo_wells model) generalizing `seismic_exported_surfaces`; owner-path bucket policies with shared-org path-join read | 2026-07-13 | 2026-07-13 (shared project; pentest block 12, 4 probes, executed live green) |
| 2026-07-13 | `20260713270000_drop_shared_data_registry.sql` | Mapping G4.4 close-out: DROP the live-but-unused (0-row) generic `shared_data_registry` hub (no repo migration; consumers DataExchangeHub/IntegrationContext deleted same PR; the data-exchange edge fn never existed). Superseded by the typed geo_* registries | 2026-07-13 | 2026-07-13 (shared project; 0 rows verified at drop) |
| 2026-07-13 | `20260713280000_seed_mapping_surface_studio_app.sql` | Mapping & Surface Studio G4.4: `master_apps` tile (Geoscience, slug `mapping-surface-studio`, Active, flat 899 via %ROWTYPE template copy); route ships in the same PR | 2026-07-13 | 2026-07-13 (shared project) |
| 2026-07-13 | `20260713290000_create_rcp_prospects.sql` | Integration & Risking G5.2: app-private `rcp_prospects` (prospect inventory — Pg factors, input snapshot, risked outputs jsonb; owner-only RLS, petro_projects pattern) | 2026-07-13 | 2026-07-13 (shared project; pentest block 13 live green) |

Staging and production frontends currently share one Supabase project
(`ssyckywijlrkgcwvkwlr`), so an applied migration is live in both. The
2026-07-10 `supabase db push` also applied the previously-unpushed
2026-07-08 migrations (all idempotent; the aquifer-influx-calculator
catalog seed inserted its row at that point).

Note: migrations before 2026-07-10 predate this log; see `supabase/migrations/`
for the full historical set.
