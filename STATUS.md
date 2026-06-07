# Petrolord Suite — Status

> Index of current state. Per-app detail lives in per-app STATUS.md files (see bottom).
> Last updated: 2026-06-04

## What this repo is

Petrolord Suite is a multi-app petroleum engineering platform: a React/Vite
front-end (`src/`) backed by Supabase (Postgres + Edge Functions under
`supabase/functions/`). Each "app" is a route under `src/pages/apps/` with
supporting components under `src/components/`. Calculation engines that must
run server-side live in Supabase Edge Functions, with shared math in
`supabase/functions/_shared/`.

Two repo-specific conventions worth knowing:
- **`.cjs` patches** (`tools/patches/`) — incremental, sentinel-guarded,
  idempotent edits to large files, dated `YYYY-MM-DD_*.cjs`. The patch
  headers double as change-log documentation.
- **Validation-first engine work** (`tools/validation/`) — engine math is
  validated against published worked examples before tier promotion
  (run: `npx tsx tools/validation/mbal-validation.ts`).

## Apps with active development

| App | Entry point | State |
|---|---|---|
| **Reservoir Balance (MBAL)** | `src/components/reservoirbalance/`, engine in `supabase/functions/_shared/mbal-engine.ts`, edge fn `calculate-mbal` | Phases 1–4 (Capsules 4A/4B) done; Phase 5 (Carter-Tracy benchmark + oil paths) largely complete as of 2026-05-17. See per-app STATUS. |
| **DCA — Decline Curve Analysis** | `src/pages/apps/DeclineCurveAnalysis.jsx`, `src/components/declineCurve/` | Most recent commit activity (chart rebuild, white chartTheme, fit diagnostics, piecewise segment detection — Phase 3a v2). |
| **EPE — Petroleum Economics** | `src/pages/apps/epe/`, `src/components/PetroleumEconomicsStudio/` | Scope doc at `docs/scope/EPE.md`; in-flight edits to EpeCaseDetail / contexts in the working tree. |
| **Seismic Interpretation** | — | Planned; scaffolding to begin. Targets July internal use, Oct–Nov public launch. |

## Full app catalog

60+ apps live under `src/pages/apps/` (EarthModel Studio/Pro, Well Correlation
Tool, Drilling suite, Casing & Tubing Design Pro, Nodal Analysis, Frac &
Completion, Basin Flow, Petrophysics, Facilities/Process apps, Material
Balance Analysis/Pro, etc.). The authoritative list is
`docs/PETROLORD_APPLICATION_CATALOG.md`; `docs/` also holds extensive
per-app investigation and architecture reports.

## Current branch context

- Branch: `claude-readonly-tour` (off `main`).
- Working tree is dirty: ~389 deletions (mostly stale `dist/` build
  artifacts plus the intentional removals of
  `src/components/reservoirbalance/EnergyBalance.jsx` and
  `src/pages/apps/ReservoirBalanceSurveillance.jsx` per the May 16 patches),
  ~25 modified source files (DCA, Reservoir Balance, EPE), ~455 untracked.
- Recent commit history is DCA chart/diagnostics work; Reservoir Balance
  changes are applied via `tools/patches/*.cjs` rather than commits.

## Per-app status files

- Reservoir Balance / MBAL → `docs/scope/ReservoirBalance-STATUS.md`
- (add DCA, EPE here as they get status files)
