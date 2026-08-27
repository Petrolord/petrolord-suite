# Well Integrity & P&A Studio — status

Drilling D10 (Drilling-ROADMAP.md §4). Fresh slug `well-integrity-pa`,
route `/dashboard/apps/drilling/well-integrity-pa` (gated
ProtectedAppRoute). The archived `well-abandonment-plan` mock is
superseded (tile description repointed in the held seed). SHIPPED
2026-08-28.

## What it is

Life-of-well integrity and abandonment planning on the wp data spine:
barrier envelope verification, annulus pressure limits on the definitive
trajectory, balanced cement plug design and the phased abandonment
program.

- **Engines** (@petrolord/engines `engines/drilling/wellIntegrity.js` +
  `plugAbandonment.js`, engines PR #51 stacked on #49):
  - NORSOK D-010 two-barrier envelope verification: element status
    roll-up (failed dominates, not-verified degrades), common-WBE
    flags, rule checks, and the Norsk olje og gass 117-style
    traffic-light category as a pure 16-row decision table.
  - Element-governed MAASP and API RP 90-style MAWOP in the
    differential hydrostatic form P = f*limit - (rho_ann -
    rho_backup)*g*TVD; RP 90 convention factors 0.50/0.80/0.75 by role,
    overridable; governing element named; negative headroom flagged.
  - Balanced cement plug closed forms (slurry, balanced height, spacer
    balance, displacement, plugged top after POOH; zero-excess
    identity), D-010-style rule checks (100 m / 50 m on foundation /
    50 m above source / surface 50 m / annular 30 m verified vs 100 m),
    and the abandonment program: per-zone two-barrier compliance
    (source-covering primary + above-source secondary), phased steps,
    material takeoff.
- **Data spine**: `wp_wi_cases` + immutable `wp_wi_runs` (migration
  20260828220000, applied live, RLS probed). Optional ct_case_id /
  cd_case_id links. Annulus element MDs convert to TVD via the exact D3
  `tvdAt` on the definitive design.
- **Workstation** (WiWorkstation on WorkspaceShell, injected backend):
  Barriers (envelope editor, traffic light, checks), Annulus Pressure
  (per-annulus limiting elements, MAASP/MAWOP cards + chart), P&A Plugs
  (plug editor, balanced placement card, per-zone rule checks), Program
  (zones, compliance, phased checklist, slurry takeoff, EPE
  decommissioning cross-link, immutable run history). White chartTheme +
  ChartLogo.

## Validation

- Independent oracle `oracle_wellintegrity.py` self-asserts BEFORE
  writing `wellintegrity_cases.json`: the full 16-row category truth
  table, the 20,665,739 Pa MAASP hand value, the three-candidate MAWOP
  governing fixture, the 1820 m plugged-top hand case + spacer-balance
  and zero-excess identities, the rule tables, and the 2-zone program
  fixture (reservoir pass / intermediate fail).
- Runner gates **A30 + A31 ACTIVE (31/31 total)**; **L19** (NORSOK D-010
  tables) + **L20** (API RP 90 worked example) **ARMED** on owner PDFs.
- Suite jest: wiRun closed loop (7) + help gates (3); engines jest 13.
  Playwright `e2e/well-integrity-pa.spec.js` (5 specs) recomputes
  expectations through wiRun + vendored engines on `/dev/well-integrity`.

## Honesty markers (also in the /help guide)

- Status roll-up and rules only: the envelope drawing (geometric closure
  around the source) stays with the engineer.
- Rule defaults are the commonly cited NORSOK D-010 rev 4 conventions;
  the standard documents (D-010, API RP 90) govern; factors overridable.
- A planning checklist, not an operational procedure or regulatory
  submission; slurry design belongs to the cementing program.
- Wear/corrosion/temperature derating is applied by the user on the
  entered limits.

## Held for the program launch (single-upload gate)

- Tile migration `20260828230000_seed_well_integrity_pa_tile.sql` (seed
  Active Drilling tile + repoint the archived well-abandonment-plan
  description) — apply with the ONE prod upload that ships all 12 D&C
  apps. Dry-run proven 2026-08-28.

## Out of scope (v1, documented in help)

- Geometric envelope closure checking, SCP diagnostics (bleed/lube
  tests), tubing/casing leak-rate models, section milling / PWC design,
  cut-and-pull force estimates, barrier qualification test procedures,
  liner-lap and dual-string plug geometries.

## Staging E2E checklist (owner)

1. Open Drilling -> Well Integrity & P&A Studio on a wellbore with a
   definitive design; create a case and confirm the traffic light is
   green on the seeded element set.
2. Fail the DHSV and watch the well turn orange; fail the wellhead too
   and watch it turn red with the FAIL banner.
3. Annulus Pressure: raise the annulus fluid density and watch MAWOP
   fall; confirm the governing element switches on the chart.
4. P&A Plugs: shorten a plug below 100 m (no foundation) and watch the
   rule check fail; set a mechanical foundation and watch 50 m pass.
5. Program: confirm each flow zone lists its primary and secondary
   plugs; remove the secondary and watch the zone fail; check the
   takeoff total.
6. Save, duplicate, reload round-trip; save a run into the immutable
   history; open the Economics cross-link.
