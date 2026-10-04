# Well Test Analysis Studio: comprehensive upgrade

App #9 of the Reservoir round of the upgrade programme
(`docs/scope/AppUpgrade-Reservoir-PLAN.md`). Step 1 (the practitioner lens
PL1 to PL12 of `docs/scope/AppUpgrade-BestPractices.md` and the reviewer lens
RL1 to RL12 of `docs/scope/AppUpgrade-Reservoir-FeedbackLessons.md`) was run
and fixed on 2026-10-04 on branch `feat/welltest-u1`. Step 2 (advancement
review) is analysis only; the programme lead chooses the batches.

- Route: `/dashboard/apps/reservoir/well-test-analysis-studio` (ProtectedAppRoute, slug `well-test-analyzer`).
- Harness: `/dev/well-test-analysis-studio` (in-memory Supabase double, a registry well, Fluid projects saved in the same tab).
- Engines: Petrolord/petrolord-engines PR #309 (not merged; vendored byte-identical with six `welltest-u1` ledger rows in `packages/engines/VENDOR.json`, pinned canonical dc614f1).
- Earlier rounds: Programs 1 and 2 (WT1 to WT10), tester round 1 (PR #810), tester round 2 (PR #852, `WellTestAnalysis-TesterRound2.md`), the report on the shared kit (PR #854), the SI storage fix (PR #857).
- Live data: not read (no database access from this run). `saved_well_test_projects` is under the record sharing rules since migration 20261002130000 (applied).

## What changed, in ten lines

1. **S1: a decimal typed under SI was multiplied by ten.** Every converted input re-rendered the stored oilfield value on each key, so the decimal point vanished: 13.7 m of net pay became 137 m. Fixed in every field (`useUnitDraft`).
2. **Unit conversions pinned to known values.** Every kind of `units.js` converts one value whose SI twin is written from the unit definitions; a kind without a row fails. Two were wrong on screen and in the PDF: kh printed md-ft under SI, and the RTA productivity index printed the oilfield number under SI labels (43 times too large for oil).
3. **Gas z on Dranchuk-Abou-Kassem** from the canonical engine, as in Fluid Systems Studio; projects saved before keep Papay and their numbers; the report names the method and flags a test outside the method's checked range.
4. **Gauge depth and pressure datum** are stated inputs; the report prints them, says no correction was applied, and says how gauge readings became absolute.
5. **The report** gains the company, the software build, the gauge readings left out with their reasons, the method and its limits, the units of the deliverability coefficients, and a warning when the rate history disagrees with q or tp.
6. **Doors**: the gauge import read day-first stamps month first (and dropped days above 12); the RTA production door read three columns by position with parseFloat. Both now read through the shared reader, with units at the door and a read-back.
7. **Scale**: a gauge file above about 125,000 readings overflowed the call stack; 388,800 readings now load.
8. **Record sharing** with view and check-out editing, Save a copy.
9. **The `wta-1` sender**: every save writes the results with their methods into the project; Material Balance and Waterflood read them by id (`?wellTestProject=`), so a saved project finally carries its average pressure.
10. **`.pld`** carries every new field; the block's self reference and Waterflood's intake reference are declared.

## Evidence kit made for this app

| Kit | Where | What it holds |
|---|---|---|
| Unit known values | `packages/engines/__tests__/welltest.unitsKnownValues.test.js` (35) | One known value per kind, a coverage test, the 2026-10-02 storage factor put back as negative control (47.54 times off while the round trip stays blind) |
| Z by method | `packages/engines/__tests__/welltest.gasZMethod.test.js` (8) | Bit-identical to `fluid/blackOil.ts`; DAK within its stated 1.25 percent of the Standing-Katz chart over Tpr 1.2 to 3, ppr 0.2 to 15 (worst 1.17 percent); Papay leaves the band (23 percent, it clamps at 1.15): negative control |
| The studio, U1 items | `src/components/welltest/__tests__/wellTestU1.test.jsx` (15) | The real provider, the PDF built by the Export function and read back with poppler, one describe per finding |
| SI typing | `src/components/welltest/__tests__/unitTyping.test.jsx` (6) | Key by key under SI; 5 of 6 fail on the old primitives |
| Gauge dates and scale | `src/utils/welltest/__tests__/gaugeImportDates.test.js` (5), `gaugeImportScale.test.js` (1) | Day first, month first, undecided asks, ISO; 388,800 readings |
| RTA door | `src/utils/welltest/__tests__/productionImport.test.js` (8) | The hostile set read to one twin; the old reader kept verbatim as the negative control of each case |
| Hostile files | `e2e/fixtures/welltest/hostile/` | A gauge stamped day first in psig; a production file with barg first, a German date column, decimal commas, m3/d last |
| `wta-1` | `src/lib/__tests__/wellTestSource.test.jsx` (4) | The record from a fitted studio, read by id, mapped by Material Balance's own intake; an old project; a manual match |
| Sharing | `src/contexts/__tests__/wellTestSharing.test.jsx` (5) | Own and shared lists, view only, check-out, newer save refused, Save a copy, before the migration |
| `.pld` | `src/lib/portability/__tests__/wellTestPortability.test.jsx` (2) | A fitted gas project with a pvt-1 intake and every U1 field; the self reference follows the row |
| Goldens | `src/components/welltest/__tests__/__fixtures__/reportGolden/` | Regenerated deliberately at each report change; the .txt diffs in the commits are the review |
| Browser | `e2e/well-test-upgrade.spec.js` (11) | Every tab at three viewports in both themes, the PDF read back, both hostile doors, the z method, SI typing key by key |

## Step 1: the twenty-four checks

Grades: P pass, Pa partial, F fail. "Was" is the gap matrix grade for RL
checks (from code reading and the sample PDF) and the state found here for
PL checks.

| Check | Was | Now | Findings | Notes |
|---|---|---|---|---|
| PL1 Labels mean the textbook | Pa | P | 001, 003, 016 | kh in md-m under SI; p* sent as "average pressure" now named p* with what it is not; Z method named |
| PL2 Hostile files | Pa | P | 009, 010 | Day-first stamps, comma decimals, reordered and foreign headers, metric units, psig/barg |
| PL3 Units, datums, frames | Pa | P | 001, 002, 005, 014, 017 | Every kind pinned; datum stated; deliverability basis named |
| PL4 No claim without the event | Pa | P | 008, 019 | Rate history against q and tp; edited-after-handoff source |
| PL5 Real saved state | P | P | 003, 005, 013 | Old payloads open (Papay kept, gauge basis "not recorded"); `.pld` round trip |
| PL6 Real browser | P | P | 015 | 3 viewports, both themes, every tab, no page errors, no sideways scroll, white charts; at 390 the tab strip scrolls (kept) |
| PL7 Report a reviewer can sign | Pa | P | 004, 005, 006, 007 | See RL1 to RL12 |
| PL8 Practitioner's day | gaps | gaps recorded | Step 2 | Persona walk below |
| PL9 The chain | Pa | P | 012 | Fluid to Well Test (kept); Well Test to Material Balance and Waterflood by id |
| PL10 Real scale | not run | Pa | 018 | 388,800 readings (14 MB): import 27 s with date stamps (5 s numeric), analysis 5 s, fit 2 s, report 4 s; import on the main thread (Step 2) |
| PL11 Inputs a person can type | F | P | 015, 017 | SI decimals; fields had no accessible name |
| PL12 House standards | Pa | P | 016 | "Reservoir Balance" and p-bar on the send button; `n/a`, copy style, route protected |
| RL1 Inputs with unit and source | P | P | 005 | Gauge depth and datum added |
| RL2 Composites show components | P | P | | ct by components (round 2) kept |
| RL3 Lumped results split | P | P | 012 | The skin split now travels in `wta-1` |
| RL4 Identification | Pa | P | 004 | Company and software build |
| RL5 Data and operations summary | Pa | P | 006 | Every reading used or left out, with reason, closing on the record |
| RL6 Every result has its plot | P | P | | Six figures kept; goldens hold them |
| RL7 Basis named | Pa | P | 001, 002, 005, 014 | Absolute or gauge stated, datum, coefficient units |
| RL8 Strengths kept | P | P | 008 | CIs, windows, cross-check, regression statement kept |
| RL9 Limits printed | Pa | P | 007 | General limits block; gas z range flagged |
| RL10 Import doors | Pa | P | 009, 010, 018 | The gap matrix was right on day-first dates (H12 had fixed commas only) |
| RL11 Senders and provenance | Pa | P | 012, 019 | `wta-1` with methods, read by id |
| RL12 One model | P | P | 005, 006, 007 | Report tab and PDF read the same new rows |

### PL1 quantity table (the items this round touched)

| Quantity | Standard meaning | What the code computes | Same? |
|---|---|---|---|
| kh | Permeability-thickness, md-ft or md-m | k h, h in the display length unit | Yes (was md-ft under SI) |
| p* | Horner extrapolation to infinite shut-in | Horner intercept at (tp+dt)/dt = 1 | Yes; sent as "average pressure" before, now labelled p*, with no MBH correction stated |
| J (RTA) | Productivity index q / dp | 1 / FMB intercept | Yes (SI conversion fixed) |
| z | Real-gas deviation factor | DAK (canonical engine) with Sutton pseudo-criticals; Papay for old projects | Yes |
| Skin (gas) | Apparent skin s' including rate-dependent skin | Same, stated in the limits | Yes |

## Findings

S1 wrong numbers silently; S2 wrong or missing with a visible symptom, or a
door that refuses good data; S3 reviewer gaps; S4 polish.

| ID | Sev | Check | Finding | Outcome and proving test |
|---|---|---|---|---|
| WTA-U1-001 | S2 | PL1, RL7 | SI report printed kh as md-ft with h in feet (3,150 md-ft for 960 md-m); four screens the same | Fixed: `kh` unit kind. `wellTestU1` 001; SI golden `kh (md-m) 960` |
| WTA-U1-002 | S2 | PL3 | RTA productivity index printed the oilfield number under SI labels (43.4x for oil) | Fixed: `productivityIndex`, `gasProductivityIndex` kinds. `wellTestU1` 002 |
| WTA-U1-003 | S3 | PL1, PL5 | Gas z on Papay (no checked range; clamps at 1.15) while Fluid uses DAK | Fixed engines-first (#309): selectable method, DAK for new work, Papay kept for saved projects; method is an analysis input. `welltest.gasZMethod`, `wellTestU1` 003 |
| WTA-U1-004 | S3 | RL4 | No company or software build on the report | Fixed. `wellTestU1` 004 |
| WTA-U1-005 | S3 | RL7 | No gauge depth or datum; the +1 atm for gauge readings unstated | Fixed (owner default: stated, no correction). `wellTestU1` 005 (3) |
| WTA-U1-006 | S3 | RL5 | Readings before shut-in, spikes, thinning and the dp &le; 0 drop not in the report | Fixed: table closing on the record, spikes listed. `wellTestU1` 006 |
| WTA-U1-007 | S3 | RL9 | Limits printed for the skin split only | Fixed: limits block; gas reduced state against the z window, OUTSIDE flagged. `wellTestU1` 007 |
| WTA-U1-008 | S3 | PL4 | Analysis reads q and tp, the flow summary reads the rate history; they could disagree silently (the gas golden showed 5,000 Mscf/D analysed beside 450) | Fixed: warning on the Data tab, sentence in the report. `wellTestU1` 008 |
| WTA-U1-009 | S2 | RL10 | Gauge date stamps through Date.parse: 03/09 read as 9 March, 13/09 dropped | Fixed: shared date reader, asks when undecided. `gaugeImportDates` |
| WTA-U1-010 | S2 | RL10 | RTA door by position with parseFloat: reordered headers swapped rate and pressure, 2905,5 became 2905, dates became the day of the month, m3/d read as STB/D, psig as psia | Fixed: `productionImport.js`, read-back saved and printed. `productionImport` with the old reader as negative control |
| WTA-U1-011 | S3 | PL5 | Record sharing not adopted | Adopted: view, check-out editing, Save a copy, share bar. `wellTestSharing` |
| WTA-U1-012 | S2 | RL11, PL9 | No results saved with a project (Material Balance found no average pressure); sends carried k, skin and p* with no method, interval or status, through router state only | Fixed: `wta-1` written on every save, read by id by Material Balance and Waterflood, methods printed there. `wellTestSource` |
| WTA-U1-013 | S3 | PL5 | `.pld` untested with the new fields; the block's self id followed the source row | Fixed: soft references declared. `wellTestPortability` |
| WTA-U1-014 | S3 | RL7 | Deliverability C, a, b printed as bare numbers in both systems | Fixed: units and the oilfield basis stated. `wellTestU1` 014 |
| WTA-U1-015 | S4 | PL11 | No input had an accessible name (label not tied to input); three selects unlabelled | Fixed in the shared Field. e2e uses `getByLabel` |
| WTA-U1-016 | S4 | PL12 | Send button named "Reservoir Balance" and p-bar while it sends p* | Fixed |
| WTA-U1-017 | **S1** | PL11 | A decimal typed under SI was multiplied by ten in every converted field (13.7 m stored as 137 m), live since WT8 (2026-07-18) | Fixed: `useUnitDraft`. `unitTyping` (5 of 6 fail on the old code), e2e PL11 |
| WTA-U1-018 | S2 | PL10 | A gauge file above about 125,000 readings overflowed the call stack; nothing loaded | Fixed. `gaugeImportScale` (388,800 readings) |
| WTA-U1-019 | S3 | RL11 | After a version-1 Fluid handoff an edited Bo kept "from Fluid Systems Studio" (the gap matrix row; pvt-1 handoffs were already right) | Fixed: values recorded for every handoff. `wellTestU1` 019 |
| WTA-U1-020 | S3 | PL10 | Import runs on the main thread; 27 s freeze for 388,800 date-stamped readings | Open: Step 2 U2-010 |
| WTA-U1-021 | S2 | cross-app | Nodal Analysis Studio's `UnitField` (`src/components/nodalstudio/primitives.jsx`) has the same SI typing defect as 017 | Not fixed here (another module); for the Production round |
| WTA-U1-022 | S3 | engines | Canonical engines held the pre-2026-10-02 SI storage factor and lacked the Suite's regime ordering rules (#336) | Fixed in engines #309 (catch-up) |

## Unit conversions checked (one known value each)

All 33 kinds of `units.js` pass their known value: length, pressure,
pressureAbs, oilRate, gasRate, compressibility, storage, poreVolume, area,
semilogSlope, pssSlope, sqrtSlope, pseudoPressure, pseudoSlope, temperature,
oilVolume, gasVolume, liquidVolume, gor, choke, the four new kinds (kh,
productivityIndex, gasProductivityIndex, xfSqrtK) and the nine identities.
None of the registry factors was wrong after #857. The two defects were
uses that bypassed the registry (001, 002). Also checked by reading: the
gauge door's pressure units (pinned by its own tests), the inline report
factors for N (MM m3) and G (10^9 m3), pore volume. The deliverability
coefficients are not converted and now say so (014).

## The z change, before and after

Gas sample (the sample gauge record as a 5,000 Mscf/D gas test, 180 degF,
gravity 0.65, pi 4,800 psia), Papay then DAK: z(4,800) 1.0422 to 0.9827;
mu_g(pi) 0.02392 to 0.02514 cp; c_g(pi) 9.55e-5 to 1.375e-4 1/psi; Horner k
13.73 to 13.60 md; s' 6.25 to 6.46; regression k 13.98 to 13.86 md, s' 6.51
to 6.73, C 0.0936 to 0.0882 bbl/psi; ri 1,688 to 1,366 ft. At 6,000 psia
Papay clamps at 1.150 against DAK 1.074. Saved gas projects keep Papay until
the user switches.

## Anything that changes numbers

- New gas work: the z change above.
- SI users: values typed with a decimal are now what was typed (017); SI kh and J print in SI.
- Material Balance from Well Test: the same pressure value, now labelled p*.
- Nothing changes in oilfield oil interpretations.

## PL8 persona walk

- **Saphir user**: loads a 1 s gauge (works, slow, no progress bar), expects deconvolution, changing storage, D factor, a two-gauge comparison and tide correction; none exist. Expects negative skin on non-homogeneous models (the catalog bounds skin at 0 off-homogeneous).
- **Graduate**: follows the sample, types SI values (now right), reads the limits block.
- **Manager**: reads the report header, the basis and limits tables, the cross-check; signs.

## Step 2: advancement review (analysis only)

### 2a Competitor parity (public documentation, collected 2026-10-04)

| Capability | Saphir | PanSystem | whitson+ | Well Test Studio |
|---|---|---|---|---|
| Changing wellbore storage (Fair, Hegeman, Spivey) | Y | ? | N | N |
| Dual porosity, composite, combined boundaries | Y | partly | N | dual porosity, single boundaries, rectangle |
| Limited entry, slanted well | Y | Y (partial penetration) | N | pseudo-skin only |
| Numerical PTA | Y | Y | ? | N |
| Deconvolution | Y | Y | N | N |
| Rate-dependent skin D | Y | Y | ? | N (s' stated) |
| Deliverability C-n, LIT | Y | Y | ? | Y |
| Lab PVT table / EOS | Y | Y | Y | correlations; Fluid table not wired |
| RTA (Blasingame, FMB, linear) | Y (Topaze) | partly | Y | FMB, linear, no Blasingame type curves |
| Tide, drift, datum correction | Y | Y | datum Y | datum stated only |
| Regression confidence intervals | Y | ? | N | Y |
| Interference, WFT, DFIT | Y | partly | DFIT | N |

Sources: kappaeng.com/software/saphir; KAPPA Software Technical Summary
(download.kappaeng.com); a PanSystem brochure mirror (silo.tips) and a
third-party review (weak); manual.whitson.com PTA, analytical and numerical
RTA, DFIT and bottomhole pressure pages. PanSystem "?" means the public
documentation is silent, not that the feature is missing.

### 2b Deferred backlog and 2c integration: one ranked list

| ID | Item | Size | Batch | Why |
|---|---|---|---|---|
| WTA-U2-001 | Gas tests take the Fluid Systems `pvt-1` table (z, mu_g) as the supplied PVT table; the engine path exists (`table`), the intake drops it | S | A | The lab PVT input item, now covered by Fluid's lab import: confirmed, needs wiring only |
| WTA-U2-002 | Changing wellbore storage (Fair or Hegeman) in the catalog | M | A | First thing a Saphir user misses; engines-first, oracle plus a published example |
| WTA-U2-003 | Rate-dependent skin D from multi-rate or deliverability points, s = s_d + D q | S | A | The report already states s' is apparent; this splits it (RL3) |
| WTA-U2-004 | Correction to datum with a stated gradient (fluid or measured), shown beside the gauge values | S | A | Owner question 6 deferred this to Step 2; Material Balance would take datum pressure |
| WTA-U2-005 | Material Balance takes the full `wta-1` pressure rows (p* or MBH average with its method) as a pressure point, not only as initial pressure | S | A | Material Balance found no pressure point from a test |
| WTA-U2-006 | Limited-entry (spherical flow) transient model | M | B | Named future scope since WT3; needs a published check |
| WTA-U2-007 | Deviated-well partial penetration (Cinco-Ley slanted pseudo-skin) | S | B | The completion already has MD and TVD |
| WTA-U2-008 | Blasingame type curves on the RTA tab | M | B | RTA parity with Topaze and whitson+ |
| WTA-U2-009 | Deconvolution (von Schroeter) of several buildups | L | C | Largest parity gap; research-grade |
| WTA-U2-010 | Gauge import in a worker with progress and cancel; faster date parsing | S | A | WTA-U1-020: 27 s main-thread freeze at 388,800 readings |
| WTA-U2-011 | MBH or Dietz average pressure from p* for a bounded model | S | B | Makes "average pressure" true for closed systems |
| WTA-U2-012 | Published check of Papatzacos (owner supplies SPE-13956-PA) | S | B | Gate is an oracle band today |
| WTA-U2-013 | Negative skin on non-homogeneous models | S | B | Catalog bound 0; stimulated wells |
| WTA-U2-014 | Interference and WFT or DFIT workflows | L | C | Out of the current scope |
| WTA-U2-015 | Nodal SI typing (WTA-U1-021) | S | A (Production round) | S2 in another app |

Batch A is NAPE-safe (small, no new models except changing storage, which is
engines-first with a gate). B after NAPE; C needs owner scope.

### Owner questions, with the default the programme takes

| # | Question | Default |
|---|---|---|
| 1 | Saved gas projects keep Papay. Switch them to DAK on open? | Keep Papay until the user switches; the Data tab says why |
| 2 | Average pressure sent to Material Balance is p*. Add MBH (U2-011) before NAPE? | After NAPE (Batch B); p* is labelled now |
| 3 | Correction to datum (U2-004): which gradient by default? | None by default; the user states a gradient and its source |
| 4 | Changing wellbore storage in Batch A? | Yes, Hegeman first, engines-first with a gate |
| 5 | Papatzacos paper | Owner supplies when convenient; band gate stays |
| 6 | Nodal SI typing defect (021): fix now as a one-file change, or in the Production round? | Fix now in a small separate PR (S2 live) |

## Batch decision (programme lead, 2026-10-04)

Recorded verbatim.

> Owner-question defaults in force: saved gas projects stay on Papay until the user switches; MBH average pressure after NAPE (p* labelled p* now); datum correction applies no gradient by default (the user states one); changing wellbore storage in Batch A, Hegeman first; Papatzacos waits for the owner's paper; Nodal SI typing is fixed (PR #879).
> BUILD in this order, one commit per item:
> - Batch A: U2-001 Fluid's pvt-1 table into gas tests (pseudo-pressure, Z, mu, cg from the Fluid table by id through the shared card, with "source changed since"; the in-app correlation path stays for no-intake projects); U2-002 changing wellbore storage, Hegeman first (engines-first; validate against the Hegeman, Hallford and Joseph 1993 published type-curve values or a worked example you can actually read; negative control); U2-003 rate-dependent skin D from a multi-rate test (s' = s + D q; state the method and its data needs); U2-004 correction to datum with a user-stated gradient (default none, as owner said; the report prints gauge depth, datum, gradient and the correction applied); U2-005 Well Test pressure to Material Balance as a pressure point through wta-1 (in MBAL, a pressure point with its source, method label p* and date; MBAL numbers unchanged unless the user adds it); U2-010 gauge import in a Web Worker (keep the 388,800-reading test; the main thread stays responsive).
> - Batch B if time remains: U2-007 deviated-well partial penetration (Cinco-Ley, Miller and Ramey 1975 or the source you can read, validated on a published value); U2-013 negative skin on the non-homogeneous models.
> - DEFERRED (record reasons): U2-006 limited-entry, U2-008 Blasingame type curves, U2-011 MBH (owner: after NAPE), U2-012 Papatzacos (needs the paper), U2-015 (done in #879), Batch C.

Branch `feat/welltest-u2` (worktree `/root/wt-res-wta2`); engines-first on
`feat/welltest-u2-engines`, Petrolord/petrolord-engines PR #311 (not
merged; vendored byte-identical with `welltest-u2` ledger rows meanwhile).

### Deferred, with reasons

| ID | Reason |
|---|---|
| U2-006 limited entry | A new transient model needs a published check; after NAPE |
| U2-008 Blasingame type curves | RTA parity, medium size; after NAPE |
| U2-009 deconvolution | Batch C, research grade |
| U2-011 MBH or Dietz average pressure | Owner: after NAPE; p* stays labelled p* |
| U2-012 Papatzacos published check | Needs the owner's copy of SPE-13956-PA |
| U2-014 interference, WFT, DFIT | Batch C, out of the current scope |
| U2-015 Nodal SI typing | Done in PR #879 |

## Step 2 build log

### U2-013 Negative skin on the non-homogeneous models: done (engines-first, PR #311)

- Engine `withNegativeSkin` in `modelCatalog.js`: S < 0 on the sealing fault, constant pressure, channel, closed circle, closed rectangle and the three dual-porosity models by the effective-radius mapping (rw' = rw e^-S, zero skin) with every rw-based group rescaled: tD and CD by e^2S (Laplace F(u) = F'(u/a)/a), LD, WD, reD and the rectangle's sides and well position by e^S, lambda by e^-2S. Skin minimum -5 on those models (as on the homogeneous model since WT1). The horizontal well (skin on kh h) and the fractures (choked-fracture skin) keep S >= 0.
- Validation (engines `welltest.negativeSkin.test.js`, 12): on the infinite radial solution the mapping equals the WT1 homogeneous negative-skin route to 1e-9; for all eight models pwD(S = -3) - pwD(S = 0) = -3 within 0.01 from tD 3e5 to 3e7, through the boundary or the fissure transition (a skin only shifts the late pressure); the fault's infinite-acting part sits on 0.5 (ln tD + 0.80907) + S; negative control: rescaling time but not the distances or lambda misses by more than 0.2. No published worked example of a stimulated well on these models was read; the gates are exact properties of the solutions.
- Proving test (Suite): `wellTestU2.test.jsx` U2-013: a stimulated well 400 ft from a sealing fault (skin -2): the studio's regression returns skin within 0.15 of -2 and k and L within 10 percent; with the earlier bound (S >= 0) the fit stops at zero or above with more than ten times the residual (negative control). The k and L bias of a few percent is the regression's on this model for either sign (L 372 against 400 for skin +2 on the engine alone), recorded here.
- `wt6Rectangle` tests (engines and Suite) follow the new bound.

### U2-007 Deviated-well partial penetration (slant pseudo-skin): done (engines-first, PR #311)

- Engine `slantPseudoSkin` in `partialPenetration.js`: the Cinco-Ley, Ramey and Miller (1975, SPE 5589) correlation s_theta = -(theta'/41)^2.06 - (theta'/56)^1.865 log10(hD/100) with theta' = atan(sqrt(kv/kh) tan theta) and hD = (h/rw) sqrt(kh/kv); refused beyond theta' 75 degrees; a warning below hD 40.
- Validation on published values: the Cinco-Ley table as printed in Economides and Nolte, Reservoir Stimulation, 3rd ed., chapter 1, Table 1-3 (downloaded from petroleumengineers.ru and read): the ten full-penetration rows at hD 100 and 1000, 15 to 75 degrees, within 4 percent (observed worst 3 percent at 75 degrees). Negative control: a natural log in place of log10 misses by more than 10 percent.
- By-product for the record (the open "partial-penetration textbook check"): Papatzacos against the same table's s_c column. An interval at the top of the pay agrees within 0.25 (hD 100, 10 percent open: 20.82 against 20.81); a centred interval comes out 0.3 to 1.6 higher (hD 100, half open centred: 2.86 against 2.37). Papatzacos stays the method (the owner's paper is still awaited, U2-012); the engines test pins this comparison.
- Studio: the angle comes from the perforations' MD and TVD lengths (theta = acos(dTVD/dMD)); the skin table adds "Slant pseudo-skin s_theta (x degrees from vertical)", the mechanical skin becomes s_d = (hp/h) (s - s_pp - s_theta) through the engine's `decomposeSkin` (this also corrects the U2-003 commit, which subtracted D q after the hp/h scaling); the note says the split is approximate for a well both slanted and partly open (the table shows -2.88 against the correlation's -2.15 at 60 degrees, half open). `wta-1` carries `skin.slant`. The limits row no longer says a deviated well is treated as vertical.
- Proving tests: engines `welltest.slantSkin.test.js` (15); Suite `wellTestU2.test.jsx` U2-007 (2): 45 degrees from MD and TVD, the engine's s_theta, the split identity, the PDF rows and formula, wta-1; a vertical interval has no slant term (negative control). `wellTestReportR2` 003 updated: its fixture is 30 ft MD over 29 ft TVD (14.8 degrees, s_theta -0.02, s_d 2.46 to 2.48).
- Numbers: projects whose perforations carry a longer MD than TVD interval get a slant term and a different mechanical skin; k and the total skin do not change. Goldens regenerated on purpose (the limits sentence; the reviewed fixture's slant row and s_d).

### U2-010 Gauge import in a Web Worker: done

- `src/workers/gaugeImport.worker.js` runs the protocol of `src/utils/welltest/gaugeImportProtocol.js` (read, detect the mapping, convert, with progress every 25,000 rows); the worker keeps the parsed table, so a mapping change re-converts without sending the file again, and the page holds only the headers and the rows. The rows cross back as three transferred Float64Arrays (no structured-clone copy of 388,800 objects). `gaugeImportClient.js` is the page side: the worker where one exists (lazy factory, the only `import.meta` file), the same protocol on the page's thread after a yield otherwise. The Data panel shows a progress line and Cancel (terminates the worker; nothing is loaded).
- The reading itself is unchanged (`convertGaugeRows` gained an optional progress callback only): the protocol's rows and mapping equal `importGaugeCsv` on the hostile day-first psig file.
- Proving tests: `src/utils/welltest/__tests__/gaugeImportWorker.test.js` (6): equality with the one-call import, mapping change on the kept table, 388,800 readings with 15 progress messages, no-table error, the client without a Worker, the client with a worker (progress, Cancel terminates and rejects), packed rows round trip. `gaugeImportScale.test.js` (388,800 readings) kept unchanged. Browser: `e2e/well-test-u2.spec.js`: a 50 ms heartbeat on the page's thread while the worker reads 388,800 readings never stalls past 500 ms (observed 97 to 203 ms on this box under load); negative control with `window.Worker` removed: the page stops for 5.7 s; Cancel loads nothing.
- Not done: faster date parsing (a date-stamped 388,800 file still takes about 10 s to convert, now off the page's thread); the analysis of the loaded rows (prepare, derivative, plots) stays on the page's thread, a 1 to 2.5 s pause after the largest files.

### U2-005 Well Test pressure to Material Balance as a pressure point: done

- `wta-1` gains `pressure.date` (the end of the test, else its start) and `pressure.method_label` (p* or pi); `average_psia` is at the datum when U2-004 applied a correction, and `basis` says which.
- Material Balance (`src/pages/apps/reservoir-balance/lib/wellTestPressureIntake.js`, Data tab card "Pressure point from Well Test Analysis Studio" under the VRR card): choose a saved Well Test project (read by id, row level security and record sharing decide), see the row of the test date, the value before and after, the method and basis; take it. The study keeps one handoff per point (`wta_point_<timestep>`), and the report's data note prints each: timestep, date, p*, project, well, basis and the method sentence, and says when the value was edited after the handoff. Nothing changes in the case until the point is taken; the initial row is refused (its pressure is a case input).
- Refused with the reason: no test date, no row on that date (the analyst adds the row with its volumes), more than one row on the date, a project saved before `wta-1`.
- Proving test: `src/pages/apps/reservoir-balance/lib/__tests__/wellTestPressureIntake.test.jsx` (4): the record built by the real Well Test provider lands on timestep 10 of the Ahmed case and changes that row only; the provenance survives the study save; an edit afterwards is said (negative control); the MBAL PDF cites it and does not before; a stated gradient sends the datum pressure; refusals.
- Numbers: none in Material Balance unless the analyst takes a point.

### U2-004 Correction to datum with a stated gradient: done (engines-first, PR #311)

- Owner default kept: no gradient stated, no correction, and the report says so in the same words as before.
- Inputs (Completion): the depth reference elevation above the vertical datum (puts the gauge TVD on TVDSS), the gradient (psi/ft or kPa/m, new pinned unit kind `pressureGradient`) and its source. Engine `engines/welltest/datum.js`: p_datum = p_gauge + g (z_datum - z_gauge), refused with its reason when the gradient lies outside 0 to 1.2 psi/ft or a depth is missing.
- The analysis stays at the gauge (k, s, the match and every plot unchanged). The report's "Gauge, datum and pressure basis" table prints the gauge depth in MD, TVD and TVDSS, the datum, the reference elevation, the gradient with its source, the correction applied, and p* and the pressure at shut-in at the datum. The limits row says one static gradient was used.
- `wta-1`: `pressure.average_psia` is at the datum when a correction was applied (the basis says so), with `p_star_datum_psia` and `datum_correction { gradient_psi_ft, gradient_source, gauge_tvdss_ft, delta_psi }`; `p_star_psia` stays at the gauge.
- Proving tests: engines `welltest.u2RateSkinDatum.test.js` (2); Suite `wellTestU2.test.jsx` U2-004 (3): default none (report and wta-1 unchanged), 0.35 psi/ft over 200 ft adds 70 psi to p* in the PDF and in wta-1 while k and p* at the gauge do not move, SI prints 7.9172 kPa/m; a missing reference elevation is refused with its reason (negative control).
- Goldens: one new row "Gradient, gauge to datum: None stated" in all six, on purpose; pdftotext re-spaces the header columns by one character as a result (layout only).

### U2-003 Rate-dependent skin D: done (engines-first, PR #311)

- Method, stated on the Specialized tab, the Report tab and the PDF: s' = s + D q (Ahmed, Reservoir Engineering Handbook 4th ed. 2010, eq. 6-160). Route 1: the apparent skins of two or more flow periods or tests at different rates, each from its own analysis that reached radial flow, on a straight line against rate (engine `rateDependentSkinFit`; two rates exact, three or more least squares with r2). Route 2: the pseudo-pressure LIT b is the non-Darcy coefficient F, D = F k h / (1422 T) (eq. 6-159, engine `nonDarcyDFromF`); a pressure-squared b carries mu z and is not used. Data needs: two or more rates with their own apparent skins, or a stabilized deliverability fit in pseudo-pressure.
- Studio: rows of (q, s') on the Specialized tab with "Add this test"; saved with the project (`rateSkinRows`). The skin table gains "Rate-dependent skin D q" and "s = s' - D q", and the mechanical skin of the partial-penetration split subtracts D q. `wta-1` carries `skin.rate_dependent` (D, D q, the skin without it, the method). New unit kind `nonDarcySkin` (1/(Mscf/D) to 1/(10^3 m3/d)), pinned.
- Validation: route 2 on the published Ahmed Example 6-20 step 4 (F 0.14, k 55 md, h 20 ft, T 600 degR give D = 1.805e-4 per Mscf/D; negative control with 1637 in place of 1422 misses). Route 1 by a round trip through the engine: drawdowns at three rates with skin s + D q, each analysed by the engine's MDH line, recover s and D (negative control: the apparent skin read as the true skin misses by D q). The published example's own Step 5 multiplies D by 20,000 for a rate stated as 20 Mscf/day, so it is not used as a gate.
- Proving tests: engines `welltest.u2RateSkinDatum.test.js` (3 for D); Suite `wellTestU2.test.jsx` U2-003 (2): s and D from two rates, D q 2.50 at 5,000 Mscf/D in the skin table, the PDF, wta-1, D converted under SI; the LIT route equals b k h / (1422 T) with this test's k; a pressure-squared fit gives no D (negative control); one rate gives no line with the data need.
- Numbers: none change until a rate or a pseudo-pressure deliverability fit is entered; goldens unchanged.

### U2-002 Changing wellbore storage, Hegeman first: done (engines-first, PR #311)

- Engine `engines/welltest/models/changingStorage.js`: Fair's wellbore balance q_sf/q = 1 - C_D (dp_wD/dt_D - dp_phiD/dt_D) in Laplace space, p_w = p_sf (1 + C_D u^2 p_phi) / (1 + C_D u^2 p_sf), with p_sf any catalog model at cd = 0. Hegeman p_phiD = C_phiD erf(t_D/alpha_D) (Laplace C_phiD erfcx(u alpha_D/2)/u); Fair p_phiD = C_phiD (1 - exp(-t_D/alpha_D)). The user states C (final), Ci/C and alpha (hours); C_phiD follows from the early-time limit 1/C_iD = 1/C_D + dp_phiD/dt_D(0).
- Catalog: composed ids `<model>+hegeman` and `<model>+fair` (`getModel`, `splitModelId`, `composeModelId`), so every reservoir model takes changing storage, the auto-fit fits Ci/C and alpha, and a fit on one storage model is not reported for another. Saved projects keep their plain ids.
- Studio: Match tab "Wellbore storage" select; the Match tab, the Report tab and the PDF print Ci, C, C_phiD and alpha_D (`changingStorageRows`, one model in the context); the limits row names the model and its check.
- Validation: the 1993 paper's type-curve values were not readable on this box (OnePetro). The model equations were read in Tobing (2008), Lemigas Scientific Contributions 31(2) 40-48, eqs. 2 to 7, which reproduce Fair and Hegeman. Gates (engines `welltest.changingStorage.test.js`, 9): an independent real-time oracle (Fair's balance solved as a Volterra equation, implicit step by step, sharing only the sandface response) within 1 percent at nine times from t_D 1 to 1e6 for three Hegeman cases (decreasing, the hump, skin 5) and one Fair case (observed worst 0.5 percent); C_phiD = 0 equals constant storage to rounding; the early unit slope sits on Ci and the late response on constant storage; erfcx against tabulated erfc; every catalog model composes; Ci/C = 1 reproduces the constant buildup; auto-fit round trip. Negative controls: the Fair kernel against the error-function oracle misses by more than 5 percent, a sign-flipped C_phiD by more than 50 percent.
- Proving test (Suite): `wellTestU2.test.jsx` U2-002 (2): the studio's regression on a Hegeman buildup recovers k and Ci/C, the constant-storage fit leaves more than 20 times the residual (negative control), the PDF prints both storages and the reference, the composed id saves and opens.
- Goldens: one sentence of the limits table changed on purpose in all six (the storage row now says the change can be matched); the .txt diff is that sentence only.

### U2-001 Fluid's pvt-1 table into gas tests: done

- A pvt-1 handoff (router state or `?fluidProject=` by id) now carries its gas columns (pressure, Z, mu_g, ascending) into the project as `pvtIntake.gasTable` with the methods the block names, its span, temperature and range flags (`gasTableFromContract`, `pvtIntakeFromBackbone`). A gas test switches its gas PVT to the table (`reservoirInputs.gasPvtSource = 'fluid-table'`) and takes the block's temperature (`gasTablePatch`); an oil test keeps the table with the project, offered when the test is switched to gas, and its version-1 patch is unchanged. Fluid Systems Studio's RL11 guard now lists the Data panel as the second reader of the saved block (Read it again).
- The analysis builds m(p), z, mu and cg from the table through the engine's supplied-table path (`buildGasPvtTable({ table })`), so nothing is interpolated or integrated outside the engine; the studio names the source (`pvtSource.kind = 'fluid-table'`).
- The correlation path stays for projects without an intake and is one choice away; a payload saved before carries no `gasPvtSource` and opens on the correlations with its numbers.
- A table that stops below pi is refused with a link that asks Fluid Systems Studio for a taller table (`?pvtPMax=`, FLUID-U2-026).
- The shared PVT card shows the table row (method of Z and of viscosity) and "source changed since"; "Read it again" re-reads the project by id and takes the new block (`takeFluidPvt`).
- Report: inputs table "Gas PVT table" row with its span and origin, gas footnote, and a limits row "Gas PVT table range" checking the test pressures against the span (and a temperature mismatch).
- Proving test: `src/components/welltest/__tests__/wellTestU2.test.jsx`, describe U2-001 (4): z, mu at pi equal linear interpolation of the block rows and m(p) at the nodes equals an independent trapezoid of 2p/(mu z) to 1e-10; the earlier correlation value differs (negative control); the PDF names the table and project; old payloads stay on correlations; short table refused; card status As received then Source changed since. Written against code without `takeFluidPvt`, so all four fail on main.
- Numbers: unchanged for every project without a Fluid intake. A gas project that takes a Fluid table moves to the table's z and viscosity (the Fluid sample at 4,800 psia: mu from the table instead of Lee-Gonzalez-Eakin on the Well Test gravity).

### Step 2: the reviewer lens on the new inputs and outputs

| Check | New input or output | How it is met |
|---|---|---|
| RL1 inputs with unit and source | Fluid gas table; datum gradient and reference elevation; apparent skins at other rates; Ci/C and alpha | Inputs table row "Gas PVT table" (span, origin); gradient printed with its stated source; rate-skin points counted in their table; Ci/C and alpha in the model match table |
| RL2 composites show components | s' = s + D q; s = (h/hp) s_d + s_pp + s_theta + D q | Every term its own row in the skin table |
| RL3 lumped results split | Apparent gas skin; deviated well skin | D q and s_theta split off, the method named |
| RL6 every result has its plot | Changing-storage match | Drawn on the log-log and history-match figures (the model overlay) |
| RL7 basis named | Datum pressure; table pressures | "at the datum ... corrected with g psi/ft" in the report and `wta-1`; table span in psia |
| RL8 strengths kept | Regression CIs for Ci/C and alpha | From the fit covariance like every parameter |
| RL9 limits printed | Storage model; slant split; one gradient; table range | Limits rows for storage, well geometry, pressures and the gas PVT table range |
| RL10 import doors | Gauge door in a worker | Same reader, equality test |
| RL11 senders and provenance | `wta-1` pressure point to Material Balance; Fluid intake | Read by id, method and date printed, edits marked; "source changed since" |
| RL12 one model | Changing storage rows, rate skin rows, datum rows | Built once in the context; Report tab and PDF read the same rows |

Units: `pressureGradient` (psi/ft, kPa/m) and `nonDarcySkin` (1/(Mscf/D), 1/(10^3 m3/d)) pinned to known values; the coverage test stays complete.

### Step 2: anything that changes numbers

- Well Test: a project whose perforations carry a longer MD than TVD interval gets a slant pseudo-skin and a different mechanical skin (the reviewed sample at 14.8 degrees: s_theta -0.02, s_d 2.46 to 2.48). k and the total skin never change.
- Well Test: nothing else moves until the user takes a Fluid table, chooses a changing-storage model, enters rate skins or states a gradient.
- `wta-1` readers (Material Balance, Waterflood): `average_psia` is at the datum when the test states a gradient (the basis says so); otherwise unchanged.
- Material Balance: nothing changes until the analyst takes a Well Test pressure point.
- Other apps: none. The engine catalog change (negative skin) only widens the skin bound of eight models.

### Step 2: validation weaker than asked

- U2-002: the published Hegeman, Hallford and Joseph (1993) type-curve values were not readable from this box (OnePetro). The equations were read in Tobing (2008); the gate is an independent real-time oracle within 1 percent plus exact limits and two negative controls, not a published curve.
- U2-003: route 2 is gated on Ahmed Example 6-20 step 4 (D from F); route 1 (the multi-rate line) has no published multi-rate example read; it is gated by an engine round trip.
- U2-007: the correlation agrees with the published Cinco-Ley table within 3 percent for full penetration; for a well both slanted and partly open the additive split is approximate (stated in the report).
- U2-013: no published worked example of a stimulated well on a boundary or dual-porosity model was read; the gates are exact properties of the solutions.
- U2-010: the heartbeat measurements are from one box under load (97 to 203 ms with the worker, 5.7 s without).

### Step 2: owner items

- Merge engines PR #311 after review; then re-pin the Suite and remove the 12 `welltest-u2` ledger rows.
- The Papatzacos comparison with the Cinco-Ley table (centred intervals 0.3 to 1.6 skin units higher) is worth a look when the SPE-13956-PA paper arrives (U2-012).

## Validation weaker than asked

- DAK is gated against chart readings and the canonical engine only; the Well Test route itself has no published PTA gas example on DAK (the Ahmed examples in the harness use supplied tables).
- The partial-penetration split remains on its oracle band (no published example read).
- The plain-node validation harness (`tools/validation/welltest/run-validation.mjs`) can no longer import `gas.js` under node 18 (it imports a .ts file); jest covers the same gates; the harness needs esbuild to run CASE 9 onward. Not in CI before or after.
- The 388,800-reading timing is one run on a shared box.
- The tests of 004 to 008 and 014 were written alongside their fixes; 001, 002, 003, 009, 010, 017, 018 and 019 were run red first.
