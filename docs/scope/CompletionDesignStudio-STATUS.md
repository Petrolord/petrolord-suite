# Completion Design Studio — STATUS

App: Drilling module, fresh slug `completion-design-studio`
(Drilling-ROADMAP.md §4 D7). Completion string architecture on the wp data
spine: stack-up, run-in clearance, through-bore access, volumes, seal
space-out, schematic + BOM, and nodal tubing sizing. Absorbs the
Production Well Schematic Designer and the CTDP completion markers.
Built 2026-08-28 (waves CD0-CD3, one Suite PR + engines PR #47).

## What shipped

- **Engine** (`@petrolord/engines` PR #47, subtree-pulled;
  `packages/engines/engines/drilling/completionDesign.js`):
  - `apiDriftM` — API 5CT standard drift mandrel diameters with the EXACT
    inch-fraction deductions (3/32" tubing; 1/8" casing ≤ 8-5/8", 5/32"
    9-5/8"–13-3/8", 3/16" ≥ 16"); published spot 9-5/8 47# → 8.525".
  - `buildStack` — telescoping tally from the hanger; `casingProgramProfile`
    — innermost-EXPOSED bore vs MD (liner overlaps resolved to the
    smallest covering ID), per-segment drift; `governingDriftTo` gap-aware.
  - `runInClearance` — each component's OD vs the min drift over its WHOLE
    run-in path [0, bottom], controlling casing section named,
    PASS/WARN/FAIL (warn margin 3 mm default).
  - `throughBoreProfile` — cumulative min ID from surface (largest tool OD
    reaching each depth) with the controlling restriction named.
  - `completionVolumes` — breakpoint-exact integration: string capacity,
    annulus above packer vs the exposed bore, below-packer rathole,
    closed-end displacement; uncased intervals skip WITH a warning.
  - `sealSpaceOut` — PBR stroke remaining vs expected ΔL (direction-aware:
    contraction spends insertion, elongation spends remaining bore).
  - `data/completionEquipment.js` — planning catalog: published X/XN
    nipple seat bores + API 5CT EUE coupling ODs; jewelry/packer/PBR rows
    are customary planning values, EVERY row `approx: true` (vendor data
    sheets govern; L14 arms on an owner vendor data book).
- **Validation**: independent numpy oracle
  (`tools/validation/drilling/oracle_completion.py`, byte-identical
  reruns; volumes cross-checked by brute-force 1 cm slicing vs the JS
  breakpoint integration) with pre-write self-asserts (drift spot values,
  the ID²/1029.4 capacity identity vs SI geometry, telescoping stack,
  monotone governing drift). Golden: 3-1/2" completion (SSSV, SPM,
  sliding sleeve, packer, XN, perf joint, WEG) in the D6 golden 9-5/8"
  two-section casing + a 7" 29# liner on the slant well. 20 engines jest
  gates; suite runner **A24-A25 ACTIVE (25/25 total pass)**; **L14 ARMED**.
- **Data model** (migration `20260828100000`, applied live 2026-08-28,
  rollback-wrapped dry run + JWT RLS probes pass): `wp_cd_cases`
  (string/casing_program/params jsonb, `ct_case_id` FK to the D6 case the
  program was snapshotted from) + `wp_cd_runs` (immutable,
  insert-own+delete-own). Trajectory = definitive `wp_designs` stations
  via the D1 tdApi re-export.
- **App** (`src/pages/apps/CompletionDesignStudio/`): CdWorkstation on
  WorkspaceShell with the injected-backend pattern (page = wp, harness =
  in-memory); results recompute synchronously through pure
  `services/cdRun.js` on every edit. Tabs: String & Program (ordered
  component table with live stack-up MDs, catalog picker with custom
  vendor-dims row, casing program snapshot-from-ct-case or manual
  sections, grouped BOM + CSV), Schematic (to-scale SVG on the white
  chart standard: casing walls/shoes, type glyphs, packer slips, perf
  marks, TD, labeled jewelry; PNG export), Checks (clearance table with
  controlling string, through-bore table, volumes, PBR space-out card,
  RP 14E erosional card, immutable run history), Tubing Sizing (every
  API 5CT tubing size screened via the Production nodal VLP engine
  `src/utils/nodal` — `bhpFromWhp` per candidate ID over the real
  trajectory; deliberate cross-module reuse, owner-locked). PASS/WARN/
  FAIL banner in the ribbon; Save/Duplicate/Delete + Ctrl+S; runs to
  `wp_cd_runs`.
- **Absorptions**:
  - Production **Well Schematic Designer** DELETED (8 files ~647 LOC:
    the page, `src/components/wellschematic/`, the global
    SchematicContext): audited as a drag-and-drop toy (div renderer, no
    dimensions, no persistence, ungated route). Route now redirects to
    the Studio; tile ARCHIVED in the held migration; allApps updated
    (slug removed, completion-design-studio added). Its BOM PDF
    one-pager was deliberately NOT lifted: the Studio exports BOM CSV +
    schematic PNG instead. react-dnd deps KEPT (NetworkDiagramPro uses
    them).
  - CTDP **completion markers** deleted (CompletionComponentsList +
    AddCompletionComponentDialog); TubingDesignTab cross-links here;
    TubingVisualizer ignores legacy `components` on old saved cases.
    PackerConfigPanel STAYS (it drives the D6 force system).
  - Solutions marketing copy: WSD removed from Production, Drilling app
    list refreshed to the shipped Studio names.
- **Tests**: 14 suite jest (cdRun closed loop vs goldens + help guide);
  e2e `e2e/completion-design-studio.spec.js` (4 specs) recomputing
  expectations via cdRun + engines on `/dev/completion-design`.
- `/help` guide (CompletionDesignHelpGuide, EPE pattern, no em dashes,
  honesty markers: nominal dims, geometric access only, sizing is a
  screen not a nodal match).

## Held for the program launch (single-upload gate)

- Tile migration `20260828120000_seed_completion_design_studio_tile.sql`
  (seed Active Drilling tile + archive well-schematic-designer) — apply
  with the ONE prod upload that ships all 12 D&C apps. Dry-run proven.

## Out of scope (v1, documented in the help guide)

- Sand control screen/gravel sizing (D8), stimulation strings (D9),
  intelligent completions/ICDs, multilaterals, APB and sour-service
  derating, coiled tubing/intervention planning, lift design (Production
  module), nodal operating-point matching (cross-link), vendor-exact
  equipment dimensions (custom components + L14 cover this).
- Wireline access is geometric only (no tool length/drag modeling).

## Observed, not fixed here (Production module scope)

- The three nodal slugs (`nodal-analysis-studio` and aliases) mount
  UNGATED in App.jsx; `well-schematic-designer` was too before D7
  removed it. Flagged for a Production-module hygiene pass.

## Staging E2E checklist (owner)

1. Open Drilling → Completion Design Studio; pick a site/wellbore with a
   definitive design; create a case.
2. String & Program: snapshot a Casing & Tubing case as the program, add
   a 7" liner string manually, and watch the clearance basis change.
3. Add an SPM from the catalog; confirm run-in clearance names the liner
   as controlling and flags it if the liner is small.
4. Checks: XN nipple should control the through-bore; volumes should
   move when TD moves; enable the PBR card and push expected ΔL past the
   stroke to see FAIL.
5. Tubing Sizing: raise the rate until small tubing burns hundreds of
   psi in friction; confirm the in-string row highlight.
6. Schematic PNG + BOM CSV export; save, duplicate, reload round-trip.
7. Legacy: /dashboard/apps/production/well-schematic-designer must
   redirect here.
