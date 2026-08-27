# Perforation & Sand Control Designer — status

Drilling D8 (Drilling-ROADMAP.md §4). Fresh slug
`perforation-sand-control`, route
`/dashboard/apps/drilling/perforation-sand-control` (gated
ProtectedAppRoute). SHIPPED 2026-08-28.

## What it is

The sandface completion designer on the wp data spine: which gun, what it
does to productivity, how much underbalance, whether the formation needs
sand control, what gravel and screen, and how much drawdown the rock
takes before sanding.

- **Engines** (@petrolord/engines `engines/drilling/perforation.js` +
  `sandControl.js`, engines PR #48): Karakas-Tariq SPE 18247 skin
  (published phasing constant tables; plane/vertical/blockage/crushed
  components; development-range warnings), steady-state productivity
  ratio, underbalance guideline BANDS by permeability class (ranges, not
  points), sieve statistics (retained convention, log-linear D-values,
  44 um fines, no extrapolation), Saucier 5-6x gravel sizing vs the
  US-mesh catalog, gravel-pack screen gauge below the smallest grain +
  Coberly standalone window, Tiffin-style advisor ladder (thresholds
  printed), Kirsch sanding-onset CDP sweep
  (pwf,crit = (3 S1 - S2 - U)/2, geometry-dependent stress pair,
  boost factor for TWC calibration, screening-grade flagged).
- **Catalogs** (planning-level nominal, approx-flagged, provenance
  headers): 9 API RP 19B-style gun rows (through-tubing 1-11/16 to
  2-7/8; casing 3-1/8 to 7 big-hole; phasings restricted to the SPE
  18247 table angles), 7 dual-mesh gravels, standard wire-wrap gauges.
- **Data spine**: `wp_ps_cases` + immutable `wp_ps_runs` (migration
  20260828140000, applied live, RLS probed). Case links `ct_case_id`
  (D6 casing program snapshot) and `cd_case_id` (D7 completion for
  through-tubing clearance). Sanding curves come from the published
  gm-1.0.0 SHMIN/SHMAX/UCS + pp-1.0.0 PP/OBG logs via the wellbore's
  geo well (prepPs pickers; honest missing-curve messages).
- **Workstation** (PsWorkstation on WorkspaceShell, injected backend):
  Interval & Sand (interval, sieve table + CSV paste, PSD semilog chart
  w/ Saucier band overlay, D-stats), Perforating (gun picker w/
  clearance PASS/WARN/FAIL naming the controlling bore or string, K-T
  breakdown, PR + nodal cross-link, underbalance band), Sand Control
  (advisor ladder, Saucier + catalog match, gauges), Sanding (CDP chart,
  governing point, run history). White chartTheme + ChartLogo.

## Validation

- Independent numpy oracle `oracle_perfsand.py` self-asserts hand
  arithmetic BEFORE writing `perfsand_cases.json` (K-T 90 deg hand case,
  0 deg lp/4 limit, exact log-linear sieve percentiles, Saucier 120 um
  -> 20/40 spot, 16-thou gauge, Kirsch closed form).
- Runner gates **A26 + A27 ACTIVE (27/27 total)**; **L15** (SPE 18247 /
  Economides worked example + vendor gun data) and **L16** (Tiffin SPE
  39437 + King/Behrmann underbalance criteria) **ARMED** on owner PDFs.
- Suite jest: psRun closed loop vs goldens (9 tests) + help gates (3);
  engines jest 21 tests. Playwright
  `e2e/perforation-sand-control.spec.js` (4 specs) recomputes
  expectations through psRun + vendored engines on
  `/dev/perforation-sand-control`.

## Honesty markers (also in the /help guide)

- Gun and gravel dims are nominal planning data; vendor sheets govern.
- Underbalance is deliberately a range; point correlations arm on L15/L16.
- Sanding is screening grade: boost factor defaults to 1, calibrate to
  TWC; no sand-rate prediction.
- Tunnel radius = entrance hole / 2, length = API-target penetration
  (documented planning assumption).
- Rates/nodal matching stay in Production (PR ratio only, cross-link).

## Held for the program launch (single-upload gate)

- Tile migration `20260828160000_seed_perforation_sand_control_tile.sql`
  (seed Active Drilling tile) — apply with the ONE prod upload that
  ships all 12 D&C apps. Dry-run proven 2026-08-28.

## Out of scope (v1, documented in help)

- Gravel-pack pumping schedule / alpha-beta wave placement, frac-pack
  design (D9), ICD/AICD screens, chemical consolidation, TWC lab
  calibration (input knob only), transient cleanup, gun shock/string
  dynamics, vendor-exact charge performance.

## Staging E2E checklist (owner)

1. Open Drilling → Perforation & Sand Control; pick a wellbore with a
   definitive design; create a case.
2. Paste a lab sieve; watch D50/C_u/fines and the PSD chart update.
3. Perforating: link a Completion Design case; a 2-7/8" through-tubing
   gun should FAIL an XN-nipple completion while 2-1/8" passes; snapshot
   a Casing & Tubing case and switch to a casing gun to see the drift
   basis take over.
4. Confirm a deep-penetrating 12 spf gun goes skin-negative and the PR
   crosses 1; enable the crushed zone and watch it come back.
5. Sand Control: confirm the advisor thresholds and the Saucier band
   land on a standard mesh with a gauge below the smallest grain.
6. Sanding: needs published SHMIN/SHMAX/UCS + PP/OBG for the wellbore's
   geo well (publish from Geomechanics and Pore Pressure Studios); drop
   UCS or raise the interval to see the margin shrink.
7. Save, duplicate, reload round-trip; save a run and see it in the
   immutable history.
