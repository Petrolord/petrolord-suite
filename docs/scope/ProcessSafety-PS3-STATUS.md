# QRA Studio (PS3) status

Phase: PS3 (ProcessSafety-ROADMAP.md)
Status: **BUILT 2026-09-21** (branch feat/ps3-qra-studio). Code only: both
migrations are written and NOT APPLIED (owner-run), the tile is still Coming
Soon, and production gets the route with the next upload.

The Process Safety module's third application and the live counterpart of
NextGen course H5 `qra` (NextGen-Remaining-Courses-PLAN.md section 14). With
it, every tile the PS0 seed created has an app.

## What it answers

How often each outcome of a loss of containment happens, the probability it
kills a person at each place, the risk at each place (LSIR) and to the most
exposed person (IRPA), the expected deaths per year (PLL) and the FAR, how
often N or more die at once (F-N) against a criterion, the ALARP band of
each risk, and whether a measure is grossly disproportionate to the risk it
removes.

## The engine

`packages/engines/engines/hse/qra.js`, from petrolord-engines PR #230 (merged
abb41c3). 171 engine tests against an independent Python oracle and the
published Purple Book Appendix 6.B, R2P2 para 128 box and App. 3 para 13,
HSE CBA checklist worked example and Bevi art. 13(1)(b) values; negative
controls including six for the prototype chain fail-opens closed before
merge. Record: `packages/engines/tools/validation/hse/FINDINGS-qra.md`. The
app imports it through the one-line shim
`src/utils/processSafety/engine/qra.js`.

qra.js imports `consequence.js` (H4 probits, plume, solid flame),
`safetyStats.js` (RATE_BASES.FAR_100M), `lopa.js` (HOURS_PER_YEAR) and the
canonical `npv` of `engines/economics/cashflow.ts`. All four were already
vendored and are unchanged in this range. No NPV or Monte Carlo is written
in the app.

| Engine | Used for |
|---|---|
| `flammableReleaseEventTree`, `pbDirectIgnitionProbability` | event tree outcomes and the Table 4.5 direct ignition; register scenarios link to an outcome |
| `pbFatalityFractions` | Pd of a register cell from a dose (fire flux and duration, flash fire envelope, overpressure, toxic probability) and the day or night fraction indoors |
| `locationIndividualRisk`, `individualRiskPerAnnum` | LSIR per location with contributions; IRPA from hours and vulnerability |
| `alarpBand` | the band of every LSIR and the IRPA (R2P2 workers, public, or given limits); the band limits drawn on the chart |
| `potentialLossOfLife`, `fatalAccidentRateFromPll` | PLL with contributions; FAR from exposed hours |
| `fnCurve`, `fnCriterionComparison` | the F-N points, the checks and exceedance ranges; the criterion line is sampled by the same function |
| `thermalFatalityTransect`, `lsirTransect` | Pd along a transect from heat fluxes; LSIR along it and the PB contour crossings |
| `costBenefit` | PV benefit and cost (canonical npv), cost / benefit, DF x benefit, ICAF, verdict |

The app restates no formula. Its own arithmetic is (1) unit conversion at
the edge (kW/m2, kPa, percent), (2) a PLL reduction as the register PLL
less the PLL after a measure, labelled, (3) which PB contour a value lies
inside (a comparison with the engine's list), and (4) the points the charts
are drawn on.

## Vendoring

File by file from canonical df31f53 to 16fd6c9 in two commits, VENDOR.json
pinned to 16fd6c9, VENDOR.manifest regenerated from `git ls-tree`:

- df31f53..abb41c3 (9 paths: 6 added, 3 modified): engines #230, the QRA
  engine, plus #229 (two downstream copy strings, no figure moves).
- abb41c3..16fd6c9 (82 paths: 81 modified, 1 added): engines #231, every
  preset, table and registry lookup asks for an own property, so an
  inherited name (constructor, toString, __proto__) is refused by name. No
  golden moved. This is the Suite re-vendor for #231, and it closes the
  exposure.js and consequence.js lookups FINDINGS-qra section 9 handed on.

Guard `node tools/check-vendored-engines.mjs --canonical
/root/petrolord-engines`: manifest verified, 881 paths byte for byte, 0
deviations.

## The app

Route `/dashboard/apps/process-safety/qra-studio` (ProtectedAppRoute
`qra-studio`), help at `.../help`. The PS1/PS2 studio shell: saved-study
selector and autosave, a scope notice, five tabs.

- **Register.** Scenarios (frequency typed or from an event tree outcome,
  expected deaths N, effect, fire duration); locations (criterion, day or
  night, hours of the most exposed person, vulnerability); a Pd for every
  scenario at every location, typed or by the Purple Book rule from a dose.
- **Event tree.** Initiating frequency; immediate ignition typed or from PB
  Table 4.5 (release type, rate or mass, substance); delayed ignition; the PB
  0.6 / 0.4 split or a given one; the outcome table.
- **Individual risk.** LSIR per location with the largest contributor, the
  PB contour and the ALARP band (with "at the limit" when it is); IRPA with
  its band and ratios; the IR against the ALARP bands chart for one
  criterion; the transect chart with the contour crossing table.
- **Societal risk.** PLL with contributions, FAR, the F-N staircase against
  the PB/Bevi line, the R2P2 para 136 point or a given line, the checks with
  ratios and the N range above the line.
- **ALARP and cost-benefit.** Every band in one table with the band legend
  and a one line reading; the gross disproportion test with DF, VPF, other
  harms, life, capital and annual cost and the three rates; PV benefit and
  cost, DF x benefit, ICAF and the verdict.
- **Refusals.** Printed in the engine's words with the field, and no number
  beside them; a scenario linked to a refused event tree says so.
- **The opening study** is illustrative (a gas line and an H2S source, three
  locations) and its measure IS the HSE checklist worked example (9,284 on
  screen, printed 9,283; 92,835 against a 93,000 cost at DF 10, so
  GROSSLY_DISPROPORTIONATE).
- **Charts** on the Suite standard (white chartTheme, ChartLogo); each
  wrapper forwards width and height to its ResponsiveContainer.

## Persistence

`ps_qra_studies` (migration 20260921100000), the ps_lopa_studies /
ps_consequence_studies pattern: one row per study, scoped to the
ORGANIZATION, payload jsonb holds the inputs only, results recomputed on
open, stamped through `src/lib/stateVersion.js` (kind `ps-qra-study`).

No command was run against the linked or production project. Both files
were checked on a local scratch Postgres 16 with stubbed membership helpers:
idempotent re-run; author insert with created_by defaulted; a second member
reads and updates (author kept) but cannot delete; forged author refused;
move between organizations refused by the trigger; an outsider reads 0,
updates 0, cannot insert; anon has no grant; the org admin deletes; RLS on
with 4 policies; the tile migration alone is a notice and a no-op, and after
a stand-in seed flips only the Process Safety qra-studio row. The owner's
rollback-wrapped dry run against the linked project is in the PR body.

Not done here (as at PS1 and PS2): `ps_qra_studies`, like `ps_lopa_studies`
and `ps_consequence_studies`, is not in the .pld portability families nor in
the org data export.

## Pricing

None. The module was priced at PS1 (1,999, migration 20260919230000), and a
module price includes its apps. The registration test pins that PS3 adds no
price.

## Engine observations while wiring

No numeric defect was found in qra.js. Two small points for the engines
repository, neither blocking:

1. `individualRiskPerAnnum` names `locations[i].occupancyFraction` when a
   location gives neither occupancy nor hours, although this caller only
   ever sends hours. The message itself asks for either.
2. `thermalFatalityTransect` applies the chosen probit at the given time,
   while `pbFatalityFractions` (the register) uses the purple-book probit
   capped at 20 s and takes P = 1 at 35 kW/m2 and above. Both follow their
   documented contracts; the studio defaults the transect to purple-book at
   20 s and says so on screen.

## Tests

- `src/utils/processSafety/__tests__/qraStudy.test.js` (36): the shim is
  the vendored engine and exports no H4 or Facilities function and no npv;
  the canonical npv is what discounts; the HSE CBA checklist example and a
  PB Appendix 6.B study through the studio; the default study equals direct
  engine calls; the boundary rule at 1e-3, 1e-6, 1e-4 and DF x benefit;
  refusals by field; event tree linking; save and restore.
- `src/utils/processSafety/__tests__/qraStudiesService.test.js` (6).
- `src/pages/apps/__tests__/qraStudio.smoke.test.jsx` (18): every tab,
  refusals shown with no number, the event tree moving the register, the
  lower band at 1e-3, EXCEEDS on a tighter line, the checklist example on
  screen, the help guide.
- `src/components/processsafety/__tests__/qraCopy.test.js`: owner copy rule
  over every PS3 user-facing file.
- Registration: `processSafetyRegistration.test.js` PS3 block.

## Owner steps, in order

1. Apply `20260921100000_ps3_qra_studies.sql` (not deploy-gated).
2. Upload the build carrying `/dashboard/apps/process-safety/qra-studio`,
   and serve that route on the deployed site.
3. Apply `20260921110000_ps3_activate_qra_tile.sql`.
4. Then the NextGen H5 go-live, held until the route serves.

No function deploy and no pricing step.
