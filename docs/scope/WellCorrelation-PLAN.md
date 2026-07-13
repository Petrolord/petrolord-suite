# Well Correlation — Phase G3 Plan

Status: **APPROVED AS DRAFTED — owner sign-off 2026-07-13.** All four
§7 questions confirmed: (1) top propagation v1 = manual (same-MD seed +
drag, no auto-correlation); (2) section state persists in the new
app-private `geo_correlation_sections` table; (3) the orphaned legacy
`wellCorrelation/` cluster + context + hooks are deleted this phase;
(4) the Panel's `well_correlation_projects` / `well_correlation_wells`
tables stay (retirement logged for the DB-cleanup effort).
Roadmap slot: Geoscience-ROADMAP.md **Phase G3 — Well Correlation**
*(medium)*. App name **Well Correlation**, slug `well-correlation`
(locked, roadmap §6.2); the legacy `well-correlation-tool` slug becomes
a redirect alias. Builds on the G1/G2 registry: wells, LAS curves and —
crucially — **tops and zones are the shared `geo_wells_tops` /
`geo_wells_zones` rows**, so a top picked here is instantly visible in
Seismolord well-ties and (G4) Mapping with zero re-import.

## What this is

A multi-well stratigraphic cross-section: order wells along a
user-picked path, show a log track column per well, **flatten on any
top** (or view in true structural depth), **pick / drag-edit /
propagate formation tops across wells**, and fill zones between
correlated tops. Tops write straight back to the registry — the whole
point of normalizing tops in G1.

## Audit of what exists (2026-07-13) — all replaced

| Thing | State | Disposition |
|---|---|---|
| `WellCorrelationTool.jsx` (routed, `well-correlation-tool`) | 100% "Coming Soon" static mock | delete; route redirects to `well-correlation` |
| `WellCorrelationPanel.jsx` | unrouted/dead; own `well_correlation_projects`/`_wells` tables; Recharts mock curves | delete |
| `src/components/wellcorrelation/` (4 files) | shell; `Math.random` curves; NO datum math, NO correlation lines | delete (salvage WellCard tops-edit + curve-mapping UI ideas) |
| `src/components/wellCorrelation/` (**61 files**) + `WellCorrelationContext` + `useWellCorrelation`/`useLogManagement`/`useWellManagement` + `TrackConfigurationContext` + `src/data/wellLogs.js` | large ORPHANED cluster; provider wraps the whole app but **no live route consumes it**; pure in-memory demo state | delete as a unit; remove the provider from App.jsx |

Nothing existing reads `geo_wells*` or has a real cross-section engine
(no datum flattening, no inter-well correlation lines, no map picker).
This is a greenfield build plus a ~65-file cleanup.

## Design decisions (proposed — owner sign-off locks these)

1. **All data through the registry.** Wells + curves from `geo_wells` /
   `geo_wells_logs` (via `src/lib/wellsRegistry.js`); **tops are
   `geo_wells_tops` rows**, zones are `geo_wells_zones`. Picking or
   dragging a top writes the row — no app-private tops copy, so
   Seismolord/Mapping see edits immediately. This is the cross-app
   acceptance criterion, not a nicety.
2. **Tops CRUD (new, minimal) on the shared service**: add
   `saveTop` / `updateTop` / `deleteTop` (per-top, owner-only) and
   `propagateTop` (create a same-named top on other owned wells at a
   given MD) to `src/lib/wellsRegistry.js`. `replaceTops` (G1) stays
   for bulk import. RLS is already proven for `geo_wells_tops` (pentest
   blocks 1–2); the per-top writes use the same owner-only policies —
   **no schema change to the tops table**.
3. **Section state is app-private**: a new `geo_correlation_sections`
   table (product-family prefix `geo_`, owner-only RLS like
   `petro_projects`): name, `well_ids uuid[]` (the ordered section),
   `datum jsonb` (mode structural|flatten-on-top, top name, datum
   depth), `track_layout jsonb`, `created/updated`. Small jsonb, owner
   writes only. Shared-table review bar does NOT apply (it is
   app-private, not a registry child) — but it ships with a live RLS
   pentest all the same.
4. **Datum flattening, validation-first.** `engine/section.js` (plain
   JS + JSDoc, pure): structural view (TVDSS or MD as-is) and
   **flatten-on-top** (each well shifted so the chosen top sits on the
   datum line; wells lacking that top are drawn un-flattened and
   flagged, never silently mis-hung). Depth→screen mapping, per-well
   track geometry, zone-fill spans between two correlated tops. The
   flattening arithmetic is exact/closed-form, so validation is
   **hand-derivable analytic jest cases + a synthetic 3-well golden**
   (the wellPath/wellImport precedent) — NOT a heavy Python oracle
   (there is no numerical method to cross-check, unlike Archie/lasio;
   documented in the fixtures README so the choice is explicit).
5. **Tops propagation** is an explicit action: pick "Top Dome" on well
   A, propagate to the section's other wells at their nearest sensible
   MD (v1: same MD, user drags to correct — no auto-correlation
   guessing; auto-correlation is later scope). Every propagated top is
   a real `geo_wells_tops` row the user can then drag.
6. **UI: workstation on the shared shell** (`WorkspaceShell`, the
   WDM/Petrophysics idiom): left explorer = registry wells with a
   **map well-path picker** (surface X/Y, click to order the section);
   center = the cross-section (canvas, dark viewport — a viewport, not
   an analytic chart) with per-well track columns, a datum control,
   correlation lines drawn between same-named tops, draggable top
   markers, zone fills; right dock = section/track settings + tops
   list. Injected backend pair (registry + in-memory) so
   `/dev/well-correlation` drives the full app authless; e2e per the
   roadmap ("synthetic logs").
7. **Catalog**: `master_apps` row (Geoscience, `well-correlation`,
   template-copy) flipped Active only at close-out with the route in
   the same PR (the deploy lesson). `well-correlation-tool` stays
   Archived; its route redirects to the successor.

## Schema sketch (G3.1 migration, staging-first)

```
geo_correlation_sections: id, user_id FK cascade, name,
  well_ids uuid[] , datum jsonb, track_layout jsonb,
  created_at, updated_at
  RLS: owner-only all ops (the petro_projects pattern). Index (user_id).
```

No change to `geo_wells_tops` / `geo_wells_zones` — G3 reads/writes the
existing rows through new per-top service functions.

## Phases

- **G3.0 — Section engine + goldens** *(small-medium)*:
  `engine/section.js` (datum flattening, depth→screen, zone spans,
  correlation-line pairing) + analytic jest cases + a deterministic
  synthetic 3-well fixture + committed goldens + a fixtures README that
  documents WHY there is no Python oracle here. Accept: goldens
  regenerate identically; flatten-on-top arithmetic exact.
- **G3.1 — Tops CRUD + section table + pentest** *(small)*:
  `saveTop`/`updateTop`/`deleteTop`/`propagateTop` in wellsRegistry;
  `geo_correlation_sections` migration; MIGRATIONS.md; **live RLS
  pentest** (owner-only section rows; per-top writes owner-only via the
  existing tops policies; org-shared well's tops read-only).
- **G3.2 — Cross-section workstation** *(large)*: shell, map well-path
  picker, per-well track columns, datum control (structural /
  flatten-on-top), tops pick + drag + propagate, zone fills,
  correlation lines; `/dev/well-correlation` harness (seeded 3-well
  synthetic section) + e2e (pick + flatten + drag across ≥3 wells).
- **G3.3 — Cross-app + close-out** *(small-medium)*: verify a top
  picked here appears in Seismolord section overlays (live smoke +
  its e2e untouched-green); delete the ~65-file legacy cluster + the
  App.jsx provider; app page + route + Active tile in one PR; redirect
  the legacy slug; STATUS + roadmap docs.

## Risks

- **Deleting the orphaned cluster**: 61-file capital-C dir + context +
  3 hooks + TrackConfigurationContext + `data/wellLogs.js` — verify
  importers file-by-file before each delete (the G2.6 discipline;
  `components/crossplot` was the trap there). The provider wraps the
  whole app, so its removal touches App.jsx structurally — build +
  full e2e must stay green.
- **Shared tops writes**: per-top edits are load-bearing for Seismolord
  and G4. Defense: reuse the proven `geo_wells_tops` RLS (no policy
  change), pentest the per-top path, and the cross-app smoke in G3.3.
- **Scope gravity**: auto-correlation / machine top-picking is a
  well-known infinite hole — explicitly OUT of v1 (manual pick + drag +
  propagate only), growth against goldens later.

## Open questions for sign-off

1. **Tops propagation v1 = manual** (same-MD seed + user drag, no
   auto-correlation) — confirm, or do you want a simple nearest-peak
   snap in v1?
2. **Section persistence** in a new app-private `geo_correlation_sections`
   table (recommended) vs keeping section state client-only in v1.
   Confirm the table.
3. **Legacy cluster deletion**: remove the whole orphaned capital-C
   `wellCorrelation/` subsystem + context + hooks in this phase
   (recommended — it's dead weight and confuses the codebase) vs leave
   it untouched. Confirm delete.
4. **`well_correlation_projects` / `well_correlation_wells` tables**
   (WellCorrelationPanel's own tables): leave in place (row-preserving,
   the QuickVol spirit) and log for the DB-cleanup effort — confirm.
