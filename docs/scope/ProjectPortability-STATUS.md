# Project Portability — STATUS

Plan of record: `ProjectPortability-PLAN.md` (approved 2026-09-02; `.pld`
packages, Geoscience first, seismic as bricks in v1, offboarding dump
kept, imports private by default, certificate wording in PP5).

## Wave status

| Wave | Status | Landed |
|---|---|---|
| PP0 Version foundations | **BUILT 2026-09-02**, app-state migration **APPLIED LIVE** same day, gate passed | PR #352 (feat/portability-pp0) |
| PP1 Package writer, Geoscience | not started | |
| PP2 Importer | not started | |
| PP3 Coverage | not started | |
| PP4 Restorable backup | not started | |
| PP5 Regulatory delivery | not started | |

## PP0 (2026-09-02)

What shipped:

- **Platform build stamp.** `vite.config.js` injects `__PLATFORM_BUILD__`
  = `{ version, sha, builtAt, source }`. Sha source order: `VITE_BUILD_SHA`
  env, `git rev-parse`, a hand-read `.git/HEAD` (the staging container has
  no git binary), then `build-info.json` at the repo root (the Hostinger
  build runs from a source zip with no `.git`; the zip-cut step now writes
  this file, see the deploy procedure). Read through
  `src/lib/platformBuild.js` (`PLATFORM_BUILD`, `buildLabel()`); under
  jest it falls back to `dev`/`unknown`. Shown in the footer of every
  help guide (`HelpGuideShell`).
- **`src/lib/stateVersion.js`.** `registerStateKind(kind, { current,
  migrations, label })`, `openState` / `openStateRow` (step-wise
  migration up; refuses rows stamped above `current` with a message
  naming both versions), `stampState` / `writeStamped` (adds
  `schema_version` + `app_build`; retries once without the stamp on
  PostgREST 42703 / PGRST204 so code can land before the migration).
  Rows with no `schema_version` are version 1 by definition.
- **Migration `20260902120000_pp0_state_versions.sql`** adds
  `schema_version integer not null default 1`, `app_build text`,
  `engine_version text` to 86 app-state tables (IF NOT EXISTS, fast
  defaults). Rollback-wrapped dry run on the linked project: 84 columns
  added (two listed tables are absent in the live schema), clean.
  The session's own apply was blocked by the permission classifier; the
  **owner applied it 2026-09-02** with `supabase db query --linked -f`.
  Live gate the same day: 84 tables carry `schema_version` and
  `app_build`, 0 present tables missing the column; `saved_waterflood_projects`
  and `wp_ac_cases` are the two listed names absent from the live schema.
  (Had the order been reversed, every writer saves without the stamp and
  every reader treats rows as version 1, so nothing breaks either way.)
- **Migration `20260902120500_pp0_registry_state_versions.sql`** (shared
  registries) is **HELD** for the second-engineer review.
- **Loaders retrofitted** through the helper: the `savedProjects.js`
  factory (all 50 `saved_<app>_projects` tables; services may pass
  `schemaVersion` + `migrations`), Petrophysics `petro_projects`, and
  the richer loaders listed in the PR (pore pressure, rock physics,
  earth models, seismic sessions and projects, correlation sections,
  ReservoirCalc prospects, facility layouts, artificial lift designs,
  simulation cases, economics cases, well designs).

Gates (PLAN §6, PP0 row):

- Jest: version N+1 refused with the named message; a row without the
  column opens as version 1 with defaults; migrations run step-wise;
  stamp carries the build; retry-without-stamp path. `src/lib/__tests__/
  stateVersion.test.js`, `src/utils/__tests__/savedProjects.test.js`.
- Live catalog gate (every listed table has `schema_version`) runs after
  the owner applies the migration: `select count(*) from
  information_schema.columns where column_name='schema_version'` should
  read 84 for the app-state half.

Not in PP0, by design: `wp_*` case and run tables beyond `wp_designs`
(they already carry `engine_version`; `schema_version` was added by the
migration but their loaders stay untouched until PP3 packages them),
`epe_*` result tables written by edge functions, `sim_runs`.

## Program gotcha: one database, two builds

Staging (the dev worktree served by HMR) and production (petrolord.com)
share one Supabase project. A `current` bump on any state kind in the
worktree stamps rows that the production build cannot open until the
next Hostinger upload, and readers that map a list (sessions, seismic
projects, earth models, prospects) refuse the whole list on one such
row. Rule: **bump a kind's `current` only in the PR that also ships to
production in the same upload**, never on a long-lived branch, and add
the migrator in the same change.

## Open items

- Second engineer reviews `20260902120500` (registries), then apply.
- Deploy procedure: write `build-info.json` `{ "sha": "<full sha>" }` at
  the clean-checkout root before zipping (untracked, gitignored) so the
  Hostinger build stamps the real sha.
