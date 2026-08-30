# NextGen Reservoir Engineering Courses — Phased Build Plan (RC series)

Status: **DRAFT awaiting owner sign-off** (2026-08-27). Successor to
`NextGen-Geoscience-Courses-PLAN.md` (NG series, complete: 10 apps x 3
tiers) and to the geoscience deep-course program (DC1-DC31, complete
2026-08-25: 30 active deep structures, 3958 quiz questions). This plan
covers the second module of the academy: **Reservoir Engineering**
(`academy_apps.module = 'reservoir'`, already in the 12-module homepage
taxonomy and `academyModules.js`).

The single biggest structural lesson from geoscience is applied here
from day one: **build deep from the start.** Geoscience shipped shallow
4-6-stub-lesson courses first (NG series) and then rebuilt every tier
to the owner's depth standard in a second 31-wave program (DC series).
The RC series ships each course AT the depth standard on first
delivery: one wave = one app = catalog row + learning page + panels +
three capstones + three deep tiers, seeded and probed exactly like
DC26-DC31.

## 1. Starting position (all verified 2026-08-27)

- **The academy spine is generic and battle-tested.** Entitlements,
  four doors, fees, prereq gate, tier-fee integrity, ladder
  progression (intermediate needs a live SAME-APP Associate cert,
  advanced needs Professional), deep-course chassis
  (`academy_course_structures`, `academy_lesson_progress`,
  `academy_quiz_questions` server-only, `academy_quiz_attempts`,
  sequential unlock, 75%/70% gates, cooldowns), capstone machinery,
  certificates v2, renewal, and the Expert Suite-bridge (50% module
  discount) all work for any `(app, tier)` with zero spine SQL.
- **A new course costs**: 1 catalog row + 3 capstone seeds + 1
  learning page + teaching lib + panels + 3 deep-tier content trees +
  3 generator-emitted seed migrations (132 questions each).
- **Central engines already cover five reservoir domains**
  (`@petrolord/engines`, consumed by both products at
  `packages/engines`):
  - `engines/dca` — Arps exponential/hyperbolic/harmonic fitting with
    standard errors, EUR at economic limit, forecasts, type curves,
    group rollup, EUR Monte Carlo. Fixtures: SPEE REP #6 + Ahmed
    Ch. 16 literature fixtures (`test-data/dca`). The
    ReservoirEngineering-Module.md §3 oracle-test gate for the DCA
    course was CLEARED 2026-07-18.
  - `engines/mbal` (TypeScript) — the server material-balance engine
    (oil + gas cap + aquifer history match, drive indices) validated
    against Pletcher SPE 75354, Ahmed Ex. 10-10 (Fetkovich), Ahmed
    Ex. 11-1 (combination drive); plus `engines/aquifer` (vEH /
    Fetkovich / Carter-Tracy incl. finite-reD pD) with the Dake
    Exercise 9.2 golden (`test-data/mbal`, `test-data/aquifer`).
  - `engines/scal` — Corey/tabular rel-perm, Buckley-Leverett/Welge
    fractional flow and displacement, LM-fitted Corey, J-function Pc,
    saturation-height. Golden: Leverett (1941).
  - `engines/waterflood` — VRR ledger, surveillance (Hall, Chan,
    injection-response lags), layered sweep, pattern forecast (the one
    sanctioned cross-domain import of scal's `analyzeDisplacement`).
    Fixture: `test-data/waterflood/vrr-ledger-fixture.json`.
  - `engines/sim` — Eclipse deck generation (grid/PVT/sat-fn/schedule
    emitters + composer, reference spec, well paths, trajectory
    connections) from the Suite's S0-S5 simulation program.
- **Not yet central** (each is an extraction gate, not a course
  blocker for wave 1): fluid/PVT (Fluid Systems Studio math),
  pressure-transient analysis (only the `lib/welltest` numerics are
  central), RF Estimator, EOR screening, risked reserves.
- **Doctrine constraints** (NextGen-Academy-PLAN §1, binding): one app
  = one course; three tiers = Associate/Professional/Expert; teaching
  datasets ARE the validation goldens; server-side grading against
  oracle truth within stated tolerance; prereqs SHALLOW; RLS-first;
  fees per school (reservoir apps price as `subsurface`:
  ₦60k/₦120k/₦200k unless the owner says otherwise).

## 2. Course roster and build order

Five courses are engine-ready today. Build order = engine-and-fixture
readiness order (which is also a sensible teaching order once Fluids
arrives later as the recommended-first course).

| # | Course (slug) | Central engine(s) | Suite app(s) covered | Anchor references |
|---|---|---|---|---|
| RC1 | Decline Curve Analysis & Forecasting (`dca`) | dca | Decline Curve Analysis, Forecast Scenario Hub | SPEE REP #6, Ahmed Ch. 16 |
| RC2 | Material Balance (`mbal`) | mbal + aquifer | Reservoir Balance / Material Balance Studio, Aquifer Influx Calculator | Dake Ch. 9 (Ex. 9.2), Ahmed Ex. 10-10 / 11-1, Pletcher SPE 75354 |
| RC3 | SCAL & Displacement (`scal`) | scal | SCAL Studio, Fractional Flow Calculator | Leverett 1941, Buckley-Leverett/Welge |
| RC4 | Waterflood Management (`waterflood`) | waterflood (+scal edge) | Waterflood Design Studio, VRR Monitor | VRR ledger fixture, Hall/Chan |
| RC5 | Reservoir Simulation Essentials (`sim`) | sim | Reservoir Simulation Studio | engines referenceSpec + deck goldens |

Follow-on courses, each gated on its engine landing in
`@petrolord/engines` with goldens first (the NG11a pattern —
extraction PR precedes the course):

- **RC6 — Fluid Properties & PVT** (Fluid Systems Studio; the
  recommended FIRST course of the learner path once it exists).
- **RC7 — Well Test Analysis** (PTA on the Suite's Well Test Analysis
  Studio; `lib/welltest` numerics are already central, the PTA domain
  itself is not).
- Screening-scale apps (RF Estimator, EOR Screening, Risked Reserves
  Valuation) are **not standalone courses**: their material is
  absorbed as lessons/modules where it belongs (RF screening into
  RC2/RC5 context, EOR screening into RC4 Expert, risked reserves
  into RC1 Expert alongside EUR Monte Carlo). Forecast Scenario Hub
  workflows are RC1 Professional/Expert material. (Owner Q1 below.)

**Sequencing note (RC5):** the sim course teaches deck construction
and QC against the engine's reference spec, which is fully central and
testable. It does NOT depend on the Suite's simulation worker being
live, but course copy must not promise run-your-deck until the Suite
sim launch completes (worker gate checks are still pending as of
2026-08-27). If that feels premature, RC5 slides behind RC6.

## 3. The teaching field: Ekene goes dynamic

Geoscience built everything on the Ekene field (4-6 well section,
25x20 x 100 m frame, TOP_SAND/BASE_SAND, NG5 booking: 169 oil cells at
OWC 1560, STOIIP 12.139208 MMstb, NTG 0.8 / phi 0.20 / Sw 0.35 /
Bo 1.2). The RC series **puts Ekene on production**: one fixture
package (`test-data/ekene-dynamic` in petrolord-engines, PR'd before
RC1 ships) holds the field's dynamic life —

- synthetic-but-engine-exact rate histories per well (Arps truth with
  known qi/Di/b per well, so DCA fits recover planted parameters the
  way NG6 seismic recovered the planted +8 ms lag);
- a pressure/production history consistent with the NG5 tank (the
  mbal history match recovers a STOIIP consistent with the volumetric
  12.139 MMstb — the volumetrics-vs-material-balance reconciliation
  IS the RC2 capstone story);
- Corey/Pc curves for the Ekene sand (RC3), a five-spot pattern layout
  and injection ledger (RC4), and the deck-ready grid = the DC12 earth
  model frame (RC5).

Literature fixtures (Dake, Ahmed, SPEE, Leverett, Pletcher) remain the
VALIDATION anchors inside each course; Ekene is the narrative teaching
field that makes the six-course arc one story. Every Ekene dynamic
number is generated BY the central engines and committed as goldens
(teaching datasets ARE the goldens), with the generator script in the
engines repo.

## 4. Per-wave shape (deep from day one)

Each RC wave is one app, delivered complete:

1. **Truth digest first.** A `RCn-TRUTH.md` written by running the
   ACTUAL central engines in Node (alias loader,
   `--experimental-specifier-resolution=node`); every number that will
   appear in a lesson, bank, or capstone is derived there. No number
   reaches content that was not re-derived this wave.
2. **Catalog + capstones + learning page** (NG-style): catalog row
   with `module='reservoir'` and `path_order` set, capstone seeds for
   all three tiers (oracle `expected`/`tol` server-side only),
   scope-gated learning page with TRAINING watermark driving the real
   engine.
3. **Three deep tiers** to the owner-locked depth standard
   (`src/content/README.md`): per tier 6 modules x 4-6 lessons
   (600-1200 words, worked example + exercise each), 15+ question
   module banks, 40+ question final exam, capstone stays the graded
   practical. Repo-markdown content, permanent keys, panels
   registered in `panelRegistry.js`, panel math in a teaching lib
   pinned by vitest to the live capstone oracle.
4. **Generator-emitted seed migrations** (one per tier), applied
   ladder order (Associate before Professional dry run — the DC22/23
   ordering rule), each dry-run + canaried + probed + logged.
5. One PR per app (or per tier-pair, DC26-31 style), squash-merged,
   verified byte-identical to the reviewed tip.

## 5. Standing rules (the geoscience lessons, now binding)

### Content

- **Read the shipped tier below before briefing a higher tier** and
  list what it already owns (the DC18 tier-positioning trap: two of
  six drafted modules re-taught the Associate tier's material).
- **Derive every number.** Drafted-from-memory numbers were wrong
  three times in DC22/23 alone; re-derivation caught all of them
  before seeding. Rounded ratios never enter a truth digest unless
  marked prose-only, or a bank question will key on them.
- **Scope-rule the division of labour up front** per app (the DC12
  precedent: container vs STOIIP). For RC: valuation stays with
  Economics (R5 split — RC1's case economics stay deliberately
  "indicative"); volumetrics stays with ReservoirCalc (RC2
  reconciles against it, never re-derives it); displacement physics
  lives in RC3 and RC4 imports it (mirroring the one sanctioned
  engine cross-import).
- **Teach the precision honestly.** Float32 accumulators, tolerance
  traps, method spreads (Carter-Tracy vs vEH ~±10% on Dake 9.2) are
  lesson material, not noise to paper over — the g=9.80665 and
  float32-chain lessons were among geoscience's best.
- **No em dashes** in any lesson markdown (content lint fails the
  build). Never quote engine source comments into lessons without
  checking (lasParse.js precedent).

### Assessment banks (all mechanical, run before EVERY seed)

- **Length-rank gate**: correct-option length rank 0 (longest) and
  rank 3 (shortest) each at or below ~25-30% of the bank. Do NOT
  chase an even four-way split (the DC12 inversion: driving
  longest-correct to zero made shortest-correct the exploit).
- **Similarity within the SERVED pool** (each module bank alone; the
  42-question exam pool): Jaccard duplicate check; cross-module
  repeats of a graded value are acceptable, within-pool ones are not.
- **Answer-key spread** by swapping options; then re-run the length
  check (swaps change tie-break order). Before permuting options,
  rewrite any explanation that names an option by position.
- **Edit banks by prompt substring, never by array index** (three
  DC21 exam answers were clobbered by a stale index listing).
- **Tier-leakage check**: no Expert graded values in the Professional
  bank; a tier's early modules exclude its own later values.
- Toolkit preserved at `/root/dc-deep-toolkit` (bankcheck.py with the
  rank-0/3 gate, bands.py, need.py, setopt2.py, keyspread.py,
  simcheck.py, dupcheck/semdup, gen_migration.py, mkprobes.py).

### Database discipline

- Structure keys are PERMANENT; `enforced_from` grandfathers existing
  enrollments; seed migrations are generator-emitted, never
  hand-typed.
- **Dry run = rollback-wrapped migration + probes + canary.**
  `supabase db query --linked` swallows `raise notice`, so every dry
  run is canary-verified (break one assertion, confirm the error text
  returns). Use `-f <file>` (sidesteps the leading-`--` parse bug and
  the ~110KB argv ceiling).
- **The live apply runs the migration ALONE.** Learner-path probes
  committed by an apply once left a fabricated certification on the
  owner's account (DC18 incident). Post-apply verification is
  read-only.
- Probe learners are fabricated fresh in-transaction via
  `request.jwt.claims` (DC19 pattern) — never probe through a real
  account. Ladder-backstop certs use CERT vocabulary
  (associate/professional/expert), not course tiers (the DC28 rollback).
- Intermediate seeds probe: same-app Associate cert required for
  enrollment, AND the tier below undisturbed (132 questions) after
  apply. Apply one course per run.
- Every applied migration gets a MIGRATIONS.md row and a pentest doc
  (`migrations/docs/rcN-...-pentest.md`).
- **Map `academy_apps.module` in the catalog row from the start** —
  the Expert bridge trigger issues no Suite discount code for an
  unmapped module. The Suite-side match is case-insensitive on
  `master_apps.module` = 'Reservoir'; verify one live round-trip
  before the first real Expert cert (Owner Q4).

### Process

- Parallel fork agents per module + one exam fork, with NAME-SCOPED
  scratchpad filenames (two DC13 authors overwrote each other's
  script); git worktrees with symlinked node_modules for parallel
  app waves (DC26-31); the parent serializes ALL database contact.
- When agents die mid-wave, preserve partials on a `wip/` branch plus
  a /root copy, and resume with explicit model overrides.
- Merge discipline (both repos): squash-only main, retarget stacked
  PRs via `gh api -X PATCH` (gh pr edit silently no-ops), `git rebase
  --onto origin/main`, force-push to fire CI, verify merged main
  byte-identical to the reviewed tip. Prefer basing on MAIN (no
  stacks) as DC7+ did.
- Check `git log` timestamps and file mtimes in the nextgen worktree
  before resuming "dropped" work (the two-live-sessions incident).

## 6. Per-course definition of done

Unchanged from the NG plan §3, plus the deep standard:

1. Three capstone oracles independently reproduced from
   `@petrolord/engines` in Node BEFORE seeding, recorded in the
   pentest doc.
2. All three tier structures + banks live, each 132 questions, bank
   QA gates passed and recorded.
3. Learning page + panels live; panel math vitest-pinned to the live
   capstone oracle; content lint, vitest, eslint, build green.
4. Live RLS pentest per seed: answer keys unreadable, ladder enforced,
   pass issues exactly one certificate, public verification works,
   zero probe residue.
5. Catalog/EnrollPage/homepage consistent; MIGRATIONS.md +
   STATUS/pentest docs updated.

## 7. Owner questions (decide before the affected wave)

- **Q1 (roster, before RC1):** confirm the five-course wave-1 roster
  and the absorb-don't-course treatment of RF Estimator, EOR
  Screening, Risked Reserves, and Forecast Scenario Hub.
- **Q2 (path + prereq, before RC1):** recommended learner order once
  complete is Fluids → DCA → Material Balance → SCAL → Waterflood →
  Well Test → Simulation. Recommendation: **no hard prerequisite
  inside the reservoir module** (the geoscience WDM hard gate existed
  because every course reads the well registry; reservoir fixtures
  are self-contained) and no cross-module gate on the geoscience
  ladder — the ReservoirCalc/geoscience material is "recommended",
  surfaced on the enroll page. Confirm or set a gate.
- **Q3 (fees, before RC1):** reservoir courses price at the
  subsurface school schedule (₦60k/₦120k/₦200k, $40/$80/$130).
  Confirm.
- **Q4 (bridge, before the first Expert cert):** Expert certs in
  `module='reservoir'` should discount the Suite Reservoir module at
  50%. Confirm, and run one disposable-cert E2E against Suite
  checkout (the NG7 procedure) before the first real Expert sale.
- **Q5 (RC5 timing):** ship Simulation Essentials in wave 1 (deck
  literacy, no run-your-deck promise) or hold it behind the Suite sim
  worker launch and RC6 Fluids.

## 8. Non-goals

- No engine forks or re-implementations in NextGen; new reservoir
  engine math (PVT, PTA) lands in petrolord-engines with goldens
  FIRST, per the runway pattern.
- No shallow tiers, ever — nothing ships below the depth standard.
- No new Monte Carlo/NPV implementations (CLAUDE.md rule): RC1's EUR
  uncertainty teaches through `engines/dca/monteCarlo`; valuation
  stays indicative and hands off to Economics.
- No cohort features until the first cohort intake (unchanged).

## 9. RC7 as built (Well Test Analysis, 2026-08-30)

The seventh course, and the second to need an extraction gate opened
first. Recorded here because sections 2 and 7 named RC7 as gated and
did not describe it.

**The gate.** petrolord-nextgen PR #73 vendored a central
`engines/welltest`: the straight-line analyses (MDH, Horner,
multi-rate, Cartesian pseudo-steady state, sqrt-time), the Bourdet
derivative with its regime classifier, superposition and the buildup
time transforms, a twelve-model analytical catalog inverted from
Laplace space by Stehfest, Levenberg-Marquardt auto-fitting against
pressure AND derivative in log space, real-gas pseudo-pressure and
deliverability, and rate transient analysis. 5504 lines of goldens
generated by an independent stdlib Python oracle, plus twelve test
files.

**The subject.** One reservoir under ten fixtures (phi 0.18, mu 0.9 cp,
ct 1.2e-5 /psi, rw 0.354 ft, h 45 ft, B 1.25 rb/stb, q 450 stb/d,
pi 4800 psia), so a number learned in one lesson still means the same
thing in the next. This is the Ekene principle applied to a different
engine: the field itself does not appear, because the welltest goldens
predate the RC series and re-planting them would have discarded the
Python oracle that makes them trustworthy.

**Tier ownership.**

- Associate: the classical straight line, ending in the window walk,
  where the same forty shut-in pressures fitted five ways move the
  permeability by a factor of 3.6750288362649663 and invert the sign of
  the skin while r squared climbs to 0.9997.
- Professional: the derivative as the diagnosis, the engine's own
  regime classifier read honestly (it names a transition as a regime on
  six of the seven fixtures), and the boundary gallery.
- Expert: the regression and its limits, rate history, gas, and rate
  transient analysis, with m06 carrying the refusals.

**The scope decision, in the section 6 form.** The engine has no
deconvolution, no interference or multi-well analysis, and no way to
split a gas well's apparent skin into its Darcy and non-Darcy parts.
Expert m06 teaches all three with their mechanisms and their value
stated, and grades none of them. `20260830_rc7_welltest_go_live.sql`
asserts it by refusing to run if any capstone field key mentions them,
which is the RC6 device reused.

**A second assertion this course needed.** Fitting the sealing-fault
model to the buildup, which has no boundary in it, converges on a fault
at about 3100 ft with a 40 ft confidence interval. Writing the same
pressure change an arithmetically equivalent way, a difference of at
most 4.547473508864641e-13 psi, moves that fault 116.33147724595392 ft
to a non-overlapping interval, while the permeability does not move at
all. The result is taught at Expert m02 l02 and is deliberately not
graded, because no learner could reproduce it. The go-live refuses any
Expert field grading a distance above 1500 ft, so the phantom cannot be
seeded by a later edit.

**The collision check earned its place again.** The drainage area in
acres, 64.28165910874567, sits 0.0041 from the Expert tier's equivalent
producing time of 64.28571428571429 and inside its 0.005 tolerance, so
a Professional answer would have scored full marks on an Expert field.
Caught at design time by the pairwise check in section 5, before any
migration existed. The area is graded in square feet instead, and the
go-live asserts the unit.

**Standing rule to add to section 5.** Where a graded field comes from a
regression rather than from a closed form, perturb the input data at the
last bits and refit before grading it. A parameter the data do not
constrain is decided by rounding, and its confidence interval reports on
the optimiser rather than on the reservoir. That check cost two runs and
it moved one field out of the Expert capstone.
