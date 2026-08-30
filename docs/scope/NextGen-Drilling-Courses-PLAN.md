# NextGen Academy: Drilling & Completions course series (DR1-DR12)

Plan of record for the academy's THIRD module, after Geoscience (10
courses, live) and Reservoir Engineering (7 courses, seeded). Written
2026-08-30, after RC7 landed and was seeded.

Authority: this document. The recall hook is the
`nextgen-drilling-courses-program` memory.

## 1. Starting position (verified 2026-08-30)

**The engine is already there.** `packages/engines/engines/drilling` is
vendored into petrolord-nextgen: 25 modules, about 6980 lines, plus 8
reference data catalogs, and `test-data/drilling/goldens` holds 23
golden files. No extraction gate has to be opened, which is what made
RC6 and RC7 slow.

| module | lines | golden |
|---|---|---|
| profileDesign, surveyMath, surveyProgram, segmentCompiler | 1030 | survey_table, arc_vertical_plane, sprofile_cases, compile_buildhold, tvd_crossings, ade_ch8_survey_methods |
| antiCollision, errorModel, magnetics | 1186 | iscwsa_mwd_rev4_well1, iscwsa_clearance_wells, toolface_sphere, wmm2025_noaa_testvalues |
| rheology, hydraulics, surgeSwab, holeCleaning | 566 | hydraulics_cases, chc_cases |
| torqueDrag, casingWear, data/tubulars | 629 | torquedrag_cases, casingwear_cases |
| wellControl | 264 | wellcontrol_cases |
| cementing | 406 | cementing_cases |
| geomech | 409 | geomech_cases |
| tubularDesign | 359 | tubular_cases |
| completionDesign | 258 | completion_cases |
| perforation, sandControl | 407 | perfsand_cases |
| fracDesign, acidizing | 239 | stim_cases |
| wellIntegrity, plugAbandonment | 489 | wellintegrity_cases |
| wellCost | 272 | wellcost_cases |

Every one of the twelve Suite apps has engine backing and golden
coverage. That is a different starting position from RC1, which had to
plant a whole dynamic field first.

**The Suite side is finished.** Drilling-ROADMAP.md's twelve apps are
all built, merged and launched (2026-08-28), with 12 Active tiles live.
Each carries a STATUS doc and a validation gate set (A10 to A33), and
several carry ARMED literature gates awaiting owner PDFs. The courses
teach what the apps already do.

**The academy catalog** holds 17 courses: 10 geoscience at path_order 1
to 10 (all `available`), 7 reservoir at 11 to 17 (all `coming_soon`,
held on one production upload). Drilling takes 18 to 29.

## 2. Course roster and build order

One app, one course, per academy doctrine. Unlike RC, nothing is
absorbed: every one of the twelve has a real engine and its own goldens,
and none is screening-scale.

| wave | slug | course | path_order | Suite app |
|---|---|---|---|---|
| DR1 | `welldesign` | Well Design & Surveys | 18 | Well Design Studio |
| DR2 | `torquedrag` | Torque, Drag & Casing Wear | 19 | Torque & Drag Studio |
| DR3 | `hydraulics` | Drilling Fluids & Hydraulics | 20 | Drilling Fluids & Hydraulics Studio |
| DR4 | `wellcontrol` | Well Control | 21 | Well Control Studio |
| DR5 | `geomech` | Geomechanics & Wellbore Stability | 22 | Geomechanics Studio |
| DR6 | `casingtubing` | Casing & Tubing Design | 23 | Casing & Tubing Design Studio |
| DR7 | `cementing` | Cementing | 24 | Cementing Studio |
| DR8 | `completion` | Completion Design | 25 | Completion Design Studio |
| DR9 | `perfsand` | Perforation & Sand Control | 26 | Perforation & Sand Control Designer |
| DR10 | `stimulation` | Stimulation Design | 27 | Stimulation Designer |
| DR11 | `integrity` | Well Integrity & P&A | 28 | Well Integrity & P&A Studio |
| DR12 | `wellcost` | Well Cost & Time | 29 | Well Cost & Time Estimator |

**Build order is the well's own order**, which is also the order the
Suite built them in and the order the data flows: you cannot compute
torque and drag without a trajectory, cannot compute ECD without a hole
geometry, cannot size a kill sheet without a mud window, cannot design a
completion without a casing program.

**`welldesign` is the path root.** Every other course's fixtures sit in
a wellbore that course defines.

**No hard prerequisite inside the module**, matching the reservoir
module's owner decision Q2. The ladder is recommended, not enforced.

**Fees**: subsurface school, as reservoir (N60k / N120k / N200k).

**Bridge**: `module = 'drilling'` on the catalog row from day one, so
the Expert certificate's Suite discount trigger maps to the Drilling
module.

## 3. The teaching field

The drilling goldens are NOT the Ekene field. They predate the RC series
and they carry an independent Python oracle each, which is what makes
them trustworthy; re-planting them on Ekene would discard that.

So the series does what RC7 did: **one wellbore carries the module.**
DR1 fixes it from the golden survey and profile fixtures, and every
later wave runs its own engine over the SAME geometry, so a depth or a
hole size learned in one course still means the same thing in the next.
Where a wave's golden case uses a different geometry, the course says so
and says why.

## 4. Per-wave shape

Unchanged from the reservoir series, because it works:

- 6 modules, 26 lessons, per tier. 78 lessons a wave.
- 132 questions a tier: 15 per module bank plus a 42-question exam.
- 3 capstones, 6 graded fields each, all engine-derived.
- 3 panels over ONE teaching lab per course, with the lab's every
  exported value pinned by a vitest file against the wave truth digest.
- A learning page at `/dashboard/apps/<slug>` and its route.
- 5 migrations: course + capstones, three deep seeds, a HELD go-live.

## 5. Standing rules carried forward

Everything in NextGen-Reservoir-Courses-PLAN.md section 5 applies. The
additions the RC series earned, in the order they were learned:

- **Check graded fields against each other** with the pairwise
  tolerance-collision check, at design time, before any migration
  exists. RC4 and RC7 both caught a real collision this way.
- **Sweep lessons AND banks** for a higher tier's graded values, and for
  a course's own answers.
- **Every long literal must resolve** to a value the wave derived by
  running the engine. Recover engine constants rather than whitelisting
  them.
- **A derived-from-derived number takes the raw double.**
- **Use `plan_lengths.py`, not an iterative rebalance loop**, and spread
  distractor lengths at draft time.
- **Keep exam prompts distinct from module-bank prompts** across the
  whole wave.
- **A go-live migration can assert a scope decision.**
- **RC7's addition: where a graded field comes from a REGRESSION rather
  than a closed form, perturb the input data at the last bits and refit
  before grading it.** A parameter the data do not constrain is decided
  by rounding, and its confidence interval reports on the optimiser.

## 6. Per-course definition of done

1. Truth digest derived by running the vendored engine, and a verifier
   that recomputes every graded field independently.
2. Pairwise collision check over the 18 fields: zero fatal.
3. 78 lessons, content lint green, zero em dashes.
4. 396 questions, every bank inside its gates, zero duplicate prompts
   across the wave.
5. Teaching lab pinned by vitest; panels and learning page eslint-clean
   after any generation by substitution.
6. Leakage sweep and numeric sweep clean over lessons and banks.
7. Migrations applied alone, in ladder order, with a canary after each
   and a read-back canary over all 396 rows.
8. Go-live HELD, its assertion block run alone and PROVED by a
   deliberate failure.
9. STATUS or roadmap doc updated; MIGRATIONS.md logged.

## 7. Non-goals

- No engine changes without a golden and an oracle. Where a course finds
  a defect, it goes to petrolord-engines or the Suite as its own PR with
  its own guard, as RC7's classifier fix did.
- No new Monte Carlo implementation for DR12: the canonical
  `MonteCarloEngine.js` is the CLAUDE.md rule and `wellCost` already
  uses it.
- No shallow tiers.
- The go-lives stay HELD. Drilling's twelve courses join the seven
  reservoir ones behind a single production upload.
