# Recovery Factor Estimator: upgrade working doc

App #10 of the Reservoir round (`docs/scope/AppUpgrade-Reservoir-PLAN.md`).
Route `/dashboard/apps/reservoir/recovery-factor-estimator`, harness
`/dev/studio/recovery-factor`. Branch `feat/rf-u1`. Finding IDs `RF-U1-nnn`
(Step 1) and `RF-U2-nnn` (Step 2).

Code: page `src/pages/apps/RecoveryFactorEstimator.jsx`, state
`src/contexts/RfEstimatorContext.jsx`, panels `src/components/rfestimator/`,
model, units, intakes and report `src/utils/rfestimator/`, engine
`src/utils/recoveryFactorCalculations.js` (Suite-side; it is not in the
canonical engines library, so no engines PR applies to this round), help
`src/components/reservoir/RecoveryFactorHelpGuide.jsx`, table
`saved_rf_projects` (under the record sharing rules since migration
`20261002130000`, applied 2026-10-02). No migration is needed.

## Step 1 results

Severity: S1 a wrong number a user would act on; S2 a reviewer cannot sign
or a claim without its event; S3 friction; S4 polish. Run in a real browser
(Playwright, 1366x768, 1440x900, 390x844, light and dark, on the harness)
and in the code.

### The checks

| Check | Result | Evidence |
|---|---|---|
| PL1 labels mean the textbook | F, fixed | RF-U1-001 (k in darcies, S1), RF-U1-003 (range edges called P90 to P10), RF-U1-015 ("Recoverable Reserves" for a technically recoverable volume) |
| PL2 hostile files | NA | The app has no import door. Its intakes are by id from saved records (RL11) |
| PL3 units, datums | F, fixed | Oilfield only (RF-U1-008). Now on the Suite unit profile; every field, card, chart axis and the PDF in the display unit; one known value per conversion pinned (11 kinds). Pressures stated absolute with no datum correction (plan: label only) |
| PL4 no claim without the event | F, fixed | Silent clamp (RF-U1-002); a saved API project's number moved with no word (RF-U1-013) |
| PL5 real saved state | P after fix | A version 1 payload opens with its inputs unchanged (test); payload version 2 carries identification, sources, unit system and both intake records; autosave never writes a read-only project |
| PL6 real browser | P | Three viewports, both themes: no page error, no sideways scroll, the chart on white with the mark, no em dash (e2e `recovery-factor-upgrade`) |
| PL7 signable report | F, fixed | No export of any kind (RF-U1-005). Report on the kit, read back in jest and in the e2e |
| PL8 practitioner's day | Pa | Walked as a reserves engineer: typed volumetrics, choose drive, compare correlation to range, take OOIP from material balance, write the report. Missing for that persona: an uncertainty distribution and a sender into ReservoirCalc Pro (Step 2, RF-U2-001 and -002) |
| PL9 the chain | P after fix | mbal-1 (Material Balance), ReservoirCalc Pro saved project and pvt-1 (Fluid) read by id on the harness in the e2e; `.pld` round trip with the intake ids declared |
| PL10 real scale | NA | One case, a few inputs |
| PL11 typable inputs | P after fix | Every converted field on the shared draft hook (`useDraftInput`); "2." and "-" survive in SI (jest and e2e). Unit-draft guard stays at zero |
| PL12 house standards | Pa, fixed | Missing printed "-" (RF-U1-014); copy without em dashes or contrastives; EMPTY_VALUE; white chartTheme and ChartLogo kept; route protected (re-checked) |
| RL1 inputs with unit and source | F, fixed | RF-U1-006, -007; completeness guard on the engine input with its negative control |
| RL2 composite inputs by components | Pa, fixed | RF-U1-016 (OOIP by GRV, NRV, PV, HCPV) |
| RL3 lumped results split | Pa, fixed | RF-U1-017 (the correlation by its factors, closing on the product to machine precision; p/z and trapped gas by their steps) |
| RL4 identification | F, fixed | RF-U1-007 |
| RL5 data and operations | NA | No production data enters the estimate |
| RL6 every result has its plot | F, fixed | Three figures: recoverable volume bars (the screen bars, point counts held), the analog ranges of the phase with the estimate line, the correlation factors or the p/z line or a "does not apply" statement |
| RL7 basis named | Pa, fixed | RF-U1-015 |
| RL8 strengths kept, claims honest | Pa, fixed | RF-U1-002, -011 (the validation state of each method printed) |
| RL9 limits printed | Pa, fixed | RF-U1-004, -009 |
| RL10 import doors | NA | No file door |
| RL11 intakes with senders | F, fixed | RF-U1-010 |
| RL12 one model | F, fixed | `deriveRf` serves the screen, report and saved project; RF-U1-018 |

### Findings

| ID | Sev | Check | Finding | State and proving test |
|---|---|---|---|---|
| RF-U1-001 | S1 | PL1 | The API (Arps et al. 1967) correlations are written for permeability in darcies (as restated in Ahmed, Reservoir Engineering Handbook); the engine fed the typed md value straight in. The solution-gas estimate was 1000^0.0979 = 1.97 times too high (sample 34.8 percent, published form 17.7) and the water-drive estimate 1000^0.0770 = 1.70 times (sample 72.0 percent, published form 42.3). The T1 e2e had pinned 72.0. | Fixed: k typed in md, divided by 1,000 in the engine; `recoveryFactorValidation.test.js` (negative control on the pre-fix engine: 9 of 15 fail) |
| RF-U1-002 | S2 | PL4, RL8 | Every method clamped RF to 1 to 95 percent with no word: a p/z case with abandonment above the initial pressure showed 1.0 percent; an equation above 95 percent showed 95.0. | Fixed: no clamp; outside 0 to 100 percent is withheld with its reason; above or below the analog range is flagged; gate "no silent clamp", e2e PL1 |
| RF-U1-003 | S2 | PL1, RL9 | Analog ranges cited as "industry literature"; the help called Low and High "P90 to P10". | Fixed: the source line says transcribed and not validated, typical is the app's choice, Low and High are range edges; validation test, help guard |
| RF-U1-004 | S2 | RL9 | No input was checked against the domain of its method: abandonment above the bubble point, a porosity typed as 22, Sgr above the gas saturation all computed silently; a correlation used under another drive was not flagged. | Fixed: `correlationInputFlags`, `volumetricInputFlags`, drive mismatch; screen, field border and report; tests "domain flags" |
| RF-U1-005 | S2 | PL7, RL4, RL6 | No report, no export of any kind. | Fixed: Report tab and PDF on the kit (5 pages oil reviewer case); `rfReport.test.js` (3 goldens, completeness guard, figures drawn, closure), e2e report door |
| RF-U1-006 | S2 | RL1, PL11 | The form opened filled with the sample (1,200 acres, 45 ft, water drive) with no sample label. | Fixed: banner, "Sample value" under each untouched field, "Sample value of the app, not a measurement" in the report, "Case data" in the header; tests |
| RF-U1-007 | S2 | RL1, RL4 | No identification and no input sources. | Fixed: identification block (company from the organisation), the shared source control per typed input |
| RF-U1-008 | S2 | PL3, RL7 | Oilfield only; no Suite unit profile. | Fixed: `src/utils/rfestimator/units.js` on the registry, `useProfileSystem('rf')`; 11 known values pinned; e2e PL3 |
| RF-U1-009 | S3 | RL9 | Water-drive gas assumed the swept volume abandoned at the initial pressure (Bga = Bgi) and nothing from the unswept volume, unstated. | Fixed: stated on screen (help), in the method row and the limits; the extension with Bga is Step 2 (RF-U2-010) |
| RF-U1-010 | S2 | RL11, PL9 | OOIP/OGIP and every PVT value typed, with no intake: no route from Material Balance, ReservoirCalc Pro or Fluid Systems Studio. | Fixed: mbal-1 by id (`?mbalCase=`), ReservoirCalc Pro saved project by id, pvt-1 by id (`?fluidProject=`); "edited after intake", "source changed since", PVT read at a pressure the case left; tests and e2e RL11 |
| RF-U1-011 | S3 | RL8, PL1 | Nothing said how far each method was validated. | Fixed: "Validation in this build" row per method in the report |
| RF-U1-012 | S2 | Plan 0a | Record sharing not adopted though the table is under the rules. | Fixed: own then shared projects, view only, edit with check-out, newer save refused, Save a copy; `rfSharing.test.jsx` (5) |
| RF-U1-013 | S3 | PL4, PL5 | A project saved with an API method would show a different number after RF-U1-001 with no word. | Fixed: payload version 2 migration keeps the inputs and puts a note on the page and in the report flags |
| RF-U1-014 | S3 | PL12 | Missing values printed "-". | Fixed: EMPTY_VALUE ("n/a") |
| RF-U1-015 | S3 | RL7, PL1 | Cards said "RF Range (analog)" and "Recoverable Reserves" with no basis; reserves implies a PRMS class. | Fixed: RF names its method and "fraction of OOIP"; the volume says "technically recoverable, no economic limit applied"; the report headline has a Basis column |
| RF-U1-016 | S3 | RL2 | Only the OOIP formula was shown. | Fixed: GRV, NRV, PV, HCPV, FVF, OOIP in the report; closure within the 7,758 rounding (0.005 percent) |
| RF-U1-017 | S3 | RL3 | The correlation result was one number. | Fixed: constant and four factors (base, exponent, value) closing on the product; p/z and trapped gas by their steps |
| RF-U1-018 | S3 | RL12 | Porosity, Swi and Boi are typed twice (volumetrics and method inputs) and could disagree silently. | Fixed: a flag when they differ (kept as two boxes; one value per case is Step 2 RF-U2-012) |
| RF-U1-019 | S3 | PL1 (cross-app) | Material Balance's forecast reconciliation holds its own oil RF bands (`OIL_RF_BANDS`, combination 20 to 60 percent, partial water drive 25 to 60) beside this app's (combination 20 to 50, no partial water drive). | Open, cross-app: one source of bands is RF-U2-006 |
| RF-U1-020 | S3 | PL8 | zi and za are typed; the Suite has a canonical Z (Dranchuk-Abou-Kassem). | Open: the pvt-1 intake gives them from a Fluid project now; a Z from gravity and temperature is RF-U2-003 |
| RF-U1-021 | S4 | PL12 | The help guide described the old behaviour (P90 to P10, no darcies, no intakes). | Fixed: help rewritten; guard pins darcies, range edges, mbal-1, pvt-1 |

Totals: 21 findings, 19 fixed, 2 open (both S3, carried into Step 2). One S1,
eight S2, all fixed.

### Validation (PL1)

| Method | What the gate checks (calls the engine) | Source | Weakness |
|---|---|---|---|
| API solution-gas drive | Sample case 17.714 percent and each factor to 5 figures; the factors close on the product; constant and exponents; the md-for-darcy error is exactly 1000^0.0979 | Arps, Brons, van Everdingen, Buchwald and Smith (1967), API Bulletin D14, as restated with k in darcies in Ahmed, Reservoir Engineering Handbook | The bulletin and the handbook page were not readable in this run (web sources refused or not found); the darcy basis is from the restated form as recalled and from plausibility (md gave 34.8 percent for a solution-gas case, above the solution-gas range). No published worked example. API D14 data ranges not checked |
| API water drive | Sample 42.320 percent, factors, closure, constants | As above | As above |
| p/z depletion | Equals 1 - Bgi/Bga from the canonical fluid engine `bgRbPerScf` on three cases, to 1e-12 | Gas material balance for a volumetric reservoir (Craft and Hawkins) | Exact relation; no textbook worked example compared |
| Water-drive gas | Equals the volume bookkeeping of swept and unswept volumes | Craft and Hawkins | Definition only; no published example |
| Volumetric OOIP/OGIP | 7,758 bbl per acre-ft against the unit registry (43,560 ft3 / 5.6146); 1 acre-ft at Bgi 1 is 43,560 scf | Definition | None |
| Analog ranges | Not validated: the source line says so in the app and the report | Transcribed screening ranges | Owner question 2; RF-U2-005 |

Negative controls run by hand: the pre-fix engine (origin/main 8d16c9b27)
fails 9 of 15 gates; the `.pld` test fails (export refused, dangling ids)
without the new intake reference declarations.

## The report

`src/utils/rfestimator/reportModel.js`, `reportFigures.js`,
`reportExport.js`, on `src/lib/reportKit`. Pages: oil reviewer case 5,
sample 4, gas p/z in SI 5. Sections:

1. Header: project, company, field, licence or block, reservoir or zone,
   wells or area, analyst, data date, fluid, analysis type, case data
   (sample, partly sample, entered), software build, engine version,
   display units, generated time.
2. Headline results with a Basis column: RF (fraction of OOIP or OGIP at
   stock-tank conditions, method named), analog range edges (not P90 and
   P10), in-place volume and where it came from, recoverable volume
   (technically recoverable, no economic limit, not a PRMS class), the
   volume at the range edges; a withheld value's reason.
3. OOIP or OGIP by its parts (GRV, NRV, PV, HCPV, FVF), closing.
4. The method by its parts (constant and factors, or p/z steps, or trapped
   gas steps), closing.
5. Inputs and their sources: every value the engine read with unit and
   source (Fluid intake with method and pressure, Material Balance or
   ReservoirCalc Pro intake, stated source and note, sample value, or
   "Entered, source not stated").
6. Method: what it assumes, the reference, the validation in this build,
   the analog source.
7. Basis and conventions.
8. Limits: assumptions, the domain each method needs, every flag.
9. The in-place intake record and the pvt-1 block.
10. Notes; three figures.

Kit change: `limits()` takes an optional `rangesTitle` (default unchanged;
Well Test goldens byte-identical).

## Intakes and senders

| Contract | Direction | How | State |
|---|---|---|---|
| `mbal-1` (Material Balance Studio) | in | `readMbalCase` by id, picker or `?mbalCase=`; OOIP/OGIP of the last completed run, its method, r2, run time, 95 percent interval when the case has one; "source changed since" on a newer run or value | Built |
| ReservoirCalc Pro saved project (`saved_quickvol_projects`) | in | The reader Material Balance uses (`volumetricOptions`); deterministic STOIIP/GIIP of a reservoir | Built |
| `pvt-1` (Fluid Systems Studio) | in | `readFluidProjectPvt` by id, `?fluidProject=`; shared PVT card | Built |
| `kr-1` (SCAL Studio) | in | Not used: no method of this app reads kr end points. A displacement-times-sweep method would (RF-U2-009) | NA |
| `dca-forecast-1`, `vrr-1`, `wta-1`, `sim-forecast-1` | in | Not inputs of an RF estimate. DCA EUR over OOIP as a cross-check is RF-U2-014 | NA |
| `rrv-portfolio-candidate-1` | out | Risked Reserves takes its volumes from ReservoirCalc Pro, which takes RF as a typed percent. An RF sender into ReservoirCalc Pro is RF-U2-001 | Not built (Step 2) |

No migration file: `saved_rf_projects` is already under the sharing rules
and in the `.pld` apps family; the intake ids are declared in
`src/lib/portability/familiesCore.js`.

## What changes numbers

- API correlations (RF-U1-001): every estimate made with an API method
  falls by a factor 1.97 (solution gas) or 1.70 (water drive). Sample water
  drive 72.0 to 42.3 percent; recoverable 31.24 to 18.36 MMSTB.
- Values that were clamped (RF-U1-002): a value above 95 percent now shows
  as computed (with a flag); a value at or below zero, or 100 percent or
  more, now shows n/a with the reason instead of 1 or 95 percent.
- Nothing else moves: the analog ranges, p/z and trapped-gas equations and
  the volumetrics are unchanged.

## Gap matrix corrections

- The matrix graded RL9 Pa and listed the analog citation as the worst
  correlation issue; it missed the S1 (k in md where the equations take
  darcies). Code reading of the formula was right, the unit of k was not
  checked against the published form.
- RL8: the clamp was graded Pa; it hid values on both sides (1 and 95
  percent), so F.
- RL1 F, RL4 F, RL6 F, RL12 F confirmed. RL7 Pa confirmed. RL2 and RL3 Pa
  confirmed.
- Platform contracts: datum "no" is now "label only" (pressures absolute,
  no correction), as the plan asked.

## Step 2: advancement review

### 2a Competitor parity (from public descriptions; no vendor document was read in this run)

| Practice | Where it lives | This app |
|---|---|---|
| Recovery factor distributions from analogue databases by reservoir type, drive, lithology and development | Commercial analogue databases (C&C Reservoirs DAKS; S&P Global and Wood Mackenzie field databases); public sets such as the US BOEM Gulf of Mexico atlas | Fixed transcribed ranges; no analogue set, no distribution |
| RF with uncertainty feeding a probabilistic volume (RF x STOIIP by Monte Carlo) | Petrel volumetrics, REP and GeoX style prospect tools | Range edges only; no Monte Carlo |
| PRMS reserves categories (1P/2P/3P) with an economic limit and commerciality | SPE PRMS 2018 and its application guidelines; reserves tools (Harmony, ARIES, PHDwin) | Technically recoverable only, stated |
| Analog selection criteria stated (PRMS: comparable reservoir, fluid, drive and development) | PRMS application guidelines | Drive only |
| Several empirical correlations side by side (API 1967, Guthrie-Greenberger 1955 and later regional fits) | Textbook practice | API only |

### 2b Deferred backlog

From STATUS: multi-zone cases; analog benchmarking against published RF
distributions; RF handoff to ReservoirCalc Pro or the hub. From the plan
row: one-page report (done in Step 1), honest defaults (done). From Step 1:
RF-U1-019 (two band tables), RF-U1-020 (Z typed).

### 2c Suite integration

Sender into ReservoirCalc Pro's recovery factor (oil and gas) by id; the
Material Balance drive indices suggesting the drive mechanism; DCA EUR over
OOIP as a cross-check; the Waterflood Design RF of flooded OOIP and the
kr-1 end points for a displacement-times-sweep estimate; one band table
shared with Material Balance.

### Ranked backlog

| ID | Item | Size | Batch |
|---|---|---|---|
| RF-U2-001 | `rf-1` sender: ReservoirCalc Pro reads the RF (oil, gas) by id with its method and range, "edited after intake" (Risked Reserves then gets it through ReservoirCalc Pro) | M | A |
| RF-U2-002 | Uncertainty on the canonical Monte Carlo (ReservoirCalc Pro `MonteCarloEngine.js`): RF as a triangular (range edges, typical) or a stated distribution, times the in-place volume (the Material Balance 95 percent interval or a ReservoirCalc Pro P90/P10); P90/P50/P10 on the exceedance convention; seeded; in the report | M | A |
| RF-U2-003 | Z from the canonical engines (Dranchuk-Abou-Kassem, `gasZDetail`) from gas gravity and temperature for zi, za and Bgi, with the method printed (closes RF-U1-020) | S | A |
| RF-U2-006 | One band table: Material Balance reads the drive ranges from this app's module (closes RF-U1-019); Material Balance numbers announced if they move | S | A |
| RF-U2-005 | Sourced analog table: replace the transcribed ranges with a table cited page by page (owner supplies the book pages), validation-first; until then the label stays | M | B |
| RF-U2-004 | Guthrie-Greenberger (1955) water-drive correlation beside API, with its published range, validation-first | M | B |
| RF-U2-008 | Drive suggested from the mbal-1 drive indices (printed, never applied silently) | S | B |
| RF-U2-014 | DCA EUR over OOIP (`dca-forecast-1` by id) printed as an implied RF beside the estimate | S | B |
| RF-U2-009 | Displacement-times-sweep method: ED from `kr-1` end points (Swi, Sor), EA and EV typed or from Waterflood Design | M | B |
| RF-U2-010 | Water-drive gas with partial pressure maintenance (Bga at an abandonment pressure) | S | B |
| RF-U2-012 | One porosity, Swi and Boi per case (the volumetric and method boxes linked, with an explicit override) | S | B |
| RF-U2-007 | Multi-zone cases: zones with their own in-place and RF, summed with the basis | M | C |
| RF-U2-013 | PRMS mapping with an economic limit through `calculateEconomics` (owner decision; this app is a screening tool) | L | C |
| RF-U2-015 | CSV of inputs and results with a provenance header | S | C |
| RF-U2-016 | EOR incremental RF from EOR Screening (in the EOR round) | M | C |

### Owner questions (with the default the programme runs on)

| # | Question | Recommended default |
|---|---|---|
| 1 | The API correlation fix moves every API estimate down by 1.7 to 2 times. Can the owner supply the Ahmed handbook pages (or API D14) so the darcy basis is checked against print? | Ship the darcy basis (the published restated form), say so in the release note and on any saved API project; add the page check to the gate when the pages arrive |
| 2 | The analog ranges are transcribed and labelled "not validated". Keep them labelled, or replace them with a sourced table? | Keep them, labelled, until a sourced table is supplied (RF-U2-005) |
| 3 | Material Balance and this app hold different oil RF ranges. Make this app's table the one source? | Yes, in Step 2 (RF-U2-006); announce any Material Balance reconciliation change |
| 4 | Uncertainty: build RF x in-place on the canonical Monte Carlo now (Batch A)? | Yes, seeded, exceedance convention, printed in the report |
| 5 | A sender into ReservoirCalc Pro's recovery factor fields? | Yes (RF-U2-001); ReservoirCalc Pro keeps the value as received and says when it is edited |
| 6 | PRMS categories with economics in this app? | No for NAPE: the app states "technically recoverable"; PRMS mapping stays in Batch C |

## Batch decision (programme lead, 2026-10-04)

Recorded verbatim.

> Owner-question defaults in force: the darcy fix ships with a release note and project notes (the lead confirmed the darcy basis of Arps et al. 1967 as restated by Ahmed, and the exponents 0.1611/0.0979/0.3722/0.1741 and 0.0422/0.0770/-0.1903/-0.2159); analog ranges stay labelled "not validated" until a sourced table; RF's range table becomes the one Material Balance uses; Monte Carlo in Batch A; the RCP sender in Batch A; PRMS categories after NAPE.
>
> BUILD in this order, one commit per item:
> - Batch A: RF-U2-001 an `rf-1` read-by-id contract and a sender into ReservoirCalc Pro (RCP takes RF with its method, basis and source, "source changed since"; RCP numbers unchanged unless the user takes it); RF-U2-002 RF x in-place uncertainty through the canonical Monte Carlo, seeded, seed and realisation count saved and printed, the Suite's exceedance convention stated (P90 low); RF-U2-003 gas z from the canonical Dranchuk-Abou-Kassem (before and after on the gas sample; saved projects keep their method with a note, as Well Test did); RF-U2-006 one band table shared with Material Balance (closes RF-U1-019; MBAL's displayed bands may move: state exactly what moves).
> - Then: an eor-screen-1 reader (show the EOR screening result beside the RF estimate as context only) IF EOR U2 has merged it on main by the time you get there; otherwise record it for later.
> - Batch B if time remains, in this order: RF-U2-008 drive suggested from Material Balance drive indices (suggestion only, the user picks); RF-U2-014 DCA EUR over OOIP as a cross-check (dca-forecast-1 by id; units checked); RF-U2-010 water-drive gas with Bga; RF-U2-012 one porosity, Swi and Boi per case; RF-U2-004 Guthrie-Greenberger 1955 only if you can read the source and validate a worked value; RF-U2-009 displacement x sweep from kr-1 (Welge displacement efficiency from the kr-1 set through the canonical waterflood engine; sweep a stated input).
> - DEFERRED (record reasons): RF-U2-005 sourced analog table (unless you find and can read a citable public table: then build it, labelled by source), RF-U2-007, RF-U2-013 (owner: after NAPE), RF-U2-015, RF-U2-016.

## Step 2 build (branch `feat/rf-u2`)

| ID | State | Proving test |
|---|---|---|
| RF-U2-001 | Done. `src/lib/rfEstimateSource.js` (contract `rf-1`, every field listed in its header); every save writes the record of the estimate on screen (payload key `rf`); "Send to ReservoirCalc Pro" saves, then opens ReservoirCalc Pro with `?rfProject=<id>`; ReservoirCalc Pro (`components/RfIntakeNote.jsx`) prints the RF with method, basis, range and source and keeps its own recovery factor until "Use this recovery factor"; then the oil or gas field takes the percent and the project keeps `rfIntake`; on a later open the estimate is read again by id: "edited here after the intake" and "the source changed after the intake" are said; the result warnings carry the source line; the `.pld` reference declared both ways | `src/lib/__tests__/rfEstimateSource.test.jsx` (10; negative controls: unreadable id takes nothing, an untouched RCP keeps 25 percent) |
| RF-U2-002 | Done. `src/utils/rfestimator/uncertainty.js` on the canonical module `src/lib/monteCarlo.js` (createCorrelatedSampler, mulberry32, basicStats, fitTriangularToPercentiles); RF triangular on the analog range edges (typical or the estimate as mode) or stated; in-place fixed, stated triangular, P90/P50/P10 as ReservoirCalc Pro prints them, or the Material Balance 95 percent interval read as a normal; independent draws; out-of-range realisations rejected and counted; switching on draws a seed, "New seed" draws another; config, seed and count saved in the project (`inputs.mc`); run inside `deriveRf` so screen, report and rf-1 agree; exceedance convention printed (P90 the low case); the report gains two tables, a basis row and the exceedance figure; rf-1 carries the distribution | `rfUncertainty.test.js` (10: closed-form triangular quantiles at 20,000 draws, zero spread equals the product exactly, mean of the product, seeded repeat, the canonical sampler spied, percentiles honoured, the 95 percent interval as a normal at +-1.2816 sd, refusals); `rfReport.test.js` "uncertainty run on" (5, golden `reviewer-mc`) |
| RF-U2-003 | Done (closes RF-U1-020). `src/utils/rfestimator/gasZ.js`: zi at pi, za at pa and Bgi at pi from the canonical engines (`gasZDetail`, Dranchuk-Abou-Kassem 1975 on Sutton 1985 pseudo-criticals; `bgRbPerScf` then the unit registry to ft3/scf); no engine change, so no engines PR. A gas case chooses "Dranchuk-Abou-Kassem from gas gravity and temperature" (a new case) or "Typed"; a project saved before keeps "Typed" with a note on the page and in the report flags; taking z or Bgi from a Fluid project sets "Typed" (the Fluid values are used as received). Computed fields show the value used and are not editable; Sutton gravity range and the chart window (Tpr 1.2 to 3, Ppr 0.2 to 15) flagged. Before and after on the gas sample (pi 4,200, pa 1,500 psia, gravity 0.65, 180 degF): typed zi 0.92, za 0.95, Bgi 0.005 ft3/scf give p/z RF 65.41 percent and OGIP 63.34 Bscf; Dranchuk-Abou-Kassem gives zi 0.9436, za 0.8968, Bgi 0.004063 ft3/scf, RF 62.42 percent, OGIP 77.95 Bscf | `rfGasZ.test.js` (7: zi through the app within 1.25 percent of 19 Standing-Katz chart readings; negative control degC for degF misses most of them; Bgi equals the textbook 0.02827 z T/p to 0.01 percent; the before and after pinned; flags; saved projects keep typed; report rows and completeness guard with its negative control) |
| RF-U2-006 | Done (closes RF-U1-019). `MBAL_OIL_DRIVE_TO_RF` and `bandForMbalDrive` in `src/utils/recoveryFactorCalculations.js`; Material Balance's `OIL_RF_BANDS` (`mbalForecast.js`) is built from them, so there is one table. **What moves in Material Balance (Forecast tab, "Drive mechanism band" and the within/outside verdict):** combination drive 20 to 60 percent becomes 20 to 50; partial water drive (`water_drive_with_depletion`) 25 to 60 becomes 20 to 50, labelled "partial water drive, read as combination drive". Unchanged: solution gas 5 to 30, gas cap 20 to 40, strong water drive 35 to 75; the gas path (p/z) and the injection class have no band, as before. An implied RF from 50 to 60 percent under either moved class, or from 20 to 25 percent under partial water drive, changes verdict. Labels now follow this app's names (lower case). The Forecast tab copy and the MBAL help no longer call the bands "Arps and API study ranges as tabulated in Ahmed": they say the ranges are this app's transcribed screening ranges, not validated | `mbalForecast.test.js` "RF-U2-006" (each band equals the RF table entry; the two moves and the three unchanged pinned; a 55 percent implied RF under combination drive, inside the old copy, is outside now) |
| RF-U2-008 | Done. The mbal-1 intake keeps the drive indices and aquifer strength of the run; `driveSuggestion` maps the engine's classification to a drive here (oil through `MBAL_OIL_DRIVE_TO_RF`; gas: expansion, rock and water compressibility and weak water drive to volumetric depletion, moderate and strong water drive to gas water drive; injection pressure maintenance suggests nothing, with the reason); shown under the drive select with "Use ... (a suggestion; the choice is yours)"; never applied on intake; the report's intake block prints the suggestion and whether the drive named follows it | `rfDriveSuggestion.test.jsx` (4, from the e2e fixture rows through the shipped mbal-1 builder; negative control: taking the volume leaves the drive unchanged) |
